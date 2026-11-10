import type { Portfolio } from "./types";

export type ReportKind = "portfolio" | "objekt" | "darlehen" | "cashflow" | "steuer" | "memo";

export interface ReportOptions {
  propertyId?: string;
  year?: number;
  /** Für das Memo: Titel und Text (Markdown-ähnlich) aus dem Berater. */
  title?: string;
  body?: string;
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
