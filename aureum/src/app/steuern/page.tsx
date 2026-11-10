"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Download, Receipt } from "lucide-react";
import { taxYear, type TaxYear } from "@/lib/calc/tax";
import { yearOf } from "@/lib/calc/dates";
import { eur, eurCompact, pct } from "@/lib/format";
import { downloadText, toCsv } from "@/lib/csv";
import { usePf } from "@/components/blocks";
import { Button, Card, cx, Empty, PageHeader, Segmented, Stat } from "@/components/ui";
import { ReportButton } from "@/components/report-button";

const COLS: { key: keyof TaxYear; label: string }[] = [
  { key: "income", label: "Einnahmen" },
  { key: "afa", label: "AfA" },
  { key: "interest", label: "Schuldzinsen" },
  { key: "maintenance", label: "Erhaltung" },
  { key: "management", label: "Verwaltung" },
  { key: "operating", label: "Betriebskosten" },
  { key: "other", label: "Sonstige" },
  { key: "result", label: "Ergebnis" },
];

export default function Steuern() {
  const { pf, today } = usePf();
  const now = yearOf(today);
  const years = [now, now - 1, now - 2, now - 3].map(String);
  const [year, setYear] = useState(String(now - 1));
  const y = Number(year);

  const rows = useMemo(() => pf.properties.filter((p) => yearOf(p.purchaseDate) <= y).map((p) => ({ p, t: taxYear(p, pf, y) })), [pf, y]);
  const sum = (k: keyof TaxYear) => rows.reduce((s, r) => s + (r.t[k] as number), 0);

  const exportCsv = () => {
    const head = ["Objekt", "Mieteinnahmen kalt", "Umlagen", "Summe Einnahmen", "AfA-Bemessungsgrundlage", "AfA", "Schuldzinsen", "Erhaltungsaufwand", "Verwaltung", "Betriebskosten", "Sonstige", "Summe Werbungskosten", "Ergebnis"];
    const line = (name: string, t: Pick<TaxYear, "rent" | "prepayments" | "income" | "afaBasis" | "afa" | "interest" | "maintenance" | "management" | "operating" | "other" | "deductions" | "result">) =>
      [name, t.rent, t.prepayments, t.income, t.afaBasis, t.afa, t.interest, t.maintenance, t.management, t.operating, t.other, t.deductions, t.result];
    downloadText(`aureum-anlage-v-${y}.csv`, toCsv([head, ...rows.map((r) => line(r.p.name, r.t))]));
  };

  if (pf.properties.length === 0) return (<><PageHeader title="Steuern" /><div className="card"><Empty icon={<Receipt size={22} />} title="Noch keine Objekte" /></div></>);

  return (
    <>
      <PageHeader title="Steuern" sub="Einkünfte aus Vermietung und Verpachtung je Objekt, gegliedert wie die Anlage V. Als Vorbereitung für Sie und Ihren Steuerberater.">
        <Segmented label="Veranlagungsjahr" value={year} onChange={setYear} options={years.map((v) => ({ value: v, label: v }))} />
        <Button icon={<Download size={15} />} onClick={exportCsv}>CSV</Button>
        <ReportButton kind="steuer" opts={{ year: y }} label="Steuerunterlagen" />
      </PageHeader>

      <div className="card rise rise-1 mb-4 grid grid-cols-2 gap-x-6 gap-y-6 p-5 md:grid-cols-4">
        <Stat label="Einnahmen" value={eurCompact(sum("income"))} hint="Mieten und Umlagen" />
        <Stat label="Werbungskosten" value={eurCompact(sum("deductions"))} hint={`davon AfA ${eurCompact(sum("afa"))}`} />
        <Stat label={sum("result") >= 0 ? "Überschuss" : "Verlust"} value={eur(sum("result"))} tone="accent" />
        <Stat label={sum("taxEffect") >= 0 ? "Steuerbelastung" : "Steuerentlastung"} value={eur(Math.abs(sum("taxEffect")))} hint={`bei ${pct(pf.settings.taxRatePct, 0)} Grenzsteuersatz`} tone={sum("taxEffect") < 0 ? "good" : undefined} />
      </div>

      <Card className="rise rise-2" pad={false} title={`Objekte ${y}`}>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Objekt</th>{COLS.map((c) => <th key={c.key} className="r">{c.label}</th>)}</tr></thead>
            <tbody>
              {rows.map(({ p, t }) => (
                <tr key={p.id}>
                  <td className="min-w-[200px]"><Link href={`/objekte/${p.id}`} className="font-medium hover:text-accent">{p.name}</Link></td>
                  {COLS.map((c) => <td key={c.key} className={cx("r", c.key === "result" && "font-semibold")}>{eur(t[c.key] as number)}</td>)}
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td>Summe</td>{COLS.map((c) => <td key={c.key} className="r">{eur(sum(c.key))}</td>)}</tr></tfoot>
          </table>
        </div>
        <p className="border-t border-line px-5 py-3 text-[12px] leading-snug text-muted">
          Grundlage: Sollmieten laut Verträgen, laufende Kosten (im Kaufjahr zeitanteilig), erfasste Einzelausgaben, Zinsen laut Tilgungsplan. Die Instandhaltungsrücklage ist erst bei Verausgabung abziehbar und hier nicht enthalten. Keine Steuerberatung.
        </p>
      </Card>
    </>
  );
}
