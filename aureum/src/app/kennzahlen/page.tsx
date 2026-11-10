"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { portfolioMetrics, propertyMetrics, type Metrics } from "@/lib/calc/metrics";
import { eur, eur2, num, pct } from "@/lib/format";
import { downloadText, toCsv } from "@/lib/csv";
import { usePf, CashflowCascade } from "@/components/blocks";
import { Button, Card, cx, PageHeader, Row, Segmented, Select } from "@/components/ui";
import { ReportButton } from "@/components/report-button";

interface Kpi { key: string; label: string; group: string; get: (m: Metrics) => number | null; fmt: (n: number) => string; lowGood?: boolean; sign?: boolean }

const KPIS: Kpi[] = [
  { key: "gross", group: "Rendite", label: "Bruttomietrendite", get: (m) => m.grossYieldPct, fmt: (n) => pct(n, 2) },
  { key: "net", group: "Rendite", label: "Nettomietrendite", get: (m) => m.netYieldPct, fmt: (n) => pct(n, 2) },
  { key: "factor", group: "Rendite", label: "Kaufpreisfaktor", get: (m) => m.factor, fmt: (n) => num(n, 1), lowGood: true },
  { key: "coc", group: "Rendite", label: "Cash-on-Cash", get: (m) => m.cashOnCashPct, fmt: (n) => pct(n, 2), sign: true },
  { key: "rent", group: "Ertrag", label: "Kaltmiete p. a. (Ist)", get: (m) => m.rentActual, fmt: eur },
  { key: "target", group: "Ertrag", label: "Kaltmiete p. a. (Soll)", get: (m) => m.rentTarget, fmt: eur },
  { key: "market", group: "Ertrag", label: "Marktmiete p. a.", get: (m) => m.rentMarket, fmt: eur },
  { key: "sqm", group: "Ertrag", label: "Kaltmiete je m²", get: (m) => m.rentPerSqm, fmt: eur2 },
  { key: "vac", group: "Ertrag", label: "Leerstandsquote", get: (m) => m.vacancyPct, fmt: (n) => pct(n), lowGood: true },
  { key: "vacc", group: "Ertrag", label: "Leerstandskosten p. a.", get: (m) => m.vacancyCost, fmt: eur, lowGood: true },
  { key: "opex", group: "Kosten", label: "Bewirtschaftung p. a.", get: (m) => m.opex, fmt: eur, lowGood: true },
  { key: "opexsqm", group: "Kosten", label: "Bewirtschaftung je m²", get: (m) => m.opexPerSqm, fmt: eur2, lowGood: true },
  { key: "maint", group: "Kosten", label: "Instandhaltung je m²", get: (m) => m.maintenancePerSqm, fmt: eur2, lowGood: true },
  { key: "noi", group: "Cashflow", label: "Reinertrag p. a.", get: (m) => m.noi, fmt: eur, sign: true },
  { key: "cfb", group: "Cashflow", label: "Cashflow vor Tilgung", get: (m) => m.cfBeforePrincipal, fmt: eur, sign: true },
  { key: "cf", group: "Cashflow", label: "Cashflow vor Steuern", get: (m) => m.cfPreTax, fmt: eur, sign: true },
  { key: "tax", group: "Cashflow", label: "Steuer (+) / Ersparnis (−)", get: (m) => m.tax, fmt: eur, lowGood: true },
  { key: "cfat", group: "Cashflow", label: "Cashflow nach Steuern", get: (m) => m.cfAfterTax, fmt: eur, sign: true },
  { key: "wealth", group: "Cashflow", label: "Vermögenszuwachs p. a.", get: (m) => m.wealthGain, fmt: eur, sign: true },
  { key: "value", group: "Vermögen", label: "Marktwert", get: (m) => m.value, fmt: eur },
  { key: "debt", group: "Vermögen", label: "Restschuld", get: (m) => m.debt, fmt: eur, lowGood: true },
  { key: "equity", group: "Vermögen", label: "Eigenkapital", get: (m) => m.equity, fmt: eur },
  { key: "ltv", group: "Vermögen", label: "Beleihungsauslauf", get: (m) => m.ltvPct, fmt: (n) => pct(n), lowGood: true },
  { key: "dscr", group: "Vermögen", label: "Schuldendienstdeckung", get: (m) => m.dscr, fmt: (n) => num(n, 2) },
  { key: "rate", group: "Vermögen", label: "Ø Sollzins", get: (m) => m.avgInterestPct, fmt: (n) => pct(n, 2), lowGood: true },
];

