"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpRight, Building2, Plus, SlidersHorizontal } from "lucide-react";
import { useStore } from "@/lib/store";
import { portfolioMetrics, propertyMetrics, wealthHistory } from "@/lib/calc/metrics";
import { deadlines, insights } from "@/lib/calc/deadlines";
import { loanStatus } from "@/lib/calc/loans";
import { yearOf } from "@/lib/calc/dates";
import { eur, eurCompact, pct, signedEur } from "@/lib/format";
import { DEFAULT_WIDGETS, PROPERTY_TYPE_LABEL, type WidgetKey } from "@/lib/types";
import { BarChart, LineChart, S } from "@/components/charts";
import { CashflowCascade, DeadlineList, InsightList, usePf } from "@/components/blocks";
import { Badge, Button, Card, cx, Empty, IconButton, Meter, Modal, Stat, Toggle } from "@/components/ui";
import { PropertyForm } from "@/components/forms";
import { useRouter } from "next/navigation";

const WIDGETS: Record<WidgetKey, { label: string; span: string }> = {
  kennzahlen: { label: "Kennzahlen", span: "lg:col-span-12" },
  vermoegen: { label: "Vermögensentwicklung", span: "lg:col-span-7" },
  cashflow: { label: "Cashflow-Kaskade", span: "lg:col-span-5" },
  hinweise: { label: "Hinweise", span: "lg:col-span-6" },
  fristen: { label: "Nächste Fristen", span: "lg:col-span-6" },
  zinsbindung: { label: "Zinsbindungsleiter", span: "lg:col-span-5" },
  objekte: { label: "Objekte", span: "lg:col-span-7" },
};

const greeting = () => {
  const h = new Date().getHours();
  return h < 11 ? "Guten Morgen" : h < 18 ? "Guten Tag" : "Guten Abend";
};

