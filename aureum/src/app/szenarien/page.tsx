"use client";

import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { BASE_ASSUMPTIONS, project, type Assumptions, type ProjectionRow } from "@/lib/calc/projection";
import { eur, eurCompact, pct, signedEur } from "@/lib/format";
import { LineChart, S } from "@/components/charts";
import { usePf } from "@/components/blocks";
import { Button, Card, cx, PageHeader, Segmented, Select, Stat, Toggle } from "@/components/ui";

type Metric = "cfAfterTax" | "cumCf" | "equity" | "debt";
const METRICS: { value: Metric; label: string }[] = [
  { value: "cfAfterTax", label: "Cashflow nach Steuern" },
  { value: "cumCf", label: "Kumuliert" },
  { value: "equity", label: "Eigenkapital" },
  { value: "debt", label: "Restschuld" },
];

const PRESETS: { key: string; label: string; hint: string; patch: Partial<Assumptions> }[] = [
  { key: "basis", label: "Basis", hint: "Moderate Fortschreibung", patch: {} },
  { key: "zins", label: "Zinsschock", hint: "Anschlusszins 5,5 %", patch: { followUpPct: 5.5 } },
  { key: "miete", label: "Mietoffensive", hint: "+8 % sofort, danach 2,5 % p. a.", patch: { rentUpliftPct: 8, rentGrowthPct: 2.5 } },
  { key: "sanierung", label: "Sanierung", hint: "100.000 € im zweiten Jahr", patch: { capex: 100_000, capexYear: 2 } },
  { key: "stagnation", label: "Stagnation", hint: "Keine Miet- und Wertsteigerung", patch: { rentGrowthPct: 0, valueGrowthPct: 0, costGrowthPct: 3, vacancyPct: 5 } },
];

function Slider({ label, value, onChange, min, max, step, suffix = "%", digits = 1 }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number; suffix?: string; digits?: number }) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline justify-between text-[13px]">
        <span className="text-text-2">{label}</span>
        <span className="tnum font-semibold">{value.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits })}{suffix === "%" ? " %" : ` ${suffix}`}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ ["--fill" as string]: `${fill}%` }} />
    </label>
  );
}