export default function Kennzahlen() {
  const { pf, today } = usePf();
  const [scope, setScope] = useState("alle");
  const [basis, setBasis] = useState<"jahr" | "monat">("jahr");
  const [rank, setRank] = useState("net");

  const cols = useMemo(() => pf.properties.map((p) => ({ p, m: propertyMetrics(p, pf, today) })), [pf, today]);
  const total = useMemo(() => portfolioMetrics(pf, today), [pf, today]);
  const m = scope === "alle" ? total : cols.find((c) => c.p.id === scope)?.m ?? total;

  const kpi = KPIS.find((k) => k.key === rank)!;
  const ranked = [...cols].filter((c) => kpi.get(c.m) !== null).sort((a, b) => ((kpi.get(b.m) ?? 0) - (kpi.get(a.m) ?? 0)) * (kpi.lowGood ? -1 : 1));
  const maxAbs = Math.max(...ranked.map((c) => Math.abs(kpi.get(c.m) ?? 0)), 0.0001);

  const exportCsv = () => {
    const rows: (string | number)[][] = [["Kennzahl", ...cols.map((c) => c.p.name), "Gesamt"]];
    for (const k of KPIS) rows.push([k.label, ...cols.map((c) => k.get(c.m) ?? ""), k.get(total) ?? ""]);
    downloadText(`aureum-kennzahlen-${today}.csv`, toCsv(rows));
  };

  return (
    <>
      <PageHeader title="Kennzahlen" sub="Cashflow und Renditen als aktuelle Jahres-Laufrate: laufende Verträge, Zins und Tilgung der kommenden zwölf Monate.">
        <Button icon={<Download size={15} />} onClick={exportCsv}>CSV</Button>
        <ReportButton kind="cashflow" label="Cashflow-Report" />
      </PageHeader>

      <div className="rise rise-1 mb-4 flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-[280px]">
          <Select value={scope} onChange={setScope} aria-label="Umfang" options={[{ value: "alle", label: "Gesamter Bestand" }, ...pf.properties.map((p) => ({ value: p.id, label: p.name }))]} />
        </div>
        <Segmented label="Zeitbasis" value={basis} onChange={setBasis} options={[{ value: "jahr", label: "Pro Jahr" }, { value: "monat", label: "Pro Monat" }]} />
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="rise rise-2 lg:col-span-5" eyebrow={basis === "jahr" ? "Pro Jahr" : "Pro Monat"} title="Von der Miete zum Cashflow">
          <CashflowCascade m={m} monthly={basis === "monat"} />
        </Card>
        <Card className="rise rise-2 lg:col-span-3" title="Rendite und Risiko">
          <Row label="Bruttomietrendite">{pct(m.grossYieldPct, 2)}</Row>
          <Row label="Nettomietrendite">{pct(m.netYieldPct, 2)}</Row>
          <Row label="Kaufpreisfaktor">{num(m.factor, 1)}</Row>
          <Row label="Cash-on-Cash">{m.cashOnCashPct === null ? "–" : pct(m.cashOnCashPct, 2)}</Row>
          <Row label="DSCR">{m.dscr === null ? "–" : num(m.dscr, 2)}</Row>
          <Row label="Beleihungsauslauf">{pct(m.ltvPct)}</Row>
          <Row label="Leerstandsquote">{pct(m.vacancyPct)}</Row>
          <Row label="Soll / Ist-Miete">{eur(m.rentTarget)} / {eur(m.rentActual)}</Row>
        </Card>
        <Card className="rise rise-2 lg:col-span-4" title="Rangfolge" action={<div className="w-[190px]"><Select value={rank} onChange={setRank} aria-label="Kennzahl für die Rangfolge" options={KPIS.map((k) => ({ value: k.key, label: k.label }))} /></div>}>
          <ul className="space-y-3 pt-1">
            {ranked.map((c, i) => {
              const v = kpi.get(c.m) ?? 0;
              return (
                <li key={c.p.id}>
                  <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
                    <span className="truncate"><span className="tnum mr-2 text-muted">{i + 1}</span>{c.p.name}</span>
                    <span className={cx("tnum font-semibold", v < 0 && "text-bad")}>{kpi.fmt(v)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full origin-left rounded-full" style={{ width: `${(Math.abs(v) / maxAbs) * 100}%`, background: v < 0 ? "var(--s4)" : "var(--s1)", animation: `growx .7s var(--ease-out-expo) ${i * 60}ms both` }} /></div>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-[12px] text-muted">{kpi.lowGood ? "Niedrigere Werte stehen oben." : "Höhere Werte stehen oben."}</p>
        </Card>

        <Card className="rise rise-3 lg:col-span-12" pad={false} title="Alle Kennzahlen im Vergleich">
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th className="sticky left-0 z-[1] bg-surface">Kennzahl</th>{cols.map((c) => <th key={c.p.id} className="r max-w-[150px] truncate" title={c.p.name}>{c.p.name.length > 20 ? `${c.p.name.slice(0, 19)}…` : c.p.name}</th>)}<th className="r">Gesamt</th></tr></thead>
              <tbody>
                {KPIS.map((k, i) => {
                  const vals = cols.map((c) => k.get(c.m));
                  const nums = vals.filter((v): v is number => v !== null);
                  const top = nums.length > 1 ? (k.lowGood ? Math.min(...nums) : Math.max(...nums)) : null;
                  // Nur hervorheben, wenn genau ein Objekt vorn liegt.
                  const best = top !== null && nums.filter((v) => v === top).length === 1 ? top : null;
                  const head = i === 0 || KPIS[i - 1].group !== k.group;
                  return [
                    head && <tr key={`${k.group}-h`}><td colSpan={cols.length + 2} className="eyebrow !border-b-0 !pb-1 !pt-5 hover:!bg-transparent">{k.group}</td></tr>,
                    <tr key={k.key}>
                      <td className="sticky left-0 z-[1] bg-surface text-text-2">{k.label}</td>
                      {vals.map((v, n) => (
                        <td key={cols[n].p.id} className={cx("r", v !== null && k.sign && v < 0 && "text-bad", v !== null && v === best && "font-semibold text-accent")}>{v === null ? "–" : k.fmt(v)}</td>
                      ))}
                      <td className={cx("r font-semibold", k.sign && (k.get(total) ?? 0) < 0 && "text-bad")}>{k.get(total) === null ? "–" : k.fmt(k.get(total)!)}</td>
                    </tr>,
                  ];
                })}
              </tbody>
            </table>
          </div>
          <p className="border-t border-line px-5 py-3 text-[12px] text-muted">Hervorgehoben ist jeweils der beste Wert einer Zeile. Steuer mit {pct(pf.settings.taxRatePct, 0)} Grenzsteuersatz; die Instandhaltung ist dabei als laufender Aufwand angesetzt.</p>
        </Card>
      </div>
    </>
  );
}