export default function Dashboard() {
  const { pf, today } = usePf();
  const setSettings = useStore((s) => s.setSettings);
  const router = useRouter();
  const [customize, setCustomize] = useState(false);
  const [form, setForm] = useState(false);

  const m = useMemo(() => portfolioMetrics(pf, today), [pf, today]);
  const history = useMemo(() => wealthHistory(pf, today), [pf, today]);
  const notes = useMemo(() => insights(pf, today), [pf, today]);
  const due = useMemo(() => deadlines(pf, today, 90), [pf, today]);
  const rows = useMemo(() => pf.properties.map((p) => ({ p, m: propertyMetrics(p, pf, today) })), [pf, today]);

  const ladder = useMemo(() => {
    const byYear = new Map<number, number>();
    for (const l of pf.loans) {
      const st = loanStatus(l, today);
      if (st.balance <= 0.005 || st.monthsToFixedEnd < 0) continue;
      const y = yearOf(l.fixedUntil);
      byYear.set(y, (byYear.get(y) ?? 0) + st.balanceAtFixedEnd);
    }
    if (byYear.size === 0) return { labels: [] as string[], values: [] as number[] };
    const from = yearOf(today);
    const to = Math.max(...byYear.keys());
    const labels: string[] = [], values: number[] = [];
    for (let y = from; y <= to; y++) { labels.push(String(y)); values.push(byYear.get(y) ?? 0); }
    return { labels, values };
  }, [pf, today]);

  if (pf.properties.length === 0) {
    return (
      <>
        <div className="card mt-10">
          <Empty icon={<Building2 size={22} />} title="Noch kein Objekt im Bestand" text="Legen Sie Ihr erstes Objekt an oder sehen Sie sich das Beispielportfolio an. Beides dauert nur einen Moment.">
            <Button variant="primary" icon={<Plus size={16} />} onClick={() => setForm(true)}>Objekt anlegen</Button>
            <Button onClick={() => useStore.getState().loadDemo()}>Beispielportfolio laden</Button>
          </Empty>
        </div>
        <PropertyForm open={form} onClose={() => setForm(false)} onSaved={(id) => router.push(`/objekte/${id}`)} />
      </>
    );
  }

  const widgets = pf.settings.widgets.filter((w) => w in WIDGETS);
  const ltvTone = m.ltvPct > 80 ? "bad" : m.ltvPct > 60 ? "warn" : "good";
  const first = history[0];

  const render = (w: WidgetKey) => {
    switch (w) {
      case "kennzahlen":
        return (
          <div className="card grid grid-cols-2 gap-x-6 gap-y-6 p-5 md:grid-cols-3 xl:grid-cols-6">
            <Stat label="Kaltmiete p. a." value={eurCompact(m.rentActual)} hint={`Soll ${eurCompact(m.rentTarget)}`} />
            <Stat label="Cashflow vor Tilgung" value={`${eur(m.cfBeforePrincipal / 12)}`} hint="pro Monat, vor Steuern" tone={m.cfBeforePrincipal < 0 ? "bad" : undefined} />
            <Stat label="Cashflow nach Tilgung" value={`${eur(m.cfPreTax / 12)}`} hint={`nach Steuern ${eur(m.cfAfterTax / 12)}`} tone={m.cfPreTax < 0 ? "bad" : undefined} />
            <Stat label="Nettomietrendite" value={pct(m.netYieldPct, 2)} hint={`brutto ${pct(m.grossYieldPct, 2)} · Faktor ${m.factor.toLocaleString("de-DE", { maximumFractionDigits: 1 })}`} />
            <Stat label="Leerstand" value={pct(m.vacancyPct)} hint={m.unitsVacant ? `${m.unitsVacant} von ${m.units} Einheiten · ${eurCompact(m.vacancyCost)} p. a.` : `${m.units} Einheiten voll vermietet`} tone={m.vacancyPct > 5 ? "bad" : undefined} />
            <Stat label="Kapitaldienst" value={eur(m.monthlyPayment)} hint={`pro Monat · Ø Zins ${pct(m.avgInterestPct, 2)}`} />
          </div>
        );
      case "vermoegen":
        return (
          <Card eyebrow="Seit dem ersten Kauf" title="Vermögensentwicklung">
            <LineChart
              ariaLabel="Marktwert, Restschuld und Eigenkapital je Jahr"
              labels={history.map((h) => String(h.year))}
              series={[
                { key: "eq", label: "Eigenkapital", color: S.gold, values: history.map((h) => h.equity), area: true },
                { key: "val", label: "Marktwert", color: S.teal, values: history.map((h) => h.value) },
                { key: "debt", label: "Restschuld", color: S.blue, values: history.map((h) => h.debt) },
              ]}
            />
          </Card>
        );
      case "cashflow":
        return (
          <Card eyebrow="Laufrate pro Jahr" title="Von der Miete zum Cashflow" action={<Link href="/kennzahlen" className="text-[13px] text-accent hover:underline">Details</Link>}>
            <CashflowCascade m={m} />
          </Card>
        );
      case "hinweise":
        return (
          <Card eyebrow={`${notes.length} offen`} title="Hinweise">
            <InsightList items={notes} limit={5} />
          </Card>
        );
      case "fristen":
        return (
          <Card eyebrow="Nächste 90 Tage" title="Fristen" action={<Link href="/fristen" className="text-[13px] text-accent hover:underline">Alle Fristen</Link>}>
            <DeadlineList items={due} limit={5} />
          </Card>
        );
      case "zinsbindung":
        return (
          <Card eyebrow="Restschuld bei Bindungsende" title="Zinsbindungsleiter" action={<Link href="/finanzierung" className="text-[13px] text-accent hover:underline">Darlehen</Link>}>
            {ladder.labels.length ? (
              <BarChart ariaLabel="Auslaufende Restschuld je Jahr" labels={ladder.labels} series={[{ key: "b", label: "Auslaufende Restschuld", color: S.gold, values: ladder.values }]} height={236} />
            ) : <p className="py-10 text-center text-text-2">Keine laufenden Darlehen.</p>}
          </Card>
        );
      case "objekte":
        return (
          <Card title="Objekte" pad={false} action={<Link href="/objekte" className="text-[13px] text-accent hover:underline">Vergleich</Link>}>
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr><th>Objekt</th><th className="r">Wert</th><th className="r">Eigenkapital</th><th className="r">Cashflow / Monat</th><th className="r">Netto</th></tr></thead>
                <tbody>
                  {rows.map(({ p, m: pm }) => (
                    <tr key={p.id} className="cursor-pointer" onClick={() => router.push(`/objekte/${p.id}`)}>
                      <td>
                        <Link href={`/objekte/${p.id}`} className="block font-medium hover:text-accent">{p.name}</Link>
                        <span className="text-[12px] text-muted">{p.city} · {PROPERTY_TYPE_LABEL[p.type]}{pm.unitsVacant > 0 && <> · <span className="text-bad">{pm.unitsVacant} leer</span></>}</span>
                      </td>
                      <td className="r">{eurCompact(pm.value)}</td>
                      <td className="r">{eurCompact(pm.equity)}</td>
                      <td className={cx("r", pm.cfPreTax < 0 && "text-bad")}>{eur(pm.cfPreTax / 12)}</td>
                      <td className="r">{pct(pm.netYieldPct, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        );
    }
  };

  const move = (w: WidgetKey, dir: -1 | 1) => {
    const list = [...pf.settings.widgets];
    const i = list.indexOf(w);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    setSettings({ widgets: list });
  };

  return (
    <>
      <div className="rise mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow mb-2">{new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
          <h1 className="display text-[28px] sm:text-[36px]">{greeting()}{pf.settings.ownerName && pf.settings.ownerName !== "Beispielportfolio" ? `, ${pf.settings.ownerName}` : ""}.</h1>
        </div>
        <div className="flex gap-2">
          <Button icon={<SlidersHorizontal size={15} />} onClick={() => setCustomize(true)}>Anpassen</Button>
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setForm(true)}>Objekt</Button>
        </div>
      </div>

      <section className="card rise rise-1 relative mb-4 overflow-hidden p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-24 -top-32 h-[380px] w-[380px] rounded-full blur-3xl" style={{ background: "radial-gradient(circle, var(--accent-soft), transparent 68%)" }} />
        <div className="relative grid gap-8 lg:grid-cols-[1.25fr_1fr] lg:items-end">
          <div>
            <div className="eyebrow">Nettovermögen in Immobilien</div>
            <div className="mt-2 text-[44px] font-semibold leading-none tracking-[-0.035em] sm:text-[60px]">{eur(m.equity)}</div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Badge tone={m.valueGain >= 0 ? "good" : "bad"}><ArrowUpRight size={13} className={m.valueGain < 0 ? "rotate-90" : ""} />{signedEur(m.valueGain)} Wertzuwachs seit Kauf</Badge>
              {first && <span className="text-[13px] text-text-2">{pf.properties.length} Objekte · {m.units} Einheiten · {m.area.toLocaleString("de-DE")} m² · seit {first.year}</span>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-5">
            <Stat label="Marktwert (geschätzt)" value={eurCompact(m.value)} />
            <Stat label="Restschuld" value={eurCompact(m.debt)} />
            <div className="col-span-2">
              <div className="mb-2 flex items-baseline justify-between text-[12px]">
                <span className="text-muted">Beleihungsauslauf</span>
                <span className="tnum font-semibold">{pct(m.ltvPct)}</span>
              </div>
              <Meter value={m.ltvPct} tone={ltvTone} label="Beleihungsauslauf in Prozent" />
              <div className="mt-2 text-[12px] text-text-2">Vermögenszuwachs aus Tilgung und Cashflow: {eur(m.wealthGain)} pro Jahr</div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {widgets.map((w, i) => (
          <div key={w} className={cx("rise min-w-0", `rise-${Math.min(i + 2, 5)}`, WIDGETS[w].span)}>{render(w)}</div>
        ))}
      </div>

      <Modal open={customize} onClose={() => setCustomize(false)} title="Übersicht anpassen" description="Bausteine ein- und ausblenden und in die gewünschte Reihenfolge bringen."
        footer={<><Button className="mr-auto" onClick={() => setSettings({ widgets: DEFAULT_WIDGETS })}>Standard wiederherstellen</Button><Button variant="primary" onClick={() => setCustomize(false)}>Fertig</Button></>}>
        <ul className="divide-y divide-line">
          {[...pf.settings.widgets, ...(Object.keys(WIDGETS) as WidgetKey[]).filter((k) => !pf.settings.widgets.includes(k))].map((w) => {
            const on = pf.settings.widgets.includes(w);
            const idx = pf.settings.widgets.indexOf(w);
            return (
              <li key={w} className="flex items-center gap-2 py-2">
                <div className="flex-1">
                  <Toggle label={WIDGETS[w].label} checked={on} onChange={(v) => setSettings({ widgets: v ? [...pf.settings.widgets, w] : pf.settings.widgets.filter((x) => x !== w) })} />
                </div>
                <IconButton label="Nach oben" disabled={!on || idx === 0} onClick={() => move(w, -1)}><ArrowUp size={15} /></IconButton>
                <IconButton label="Nach unten" disabled={!on || idx === pf.settings.widgets.length - 1} onClick={() => move(w, 1)}><ArrowDown size={15} /></IconButton>
              </li>
            );
          })}
        </ul>
      </Modal>
      <PropertyForm open={form} onClose={() => setForm(false)} onSaved={(id) => router.push(`/objekte/${id}`)} />
    </>
  );
}
