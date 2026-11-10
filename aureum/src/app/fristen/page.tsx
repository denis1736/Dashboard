"use client";

import { useMemo, useState } from "react";
import { CalendarClock, Plus } from "lucide-react";
import { deadlines, DEADLINE_KIND_LABEL } from "@/lib/calc/deadlines";
import { monthDE } from "@/lib/format";
import type { Reminder, ReminderKind } from "@/lib/types";
import { DeadlineList, usePf } from "@/components/blocks";
import { Button, Card, cx, Empty, PageHeader, Segmented, Stat } from "@/components/ui";
import { ReminderForm } from "@/components/forms";

type Range = "30" | "90" | "365" | "3650";

export default function Fristen() {
  const { pf, today } = usePf();
  const [range, setRange] = useState<Range>("365");
  const [kind, setKind] = useState<ReminderKind | "alle">("alle");
  const [form, setForm] = useState<{ open: boolean; reminder?: Reminder }>({ open: false });

  const all = useMemo(() => deadlines(pf, today, 3650), [pf, today]);
  const inRange = all.filter((d) => d.days <= Number(range));
  const shown = kind === "alle" ? inRange : inRange.filter((d) => d.kind === kind);
  const kinds = [...new Set(inRange.map((d) => d.kind))];
  const count = (n: number) => all.filter((d) => d.days <= n).length;

  const months = [...new Set(shown.map((d) => (d.days < 0 ? "überfällig" : d.date.slice(0, 7))))];

  return (
    <>
      <PageHeader title="Fristen" sub="Zinsbindungen, Spekulationsfristen, Staffeln und Vertragsenden entstehen aus Ihren Daten. Eigene Termine ergänzen Sie selbst.">
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => setForm({ open: true })}>Termin</Button>
      </PageHeader>

      <div className="card rise rise-1 mb-4 grid grid-cols-3 gap-x-6 p-5">
        <Stat label="Nächste 30 Tage" value={count(30)} tone={count(30) ? "accent" : undefined} />
        <Stat label="Nächste 90 Tage" value={count(90)} />
        <Stat label="Nächste 12 Monate" value={count(365)} />
      </div>

      <div className="rise rise-2 mb-4 flex flex-wrap items-center gap-3">
        <Segmented label="Zeitraum" value={range} onChange={setRange} options={[{ value: "30", label: "30 Tage" }, { value: "90", label: "90 Tage" }, { value: "365", label: "12 Monate" }, { value: "3650", label: "10 Jahre" }]} />
        <div className="flex flex-wrap gap-1.5">
          {(["alle", ...kinds] as const).map((k) => (
            <button key={k} onClick={() => setKind(k)} className={cx("h-8 rounded-full border px-3 text-[13px] font-medium transition-colors", kind === k ? "border-accent bg-accent-soft" : "border-line text-text-2 hover:border-line-strong")}>
              {k === "alle" ? "Alle" : DEADLINE_KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="card"><Empty icon={<CalendarClock size={22} />} title="Keine Fristen in diesem Zeitraum" text="Erweitern Sie den Zeitraum oder legen Sie einen eigenen Termin an." /></div>
      ) : (
        <div className="space-y-4">
          {months.map((mk, i) => (
            <Card key={mk} className={`rise rise-${Math.min(i + 2, 5)}`} title={mk === "überfällig" ? "Überfällig" : monthDE(mk)}>
              <DeadlineList items={shown.filter((d) => (d.days < 0 ? "überfällig" : d.date.slice(0, 7)) === mk)} onEdit={(id) => setForm({ open: true, reminder: pf.reminders.find((r) => r.id === id) })} />
            </Card>
          ))}
        </div>
      )}
      <ReminderForm open={form.open} onClose={() => setForm({ open: false })} reminder={form.reminder} />
    </>
  );
}
