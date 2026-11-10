"use client";

import { useState } from "react";
import { FileDown, LoaderCircle } from "lucide-react";
import { downloadReport, type ReportKind, type ReportOptions } from "@/lib/report";
import { usePf } from "./blocks";
import { Button } from "./ui";

export function ReportButton({ kind, opts, label = "PDF", variant = "secondary", size = "md" }: { kind: ReportKind; opts?: ReportOptions; label?: string; variant?: "primary" | "secondary" | "ghost"; size?: "sm" | "md" }) {
  const { pf, today } = usePf();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  return (
    <Button
      variant={variant}
      size={size}
      disabled={busy}
      title={error ? "Der Bericht konnte nicht erzeugt werden. Bitte erneut versuchen." : undefined}
      icon={busy ? <LoaderCircle size={15} className="animate-spin" /> : <FileDown size={15} />}
      onClick={async () => {
        setBusy(true);
        setError(false);
        try {
          await downloadReport(kind, pf, today, opts);
        } catch (e) {
          console.error(e);
          setError(true);
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "Erzeuge …" : error ? "Fehlgeschlagen – erneut" : label}
    </Button>
  );
}
