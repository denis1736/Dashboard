import type { Portfolio } from "./types";

export type ReportKind = "portfolio" | "objekt" | "darlehen" | "cashflow" | "steuer" | "memo" | "nebenkosten" | "mieterhoehung" | "mahnung";

export interface ReportOptions {
  propertyId?: string;
  year?: number;
  /** Für das Memo: Titel und Text (Markdown-ähnlich) aus dem Berater. */
  title?: string;
  body?: string;
  /** Nebenkosten: Abrechnung und optional ein einzelner Mietvertrag (sonst alle). */
  billingId?: string;
  leaseId?: string;
  /** Mieterhöhung und Mahnung: die Angaben aus dem jeweiligen Formular. */
  increase?: IncreaseLetter;
  dunning?: DunningLetter;
}

export interface IncreaseLetter {
  leaseId: string;
  letterDate: string;
  marketPerSqm: number;
  rentThreeYearsAgo: number;
  capPct: 15 | 20;
  requestedRent?: number;
  /** Begründung nach § 558a BGB. */
  basis: "mietspiegel" | "vergleichswohnungen" | "gutachten";
  basisText: string;
}

export interface DunningLetter {
  leaseId: string;
  letterDate: string;
  level: 1 | 2 | 3;
  /** Zahlungsfrist in Tagen ab Datum des Schreibens. */
  days: number;
}

/** Erzeugt den Bericht im Browser und lädt ihn herunter. Die PDF-Bibliothek wird erst hier nachgeladen. */
export async function downloadReport(kind: ReportKind, pf: Portfolio, today: string, opts: ReportOptions = {}): Promise<void> {
  const { renderReport } = await import("@/pdf");
  const { blob, filename } = await renderReport(kind, pf, today, opts);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
