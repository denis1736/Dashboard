"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarPlus, Mail, TriangleAlert } from "lucide-react";
import { useStore } from "@/lib/store";
import { arrears, rentIncrease } from "@/lib/calc/letters";
import { currentColdRent, isLeaseActive } from "@/lib/calc/metrics";
import { addYears } from "@/lib/calc/dates";
import type { IncreaseLetter } from "@/lib/report";
import { dateDE, eur, eur2, monthShortDE, num, pct, uid } from "@/lib/format";
import { usePf } from "@/components/blocks";
import { Badge, Button, Card, cx, Empty, Field, NumberInput, PageHeader, Row, Segmented, Select, Tabs } from "@/components/ui";
import { ReportButton } from "@/components/report-button";

type Tab = "erhoehung" | "mahnung";

export default function Schreiben() {
  const { pf, today } = usePf();
  const upsert = useStore((s) => s.upsert);
  const [tab, setTab] = useState<Tab>("erhoehung");

  /* ── Mieterhöhung ── */
  const candidates = useMemo(() => pf.leases
    .filter((l) => isLeaseActive(l, today) && l.rentType === "standard")
    .map((l) => {
      const unit = pf.units.find((u) => u.id === l.unitId)!;
      const property = pf.properties.find((p) => p.id === unit?.propertyId)!;
      return { lease: l, unit, property, gap: unit ? unit.marketRent - currentColdRent(l, today) : 0 };
    })
    .filter((c) => c.unit && c.property)
    .sort((a, b) => b.gap - a.gap), [pf, today]);

  const [form, setForm] = useState<IncreaseLetter>({ leaseId: "", letterDate: today, marketPerSqm: 0, rentThreeYearsAgo: 0, capPct: 20, basis: "mietspiegel", basisText: "" });
  const [done, setDone] = useState(false);
  const pick = (leaseId: string) => {
    const c = candidates.find((x) => x.lease.id === leaseId);
    if (!c) return;
    const rent = currentColdRent(c.lease, today);
    // Die Vergleichsmiete wird bewusst nicht aus der Marktmiete vorbelegt: Neuvermietungsmieten liegen
    // meist über dem Mietspiegel, und ein zu hoher Wert macht das Verlangen angreifbar.
    setForm((f) => ({ ...f, leaseId, marketPerSqm: 0, rentThreeYearsAgo: rent, requestedRent: undefined }));
    setDone(false);
  };
  useEffect(() => { if (!form.leaseId && candidates[0]) pick(candidates[0].lease.id); }); // eslint-disable-line react-hooks/exhaustive-deps

  const sel = candidates.find((c) => c.lease.id === form.leaseId);
  const result = sel ? rentIncrease({ lease: sel.lease, unit: sel.unit, letterDate: form.letterDate, marketPerSqm: form.marketPerSqm, rentThreeYearsAgo: form.rentThreeYearsAgo, capPct: form.capPct, requestedRent: form.requestedRent }) : null;
  const base = sel ? sel.lease.lastIncrease ?? sel.lease.start : "";
  const unchanged3y = sel ? addYears(base, 3) <= (result?.effectiveDate ?? today) : true;
  const blocked = !result || result.newRent <= result.currentRent || form.marketPerSqm <= 0 || form.rentThreeYearsAgo <= 0;

  /* ── Mahnung ── */
  const open = useMemo(() => arrears(pf, today), [pf, today]);
  const [level, setLevel] = useState<"1" | "2" | "3">("1");
  const [days, setDays] = useState(10);

  const noSender = !pf.settings.sender.name;

  return (
    <>
      <PageHeader title="Schreiben" sub="Mieterhöhungen und Mahnungen als versandfertige Briefe. Fristen und Grenzen werden aus Ihren Vertragsdaten berechnet." />
      {noSender && (
        <div className="rise mb-4 flex items-start gap-3 rounded-[12px] border border-line bg-warn-soft px-4 py-3 text-[13px]">
          <TriangleAlert size={16} className="mt-0.5 shrink-0 text-warn" />
          <span>Für den Briefkopf fehlt Ihr Absender. Tragen Sie ihn in den <Link href="/einstellungen" className="font-medium text-accent underline">Einstellungen</Link> ein.</span>
        </div>
      )}
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ value: "erhoehung", label: "Mieterhöhung" }, { value: "mahnung", label: "Zahlungserinnerung und Mahnung", count: open.length }]} />

      {tab === "erhoehung" && (candidates.length === 0 ? (
        <div className="card"><Empty icon={<Mail size={22} />} title="Kein passender Mietvertrag" text="Eine Erhöhung nach § 558 BGB setzt einen laufenden Vertrag ohne Staffel- oder Indexmiete voraus." /></div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-12">
          <Card className="rise rise-1 lg:col-span-7" eyebrow="§ 558 BGB" title="Erhöhung bis zur ortsüblichen Vergleichsmiete">
            <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-6">
              <Field label="Mietvertrag" className="col-span-2 sm:col-span-6">
                <Select value={form.leaseId} onChange={pick} options={candidates.map((c) => ({ value: c.lease.id, label: `${c.property.name} · ${c.unit.name} · ${c.lease.tenantName}${c.gap > 0 ? ` (${eur(c.gap)} unter Markt)` : ""}` }))} />
              </Field>
              <Field label="Datum des Schreibens" className="sm:col-span-2"><input type="date" className="field" value={form.letterDate} onChange={(e) => setForm({ ...form, letterDate: e.target.value || today })} /></Field>
              <Field label="Ortsübliche Vergleichsmiete" hint="Wert aus dem Mietspiegel, nicht die Neuvermietungsmiete" className="sm:col-span-2"><NumberInput value={form.marketPerSqm || undefined} onChange={(marketPerSqm) => setForm({ ...form, marketPerSqm })} suffix="€/m²" digits={2} placeholder="eintragen" /></Field>
              <Field label="Miete vor drei Jahren" hint={unchanged3y ? "Seit über drei Jahren unverändert" : "Bitte den damaligen Betrag eintragen"} className="col-span-2"><NumberInput value={form.rentThreeYearsAgo} onChange={(rentThreeYearsAgo) => setForm({ ...form, rentThreeYearsAgo })} suffix="€" digits={2} /></Field>
              <div className="col-span-2 sm:col-span-3">
                <div className="mb-1.5 text-[12px] font-medium text-text-2">Kappungsgrenze</div>
                <Segmented label="Kappungsgrenze" value={String(form.capPct) as "20" | "15"} onChange={(v) => setForm({ ...form, capPct: Number(v) as 15 | 20 })} options={[{ value: "20", label: "20 %" }, { value: "15", label: "15 % (angespannter Markt)" }]} />
              </div>
              <Field label="Gewünschte neue Miete" hint="Leer = so viel wie zulässig" className="col-span-2 sm:col-span-3"><NumberInput value={form.requestedRent} onChange={(v) => setForm({ ...form, requestedRent: v || undefined })} suffix="€" digits={2} placeholder={result ? result.newRent.toLocaleString("de-DE", { minimumFractionDigits: 2 }) : ""} /></Field>
              <Field label="Begründung" className="col-span-2 sm:col-span-3">
                <Select value={form.basis} onChange={(basis) => setForm({ ...form, basis })} options={[{ value: "mietspiegel", label: "Mietspiegel" }, { value: "vergleichswohnungen", label: "Drei Vergleichswohnungen" }, { value: "gutachten", label: "Sachverständigengutachten" }]} />
              </Field>
              <Field label={form.basis === "mietspiegel" ? "Mietspiegel und Einordnung" : form.basis === "vergleichswohnungen" ? "Anschrift, Lage und Miete je Wohnung" : "Gutachter und Datum"} className="col-span-2 sm:col-span-6" hint="Erscheint wörtlich im Schreiben. Ohne nachvollziehbare Begründung ist das Verlangen formell unwirksam.">
                <textarea className="field" rows={3} value={form.basisText} placeholder={form.basis === "mietspiegel" ? "z. B. Mietspiegel der Stadt Leipzig 2025, Baualtersklasse bis 1918, mittlere Wohnlage, Spanne 8,10 bis 10,90 €/m²" : ""} onChange={(e) => setForm({ ...form, basisText: e.target.value })} />
              </Field>
            </div>
          </Card>

          <div className="space-y-4 lg:col-span-5">
            {result && sel && (
              <Card className="rise rise-2" eyebrow={`${sel.unit.name} · ${num(sel.unit.area, 2)} m²`} title="Ergebnis">
                {form.marketPerSqm <= 0 && <p className="mb-3 rounded-[12px] bg-accent-soft px-3 py-2.5 text-[13px]">Tragen Sie die ortsübliche Vergleichsmiete aus dem Mietspiegel ein. Erst dann lässt sich die zulässige Miete berechnen.</p>}
                <div className="mb-3 flex items-baseline justify-between">
                  <span className="text-[34px] font-semibold tracking-[-0.03em]">{form.marketPerSqm > 0 ? eur2(result.newRent) : "–"}</span>
                  {form.marketPerSqm > 0 && result.increase > 0 && <Badge tone="good">+{eur2(result.increase)} · {pct(result.increasePct)}</Badge>}
                </div>
                <Row label="Aktuelle Kaltmiete">{eur2(result.currentRent)}</Row>
                <Row label="Obergrenze Vergleichsmiete">{eur2(result.maxByMarket)}</Row>
                <Row label={`Obergrenze Kappung (${form.capPct} %)`}>{eur2(result.maxByCap)}</Row>
                <Row label="Begrenzt durch">{{ vergleichsmiete: "Vergleichsmiete", kappungsgrenze: "Kappungsgrenze", wunsch: "Ihren Wunschbetrag" }[result.limitedBy]}</Row>
                <Row label="Zustimmung bis">{dateDE(result.consentUntil)}</Row>
                <Row label="Neue Miete ab" strong>{dateDE(result.effectiveDate)}</Row>
                <Row label="Mehrertrag pro Jahr">{eur(Math.max(0, result.increase) * 12)}</Row>
                {form.marketPerSqm > 0 && result.warnings.length > 0 && (
                  <ul className="mt-4 space-y-2 rounded-[12px] bg-warn-soft p-3 text-[13px] leading-snug">
                    {result.warnings.map((w) => <li key={w} className="flex gap-2"><TriangleAlert size={14} className="mt-0.5 shrink-0 text-warn" />{w}</li>)}
                  </ul>
                )}
                <div className="mt-5 flex flex-wrap gap-2">
                  {blocked
                    ? <Button variant="primary" disabled>Schreiben als PDF</Button>
                    : <ReportButton kind="mieterhoehung" opts={{ increase: form }} label="Schreiben als PDF" variant="primary" />}
                  <Button icon={<CalendarPlus size={15} />} disabled={blocked || done}
                    onClick={() => { upsert("reminders", { id: uid(), propertyId: sel.property.id, title: `Zustimmungsfrist Mieterhöhung · ${sel.unit.name}`, date: result.consentUntil, kind: "mieterhoehung", repeatMonths: 0, done: false, note: `${sel.lease.tenantName} · neue Miete ${eur2(result.newRent)} ab ${dateDE(result.effectiveDate)}; ohne Zustimmung Klage binnen drei Monaten (§ 558b Abs. 2 BGB)` }); setDone(true); }}>
                    {done ? "Frist eingetragen" : "Frist als Termin anlegen"}
                  </Button>
                </div>
              </Card>
            )}
            <p className="px-1 text-[12px] leading-snug text-muted">
              Das Schreiben enthält Begründung, Kappungsgrenze, Fristen, den Hinweis auf das Sonderkündigungsrecht und eine Zustimmungserklärung. Nach Zustimmung tragen Sie die neue Miete und das Datum im Mietvertrag ein. Prüfen Sie Mietspiegel und Mietpreisbremse vor dem Versand; ein formell fehlerhaftes Verlangen ist unwirksam.
            </p>
          </div>
        </div>
      ))}

      {tab === "mahnung" && (open.length === 0 ? (
        <div className="card"><Empty icon={<Mail size={22} />} title="Keine Rückstände" text="Alle fälligen Mieten seit Beginn der Zahlungserfassung sind eingegangen. Eingänge buchen Sie unter Mieteingänge." /></div>
      ) : (
        <>
          <div className="rise rise-1 mb-4 flex flex-wrap items-end gap-4">
            <div>
              <div className="mb-1.5 text-[12px] font-medium text-text-2">Stufe</div>
              <Segmented label="Mahnstufe" value={level} onChange={setLevel} options={[{ value: "1", label: "Zahlungserinnerung" }, { value: "2", label: "Mahnung" }, { value: "3", label: "Letzte Mahnung" }]} />
            </div>
            <div className="w-[150px]"><Field label="Zahlungsfrist"><NumberInput value={days} onChange={(v) => setDays(Math.max(1, Math.round(v)))} suffix="Tage" /></Field></div>
          </div>
          <Card className="rise rise-2" pad={false} title="Offene Mieten">
            <div className="overflow-x-auto border-t border-line">
              <table className="tbl min-w-[720px]">
                <thead><tr><th>Mieter</th><th>Offene Monate</th><th className="r">Rückstand</th><th className="r">in Monatsmieten</th><th /></tr></thead>
                <tbody>
                  {open.map((a) => (
                    <tr key={a.lease.id}>
                      <td><span className="font-medium">{a.lease.tenantName}</span><div className="text-[12px] text-muted">{a.property.name} · {a.unit.name}</div></td>
                      <td><div className="flex flex-wrap gap-1.5">{a.months.map((m) => <Badge key={m.month} tone={m.paid > 0 ? "warn" : "bad"}>{monthShortDE(m.month)} · {eur(m.open)}</Badge>)}</div></td>
                      <td className="r font-semibold text-bad">{eur2(a.total)}</td>
                      <td className={cx("r", a.monthsOfRent >= 2 && "font-semibold text-bad")}>{num(a.monthsOfRent, 1)}</td>
                      <td className="r"><ReportButton kind="mahnung" opts={{ dunning: { leaseId: a.lease.id, letterDate: today, level: Number(level) as 1 | 2 | 3, days } }} label="PDF" size="sm" variant="ghost" /></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td colSpan={2}>Summe</td><td className="r">{eur2(open.reduce((s, a) => s + a.total, 0))}</td><td /><td /></tr></tfoot>
              </table>
            </div>
            <p className="border-t border-line px-5 py-3 text-[12px] leading-snug text-muted">
              Gezählt werden Monate ab dem ersten gebuchten Zahlungseingang; der laufende Monat erst nach Fälligkeit. Ab einem Rückstand von zwei Monatsmieten ist eine fristlose Kündigung möglich (§ 543 Abs. 2 Nr. 3 BGB); die letzte Mahnung weist dann darauf hin.
            </p>
          </Card>
        </>
      ))}
    </>
  );
}
