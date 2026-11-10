import { pdf } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import type { Portfolio } from "@/lib/types";
import type { ReportKind, ReportOptions } from "@/lib/report";
import { yearOf } from "@/lib/calc/dates";
import { registerFonts } from "./kit";
import { CashflowReport, LoanReport, MemoReport, PortfolioReport, PropertyReport, TaxReport } from "./reports";

const slug = (s: string) => s.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function buildReport(kind: ReportKind, pf: Portfolio, today: string, opts: ReportOptions = {}): { doc: ReactElement; filename: string } {
  switch (kind) {
    case "portfolio":
      return { doc: <PortfolioReport pf={pf} today={today} />, filename: `aureum-portfolio-${today}.pdf` };
    case "objekt": {
      const p = pf.properties.find((x) => x.id === opts.propertyId) ?? pf.properties[0];
      if (!p) throw new Error("Kein Objekt vorhanden.");
      return { doc: <PropertyReport pf={pf} today={today} p={p} />, filename: `aureum-objekt-${slug(p.name)}-${today}.pdf` };
    }
    case "darlehen":
      return { doc: <LoanReport pf={pf} today={today} />, filename: `aureum-darlehen-${today}.pdf` };
    case "cashflow":
      return { doc: <CashflowReport pf={pf} today={today} />, filename: `aureum-cashflow-${today}.pdf` };
    case "steuer": {
      const year = opts.year ?? yearOf(today) - 1;
      return { doc: <TaxReport pf={pf} today={today} year={year} />, filename: `aureum-anlage-v-${year}.pdf` };
    }
    case "memo":
      return { doc: <MemoReport pf={pf} today={today} title={opts.title ?? "Auswertung"} body={opts.body ?? ""} />, filename: `aureum-auswertung-${today}.pdf` };
  }
}

export async function renderReport(kind: ReportKind, pf: Portfolio, today: string, opts: ReportOptions = {}): Promise<{ blob: Blob; filename: string }> {
  registerFonts("/fonts");
  const { doc, filename } = buildReport(kind, pf, today, opts);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blob = await pdf(doc as any).toBlob();
  return { blob, filename };
}
