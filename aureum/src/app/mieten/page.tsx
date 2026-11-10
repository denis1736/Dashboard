"use client";

import { useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, CheckCheck, Undo2, Wallet } from "lucide-react";
import { useStore } from "@/lib/store";
import { rentRoll, type RentRow, type RentStatus } from "@/lib/calc/rents";
import { monthIndex, monthKey } from "@/lib/calc/dates";
import { eur2, monthDE, pct, uid } from "@/lib/format";
import { usePf } from "@/components/blocks";
import { Badge, Button, Card, Empty, Field, IconButton, Meter, Modal, NumberInput, PageHeader, Stat, type Tone } from "@/components/ui";

const STATUS: Record<RentStatus, { label: string; tone: Tone }> = {
  bezahlt: { label: "Bezahlt", tone: "good" },
  teilweise: { label: "Teilzahlung", tone: "warn" },
  offen: { label: "Offen", tone: "neutral" },
  ueberfaellig: { label: "Überfällig", tone: "bad" },
};

export default function Mieten() {
  const { pf, today } = usePf();
  const { upsert, remove } = useStore();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [partial, setPartial] = useState<{ row: RentRow; amount: number } | null>(null);
  const roll = useMemo(() => rentRoll(pf, month, today), [pf, month, today]);

  const due = roll.reduce((s, r) => s + r.due, 0);
  const paid = roll.reduce((s, r) => s + Math.min(r.paid, r.due), 0);
  const open = roll.filter((r) => r.status !== "bezahlt");
  const shift = (d: number) => setMonth(monthKey(monthIndex(month) + d));

  const book = (r: RentRow, amount: number) => {
    if (amount <= 0) return;
    upsert("payments", { id: uid(), leaseId: r.lease.id, month, amount: Math.round(amount * 100) / 100, paidAt: today });
  };
  const undo = (r: RentRow) => pf.payments.filter((p) => p.leaseId === r.lease.id && p.month === month).forEach((p) => remove("payments", p.id));

  const groups = [...new Set(roll.map((r) => r.propertyId))];

  return (
    <>
      <PageHeader title="Mieteingänge" sub="Sollstellung aus den Mietverträgen, Eingänge mit einem Klick abhaken. Fällig ist die Miete am dritten Werktag.">
        <div className="flex items-center rounded-[11px] border border-line bg-surface">
          <IconButton label="Vorheriger Monat" onClick={() => shift(-1)}><ChevronLeft size={17} /></IconButton>
          <span className="min-w-[132px] text-center font-semibold">{monthDE(month)}</span>
          <IconButton label="Nächster Monat" onClick={() => shift(1)}><ChevronRight size={17} /></IconButton>
        </div>
      </PageHeader>

      {roll.length === 0 ? (
        <div className="card"><Empty icon={<Wallet size={22} />} title="Keine Sollmieten in diesem Monat" text="Mietverträge legen Sie beim jeweiligen Objekt unter Einheiten und Mieter an." /></div>
      ) : (
        <>
          <div className="card rise rise-1 mb-4 p-5">
            <div className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-4">
              <Stat label="Soll (warm)" value={eur2(due)} hint={`${roll.length} Verträge`} />
              <Stat label="Eingegangen" value={eur2(paid)} tone="good" />
              <Stat label="Offen" value={eur2(due - paid)} hint={`${open.length} ${open.length === 1 ? "Vertrag" : "Verträge"}`} tone={due - paid > 0.005 ? "bad" : undefined} />
              <Stat label="Eingangsquote" value={pct(due > 0 ? (paid / due) * 100 : 0)} />
            </div>
            <div className="mt-5"><Meter value={paid} max={due || 1} tone={paid >= due - 0.005 ? "good" : "accent"} label="Eingegangener Anteil der Sollmiete" /></div>
          </div>

          {open.length > 0 && (
            <div className="rise rise-2 mb-4 flex justify-end">
              <Button icon={<CheckCheck size={16} />} onClick={() => open.forEach((r) => book(r, r.due - r.paid))}>Alle {open.length} offenen als bezahlt buchen</Button>
            </div>
          )}

          <div className="space-y-4">
            {groups.map((gid, gi) => {
              const rows = roll.filter((r) => r.propertyId === gid);
              return (
                <Card key={gid} pad={false} className={`rise rise-${Math.min(gi + 2, 5)}`} title={rows[0].propertyName} action={<span className="tnum text-[13px] text-text-2">{eur2(rows.reduce((s, r) => s + Math.min(r.paid, r.due), 0))} von {eur2(rows.reduce((s, r) => s + r.due, 0))}</span>}>
                  <ul className="divide-y divide-line border-t border-line">
                    {rows.map((r) => (
                      <li key={r.lease.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                        <button
                          aria-label={r.status === "bezahlt" ? `Eingang für ${r.lease.tenantName} zurücknehmen` : `Miete von ${r.lease.tenantName} als bezahlt buchen`}
                          onClick={() => (r.status === "bezahlt" ? undo(r) : book(r, r.due - r.paid))}
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-all active:scale-90 ${r.status === "bezahlt" ? "border-good bg-good text-white" : "border-line-strong text-transparent hover:border-accent hover:text-accent"}`}
                        >
                          <Check size={15} strokeWidth={2.5} />
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{r.lease.tenantName}</div>
                          <div className="truncate text-[12px] text-muted">{r.unitName} · kalt {eur2(r.due - r.lease.prepayment)} + Vorauszahlung {eur2(r.lease.prepayment)}</div>
                        </div>
                        <Badge tone={STATUS[r.status].tone} dot>{STATUS[r.status].label}</Badge>
                        <div className="tnum w-[104px] text-right">
                          <div className="font-semibold">{eur2(r.due)}</div>
                          {r.status === "teilweise" && <div className="text-[12px] text-warn">{eur2(r.paid)} erhalten</div>}
                        </div>
                        <div className="flex w-[76px] justify-end">
                          {r.status === "bezahlt" || r.status === "teilweise"
                            ? <IconButton label="Buchung zurücknehmen" onClick={() => undo(r)}><Undo2 size={15} /></IconButton>
                            : null}
                          {r.status !== "bezahlt" && <Button size="sm" variant="ghost" onClick={() => setPartial({ row: r, amount: Math.round((r.due - r.paid) * 100) / 100 })}>Teil</Button>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <Modal open={!!partial} onClose={() => setPartial(null)} title="Teilzahlung buchen" description={partial ? `${partial.row.lease.tenantName} · ${monthDE(month)} · offen ${eur2(partial.row.due - partial.row.paid)}` : undefined}
        footer={<><Button onClick={() => setPartial(null)}>Abbrechen</Button><Button variant="primary" disabled={!partial || partial.amount <= 0} onClick={() => { if (partial) book(partial.row, partial.amount); setPartial(null); }}>Buchen</Button></>}>
        {partial && <Field label="Eingegangener Betrag"><NumberInput value={partial.amount} onChange={(amount) => setPartial({ ...partial, amount })} suffix="€" digits={2} /></Field>}
      </Modal>
    </>
  );
}