export default function Szenarien() {
  const { pf, today } = usePf();
  const [scope, setScope] = useState("alle");
  const [a, setA] = useState<Assumptions>(BASE_ASSUMPTIONS);
  const [metric, setMetric] = useState<Metric>("cfAfterTax");
  const [preset, setPreset] = useState("basis");
  const set = (p: Partial<Assumptions>) => { setA((x) => ({ ...x, ...p })); setPreset(""); };

  const ids = scope === "alle" ? undefined : [scope];
  const base = useMemo(() => project(pf, today, { ...BASE_ASSUMPTIONS, years: a.years }, ids), [pf, today, a.years, scope]); // eslint-disable-line react-hooks/exhaustive-deps
  const scen = useMemo(() => project(pf, today, a, ids), [pf, today, a, scope]); // eslint-disable-line react-hooks/exhaustive-deps

  if (pf.properties.length === 0) return <PageHeader title="Szenarien" sub="Legen Sie zuerst ein Objekt an." />;

  const last = (r: ProjectionRow[]) => r[r.length - 1];
  const sumCf = (r: ProjectionRow[]) => last(r)?.cumCf ?? 0;
  const worst = scen.reduce((w, r) => (r.cfAfterTax < w.cfAfterTax ? r : w), scen[0]);
  const dCf = sumCf(scen) - sumCf(base);
  const dEq = (last(scen)?.equity ?? 0) - (last(base)?.equity ?? 0);
  const same = JSON.stringify(a) === JSON.stringify({ ...BASE_ASSUMPTIONS, years: a.years });

  return (
    <>
      <PageHeader title="Szenarien" sub="Was passiert, wenn Zinsen steigen, Mieten angepasst werden oder eine Sanierung ansteht? Die Basislinie schreibt den heutigen Stand moderat fort.">
        <div className="w-[240px]"><Select value={scope} onChange={setScope} aria-label="Umfang" options={[{ value: "alle", label: "Gesamter Bestand" }, ...pf.properties.map((p) => ({ value: p.id, label: p.name }))]} /></div>
      </PageHeader>

      <div className="rise rise-1 mb-4 flex gap-2 overflow-x-auto pb-1">
        {PRESETS.map((p) => (
          <button key={p.key} onClick={() => { setA({ ...BASE_ASSUMPTIONS, years: a.years, ...p.patch }); setPreset(p.key); }}
            className={cx("shrink-0 rounded-[12px] border px-4 py-2.5 text-left transition-colors", preset === p.key ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-line-strong")}>
            <div className="font-semibold">{p.label}</div>
            <div className="text-[12px] text-text-2">{p.hint}</div>
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="rise rise-2 lg:col-span-4" title="Annahmen" action={<Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} onClick={() => { setA({ ...BASE_ASSUMPTIONS, years: a.years }); setPreset("basis"); }}>Zurücksetzen</Button>}>
          <div className="space-y-4">
            <Slider label="Horizont" value={a.years} onChange={(years) => set({ years })} min={5} max={30} step={1} suffix="Jahre" digits={0} />
            <div className="eyebrow pt-2">Mieten</div>
            <Slider label="Einmalige Mietanpassung" value={a.rentUpliftPct} onChange={(rentUpliftPct) => set({ rentUpliftPct })} min={-10} max={20} step={0.5} />
            <Slider label="Mietsteigerung pro Jahr" value={a.rentGrowthPct} onChange={(rentGrowthPct) => set({ rentGrowthPct })} min={0} max={5} step={0.1} />
            <Slider label="Mietausfall und Leerstand" value={a.vacancyPct} onChange={(vacancyPct) => set({ vacancyPct })} min={0} max={15} step={0.5} />
            <div className="eyebrow pt-2">Finanzierung</div>
            <Toggle label="Eigener Anschlusszins" hint="Sonst gilt die Annahme je Darlehen." checked={a.followUpPct !== null} onChange={(on) => set({ followUpPct: on ? 4 : null })} />
            {a.followUpPct !== null && <Slider label="Anschlusszins nach Zinsbindung" value={a.followUpPct} onChange={(followUpPct) => set({ followUpPct })} min={1} max={8} step={0.1} digits={1} />}
            <div className="eyebrow pt-2">Kosten und Wert</div>
            <Slider label="Kostensteigerung pro Jahr" value={a.costGrowthPct} onChange={(costGrowthPct) => set({ costGrowthPct })} min={0} max={6} step={0.1} />
            <Slider label="Wertentwicklung pro Jahr" value={a.valueGrowthPct} onChange={(valueGrowthPct) => set({ valueGrowthPct })} min={-3} max={6} step={0.1} />
            <div className="eyebrow pt-2">Sanierung</div>
            <Slider label="Einmalige Investition" value={a.capex} onChange={(capex) => set({ capex })} min={0} max={500_000} step={5_000} suffix="€" digits={0} />
            {a.capex > 0 && <>
              <Slider label="Im Jahr" value={a.capexYear} onChange={(capexYear) => set({ capexYear })} min={1} max={a.years} step={1} suffix="" digits={0} />
              <Toggle label="Sofort abziehbar" hint="Erhaltungsaufwand statt Aktivierung." checked={a.capexDeductible} onChange={(capexDeductible) => set({ capexDeductible })} />
            </>}
          </div>
        </Card>

        <div className="space-y-4 lg:col-span-8">
          <div className="card rise rise-2 grid grid-cols-2 gap-x-6 gap-y-6 p-5 md:grid-cols-4">
            <Stat label={`Cashflow über ${a.years} Jahre`} value={eurCompact(sumCf(scen))} hint={same ? "nach Steuern" : `${signedEur(dCf)} zur Basis`} tone={sumCf(scen) < 0 ? "bad" : undefined} />
            <Stat label={`Eigenkapital ${last(scen)?.year ?? ""}`} value={eurCompact(last(scen)?.equity ?? 0)} hint={same ? "Wert abzüglich Restschuld" : `${signedEur(dEq)} zur Basis`} tone="accent" />
            <Stat label={`Restschuld ${last(scen)?.year ?? ""}`} value={eurCompact(last(scen)?.debt ?? 0)} />
            <Stat label="Schwächstes Jahr" value={eur(worst?.cfAfterTax ?? 0)} hint={worst ? `${worst.year}, nach Steuern` : undefined} tone={(worst?.cfAfterTax ?? 0) < 0 ? "bad" : undefined} />
          </div>

          <Card className="rise rise-3" title="Verlauf" action={<div className="mr-9"><Segmented label="Größe" value={metric} onChange={setMetric} options={METRICS} /></div>}>
            <LineChart
              ariaLabel={`${METRICS.find((m) => m.value === metric)!.label}: Szenario gegenüber Basis`}
              labels={scen.map((r) => String(r.year))}
              series={[
                { key: "scen", label: "Szenario", color: S.gold, values: scen.map((r) => r[metric]), area: true },
                { key: "base", label: "Basis", color: S.muted, values: base.map((r) => r[metric]), dashed: true },
              ]}
              height={280}
            />
          </Card>

          <Card className="rise rise-4" pad={false} title="Szenario im Detail">
            <div className="max-h-[420px] overflow-auto">
              <table className="tbl text-[13px]">
                <thead className="sticky top-0 z-[1] bg-surface"><tr><th>Jahr</th><th className="r">Miete</th><th className="r">Kosten</th><th className="r">Zinsen</th><th className="r">Tilgung</th><th className="r">Steuer</th><th className="r">Cashflow n. St.</th><th className="r">Restschuld</th><th className="r">Eigenkapital</th></tr></thead>
                <tbody>
                  {scen.map((r) => (
                    <tr key={r.year}>
                      <td className="tnum">{r.year}</td>
                      <td className="r">{eur(r.rent)}</td>
                      <td className="r">{eur(r.opex + r.capex)}</td>
                      <td className="r">{eur(r.interest)}</td>
                      <td className="r">{eur(r.principal)}</td>
                      <td className="r">{eur(r.tax)}</td>
                      <td className={cx("r font-semibold", r.cfAfterTax < 0 && "text-bad")}>{eur(r.cfAfterTax)}</td>
                      <td className="r">{eur(r.debt)}</td>
                      <td className="r">{eur(r.equity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-line px-5 py-3 text-[12px] leading-snug text-muted">
              Modellrechnung, keine Prognose. Jahr 1 sind die kommenden zwölf Monate. Die Miete basiert auf der Sollmiete abzüglich Mietausfall; nach einer Zinsänderung bleibt die Rate bestehen, mindestens aber Zins plus 1 % Tilgung. Steuer mit {pct(pf.settings.taxRatePct, 0)} Grenzsteuersatz.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
