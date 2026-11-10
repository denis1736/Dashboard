"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { Landmark } from "lucide-react";
import { balanceAt, buildSchedule, loanStatus } from "@/lib/calc/loans";
import { monthIndex, yearOf } from "@/lib/calc/dates";
import { dateDE, eur, eur2, eurCompact, inDays, pct } from "@/lib/format";
import { LOAN_TYPE_LABEL } from "@/lib/types";
import { BarChart, LineChart, S } from "@/components/charts";
import { usePf } from "@/components/blocks";
import { Badge, Card, cx, Empty, Meter, PageHeader, Stat } from "@/components/ui";
import { DebtService } from "@/components/debt-service";
import { ReportButton } from "@/components/report-button";

export default function Finanzierung() {
  const { pf, today } = usePf();
  const router = useRouter();
  const year = yearOf(today);

  const rows = useMemo(
    () => pf.loans
      .map((l) => ({ l, st: loanStatus(l, today), p: pf.properties.find((p) => p.id === l.propertyId) }))
      .sort((a, b) => a.l.fixedUntil.localeCompare(b.l.fixedUntil)),
    [pf, today],
  );
  const active = rows.filter((r) => r.st.balance > 0.005);
  const sum = (f: (r: (typeof rows)[number]) => number) => active.reduce((s, r) => s + f(r), 0);
  const debt = sum((r) => r.st.balance);
  const principal = rows.reduce((s, r) => s + r.l.principal, 0);
  const avg = debt > 0 ? sum((r) => r.st.balance * r.st.ratePct) / debt : 0;

  const ladder = useMemo(() => {
    const by = new Map<number, number>();
    for (const r of active) if (r.st.monthsToFixedEnd >= 0) by.set(yearOf(r.l.fixedUntil), (by.get(yearOf(r.l.fixedUntil)) ?? 0) + r.st.balanceAtFixedEnd);
    const to = Math.max(year, ...by.keys());
    const labels: string[] = [], values: number[] = [];
    for (let y = year; y <= to; y++) { labels.push(String(y)); values.push(by.get(y) ?? 0); }
    return { labels, values };
  }, [active, year]);

  const path = useMemo(() => {
    const schedules = pf.loans.map((l) => ({ l, rows: buildSchedule(l) }));
    const labels: string[] = [], values: number[] = [];
    for (let y = year; y <= year + 25; y++) {
      const idx = y === year ? monthIndex(today) : monthIndex(`${y}-12-01`);
      const v = schedules.reduce((s, x) => s + balanceAt(x.l, x.rows, idx), 0);
      labels.push(y === year ? "heute" : String(y));
      values.push(v);
      if (v <= 0.005) break;
    }
    return { labels, values };
  }, [pf, today, year]);

  if (pf.loans.length === 0) {
    return (<><PageHeader title="Finanzierung" /><div className="card"><Empty icon={<Landmark size={22} />} title="Keine Darlehen erfasst" text="Darlehen legen Sie beim jeweiligen Objekt im Reiter Finanzierung an." /></div></>);
  }

  return (
    <>
      <PageHeader title="Finanzierung" sub="Restschulden, Kapitaldienst und Zinsbindungen des gesamten Bestands.">
        <ReportButton kind="darlehen" label="Darlehensübersicht" />
      </PageHeader>

      <div className="card rise rise-1 mb-4 grid grid-cols-2 gap-x-6 gap-y-6 p-5 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Restschuld" value={eurCompact(debt)} hint={`von ${eurCompact(principal)}`} tone="accent" />
        <Stat label="Getilgt" value={pct(principal > 0 ? ((principal - debt) / principal) * 100 : 0)} hint={eurCompact(principal - debt)} />
        <Stat label="Monatsrate" value={eur(sum((r) => r.st.payment))} hint="Zins und Tilgung" />
        <Stat label="Ø Sollzins" value={pct(avg, 2)} hint="nach Restschuld gewichtet" />
        <Stat label="Zinsen, 12 Monate" value={eurCompact(sum((r) => r.st.next12.interest))} />
        <Stat label="Tilgung, 12 Monate" value={eurCompact(sum((r) => r.st.next12.principal))} hint="Vermögensaufbau" />
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="rise rise-2 lg:col-span-5" eyebrow="Restschuld bei Bindungsende" title="Zinsbindungsleiter">
          <BarChart ariaLabel="Auslaufende Restschuld je Jahr" labels={ladder.labels} series={[{ key: "b", label: "Auslaufende Restschuld", color: S.gold, values: ladder.values }]} />
        </Card>
        <Card className="rise rise-2 lg:col-span-7" eyebrow="Bei unveränderten Annahmen" title="Restschuldverlauf">
          <LineChart ariaLabel="Restschuld des Bestands je Jahr" labels={path.labels} series={[{ key: "d", label: "Restschuld", color: S.gold, values: path.values, area: true }]} height={240} />
        </Card>
        <Card className="rise rise-3 lg:col-span-12" eyebrow="Nächste 20 Jahre" title="Zins und Tilgung je Jahr">
          <DebtService loans={pf.loans} from={year} />
        </Card>

        <Card className="rise rise-4 lg:col-span-12" pad={false} title="Darlehen">
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Darlehen</th><th className="r">Restschuld</th><th>Getilgt</th><th className="r">Zins</th><th className="r">Rate</th><th>Zinsbindung</th><th className="r">Restschuld dann</th><th className="r">Mehrzins p. a.</th></tr></thead>
              <tbody>
                {rows.map(({ l, st, p }) => {
                  const extra = l.followUpPct !== undefined ? (st.balanceAtFixedEnd * (l.followUpPct - st.ratePct)) / 100 : 0;
                  return (
                    <tr key={l.id} className="cursor-pointer" onClick={() => router.push(`/objekte/${l.propertyId}`)}>
                      <td className="min-w-[220px]"><span className="font-medium">{l.lender}</span>{l.label && <span className="text-text-2"> · {l.label}</span>}<div className="text-[12px] text-muted">{p?.name} · {LOAN_TYPE_LABEL[l.type]}</div></td>
                      <td className="r">{eur(st.balance)}</td>
                      <td className="min-w-[120px]"><Meter value={st.repaidPct} label="Getilgt in Prozent" /><div className="tnum mt-1 text-[12px] text-muted">{pct(st.repaidPct)}</div></td>
                      <td className="r">{pct(st.ratePct, 2)}</td>
                      <td className="r">{eur2(st.payment)}</td>
                      <td className="whitespace-nowrap">{dateDE(l.fixedUntil)}<div className="text-[12px]">{st.monthsToFixedEnd < 0 ? <span className="text-muted">abgelaufen</span> : st.monthsToFixedEnd <= 12 ? <Badge tone="bad">{inDays(Math.round(st.monthsToFixedEnd * 30.4))}</Badge> : <span className="text-muted">{inDays(Math.round(st.monthsToFixedEnd * 30.4))}</span>}</div></td>
                      <td className="r">{eur(st.balanceAtFixedEnd)}</td>
                      <td className={cx("r", extra > 0 && "text-bad")}>{l.followUpPct === undefined ? "–" : `${extra > 0 ? "+" : ""}${eur(extra)}`}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot><tr><td>Summe</td><td className="r">{eur(debt)}</td><td /><td className="r">{pct(avg, 2)}</td><td className="r">{eur2(sum((r) => r.st.payment))}</td><td /><td /><td /></tr></tfoot>
            </table>
          </div>
          <p className="border-t border-line px-5 py-3 text-[12px] text-muted">Mehrzins p. a.: Zinsdifferenz zum angenommenen Anschlusszins auf die Restschuld bei Bindungsende, im ersten Jahr der Anschlussfinanzierung.</p>
        </Card>
      </div>
    </>
  );
}
