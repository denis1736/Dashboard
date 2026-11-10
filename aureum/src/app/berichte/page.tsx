"use client";

import { useState } from "react";
import { Building2, ChartNoAxesCombined, FileText, Landmark, Receipt, type LucideIcon } from "lucide-react";
import { yearOf } from "@/lib/calc/dates";
import type { ReportKind, ReportOptions } from "@/lib/report";
import { usePf } from "@/components/blocks";
import { Empty, PageHeader, Select } from "@/components/ui";
import { ReportButton } from "@/components/report-button";

export default function Berichte() {
  const { pf, today } = usePf();
  const [propertyId, setPropertyId] = useState(pf.properties[0]?.id ?? "");
  const [year, setYear] = useState(String(yearOf(today) - 1));
  const pid = pf.properties.some((p) => p.id === propertyId) ? propertyId : pf.properties[0]?.id ?? "";

  if (pf.properties.length === 0) return (<><PageHeader title="Berichte" /><div className="card"><Empty icon={<FileText size={22} />} title="Noch keine Daten für Berichte" text="Sobald ein Objekt erfasst ist, stehen alle Berichte bereit." /></div></>);

  const reports: { kind: ReportKind; icon: LucideIcon; title: string; text: string; contents: string[]; opts?: ReportOptions; control?: React.ReactNode }[] = [
    { kind: "portfolio", icon: FileText, title: "Portfolio-Report", text: "Der Gesamtüberblick für Bank, Family Office oder die eigene Ablage.", contents: ["Vermögen, Beleihung, Kennzahlen", "Vermögensentwicklung seit Kauf", "Objektübersicht und Hinweise", "Fristen der nächsten zwölf Monate"] },
    { kind: "objekt", icon: Building2, title: "Objekt-Report", text: "Ein Objekt vollständig: vom Kauf bis zum heutigen Cashflow.", contents: ["Stammdaten und Investition", "Cashflow-Kaskade und Kennzahlen", "Mieterliste mit Potenzial", "Darlehen und AfA"], opts: { propertyId: pid },
      control: <Select value={pid} onChange={setPropertyId} aria-label="Objekt" options={pf.properties.map((p) => ({ value: p.id, label: p.name }))} /> },
    { kind: "darlehen", icon: Landmark, title: "Darlehensübersicht", text: "Alle Finanzierungen mit Stand, Zinsbindung und Tilgungsplan.", contents: ["Restschulden und Kapitaldienst", "Zinsbindungsleiter", "Tilgungsplan je Darlehen (jährlich)"] },
    { kind: "cashflow", icon: ChartNoAxesCombined, title: "Cashflow und Kennzahlen", text: "Die Ertragsrechnung des Bestands mit Objektvergleich.", contents: ["Kaskade von Miete bis Cashflow nach Steuern", "Kennzahlenvergleich aller Objekte", "Projektion über 15 Jahre"] },
    { kind: "steuer", icon: Receipt, title: "Steuerunterlagen", text: "Aufstellung für die Anlage V, je Objekt und in Summe.", contents: ["Einnahmen und Werbungskosten", "AfA-Bemessungsgrundlage und Betrag", "Einzelausgaben des Jahres"], opts: { year: Number(year) },
      control: <Select value={year} onChange={setYear} aria-label="Veranlagungsjahr" options={[0, 1, 2, 3].map((d) => String(yearOf(today) - d)).map((v) => ({ value: v, label: `Veranlagungsjahr ${v}` }))} /> },
  ];

  return (
    <>
      <PageHeader title="Berichte" sub="Druckfertige PDF-Berichte im einheitlichen Erscheinungsbild. Sie entstehen vollständig auf diesem Gerät; es werden keine Daten übertragen." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {reports.map((r, i) => (
          <section key={r.kind} className={`card rise rise-${Math.min(i + 1, 5)} flex flex-col p-6`}>
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft text-accent"><r.icon size={20} strokeWidth={1.75} /></div>
            <h2 className="display text-[26px]">{r.title}</h2>
            <p className="mt-1 text-text-2">{r.text}</p>
            <ul className="my-4 flex-1 space-y-1.5 text-[13px] text-text-2">
              {r.contents.map((c) => <li key={c} className="flex gap-2.5"><span className="mt-[8px] h-1 w-1 shrink-0 rounded-full bg-accent" />{c}</li>)}
            </ul>
            {r.control && <div className="mb-3">{r.control}</div>}
            <ReportButton kind={r.kind} opts={r.opts} label="PDF erzeugen" variant="primary" />
          </section>
        ))}
      </div>
    </>
  );
}
