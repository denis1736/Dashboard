"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { uid } from "@/lib/format";
import { todayISO, addYears } from "@/lib/calc/dates";
import { statutoryAfaRate } from "@/lib/calc/afa";
import { contractualPayment } from "@/lib/calc/loans";
import { eur2 } from "@/lib/format";
import {
  EXPENSE_CATEGORY_LABEL, LOAN_TYPE_LABEL, PROPERTY_TYPE_LABEL, UNIT_STATUS_LABEL,
  type Expense, type ExpenseCategory, type Lease, type Loan, type LoanType, type Property, type PropertyType,
  type Reminder, type ReminderKind, type RentType, type Unit, type UnitStatus, type AfaMethod,
} from "@/lib/types";
import { DEADLINE_KIND_LABEL } from "@/lib/calc/deadlines";
import { Button, Field, IconButton, Modal, NumberInput, Select, TextInput, Toggle } from "./ui";

function useDraft<T>(open: boolean, make: () => T) {
  const [draft, setDraft] = useState<T>(make);
  useEffect(() => {
    if (open) setDraft(make());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const patch = (p: Partial<T>) => setDraft((d) => ({ ...d, ...p }));
  return [draft, patch] as const;
}

const opts = <T extends string>(rec: Record<T, string>) => (Object.keys(rec) as T[]).map((value) => ({ value, label: rec[value] }));

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="mb-6 last:mb-0">
      <legend className="eyebrow mb-3">{title}</legend>
      <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-6">{children}</div>
    </fieldset>
  );
}

const DateInput = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
  <input type="date" className="field" value={value} onChange={(e) => onChange(e.target.value)} />
);

/** Löschen mit Rückfrage im selben Knopf: kein zweiter Dialog, aber kein versehentlicher Klick. */
export function DeleteButton({ onDelete, what, size }: { onDelete: () => void; what: string; size?: "sm" | "md" }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <Button variant="danger" size={size} className="mr-auto" icon={<Trash2 size={15} />} onClick={() => (armed ? onDelete() : setArmed(true))}>
      {armed ? `${what} wirklich löschen?` : "Löschen"}
    </Button>
  );
}

/* ───────────── Objekt ───────────── */

export function PropertyForm({ open, onClose, property, onSaved, onDeleted }: { open: boolean; onClose: () => void; property?: Property; onSaved?: (id: string) => void; onDeleted?: () => void }) {
  const { upsert, remove } = useStore();
  const [d, set] = useDraft<Property>(open, () => property ?? {
    id: uid(), name: "", street: "", zip: "", city: "", type: "ETW", yearBuilt: 1990,
    purchaseDate: todayISO(), notaryDate: todayISO(), purchasePrice: 0,
    closingCosts: { grunderwerbsteuer: 0, notar: 0, makler: 0, sonstige: 0 },
    initialCapex: 0, landSharePct: 25, afa: { method: "linear", ratePct: 2 },
    valuation: { mode: "index" }, costs: { verwaltung: 0, instandhaltung: 0, sonstige: 0, umlagefaehig: 0 },
  });
  const cc = (k: keyof Property["closingCosts"], v: number) => set({ closingCosts: { ...d.closingCosts, [k]: v } });
  const co = (k: keyof Property["costs"], v: number) => set({ costs: { ...d.costs, [k]: v } });
  const valid = d.name.trim().length > 0 && d.purchasePrice > 0;

  const save = () => {
    upsert("properties", { ...d, name: d.name.trim() });
    // Einzelobjekte bekommen direkt ihre eine Einheit, damit Miete und Fläche einen Platz haben.
    if (!property && d.type !== "MFH" && d.type !== "WGH") {
      upsert("units", { id: uid(), propertyId: d.id, name: d.type === "EFH" ? "Haus" : d.type === "STP" ? "Stellplatz" : "Wohnung", area: 0, rooms: 0, status: "leer", marketRent: 0 });
    }
    onClose();
    onSaved?.(d.id);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={property ? "Objekt bearbeiten" : "Neues Objekt"}
      description="Kaufdaten und laufende Kosten sind die Grundlage für Rendite, AfA und Cashflow."
      footer={<>
        {property && <DeleteButton what="Objekt" onDelete={() => { remove("properties", property.id); onClose(); onDeleted?.(); }} />}
        <Button onClick={onClose}>Abbrechen</Button>
        <Button variant="primary" disabled={!valid} onClick={save}>Speichern</Button>
      </>}
    >
      <Section title="Stammdaten">
        <Field label="Bezeichnung" className="col-span-2 sm:col-span-4"><TextInput value={d.name} onChange={(name) => set({ name })} placeholder="z. B. Altbauwohnung Lindenstraße" autoFocus={!property} /></Field>
        <Field label="Objektart" className="col-span-2"><Select<PropertyType> value={d.type} onChange={(type) => set({ type })} options={opts(PROPERTY_TYPE_LABEL)} /></Field>
        <Field label="Straße und Hausnummer" className="col-span-2 sm:col-span-3"><TextInput value={d.street} onChange={(street) => set({ street })} /></Field>
        <Field label="PLZ" className="sm:col-span-1"><TextInput value={d.zip} onChange={(zip) => set({ zip })} inputMode="numeric" /></Field>
        <Field label="Ort" className="sm:col-span-2"><TextInput value={d.city} onChange={(city) => set({ city })} /></Field>
        <Field label="Baujahr" className="col-span-2"><NumberInput value={d.yearBuilt} onChange={(yearBuilt) => set({ yearBuilt, afa: d.afa.method === "linear" ? { method: "linear", ratePct: statutoryAfaRate(yearBuilt) } : d.afa })} /></Field>
      </Section>

      <Section title="Kauf">
        <Field label="Kaufvertrag (Notar)" hint="Start der Spekulationsfrist" className="sm:col-span-3"><DateInput value={d.notaryDate} onChange={(notaryDate) => set({ notaryDate })} /></Field>
        <Field label="Übergang Nutzen und Lasten" hint="Start von AfA und Mieteinnahmen" className="sm:col-span-3"><DateInput value={d.purchaseDate} onChange={(purchaseDate) => set({ purchaseDate })} /></Field>
        <Field label="Kaufpreis" className="col-span-2 sm:col-span-3"><NumberInput value={d.purchasePrice} onChange={(purchasePrice) => set({ purchasePrice })} suffix="€" /></Field>
        <Field label="Anfangsinvestition" hint="Renovierung und anschaffungsnahe Kosten" className="col-span-2 sm:col-span-3"><NumberInput value={d.initialCapex} onChange={(initialCapex) => set({ initialCapex })} suffix="€" /></Field>
        <Field label="Grunderwerbsteuer" className="sm:col-span-3"><NumberInput value={d.closingCosts.grunderwerbsteuer} onChange={(v) => cc("grunderwerbsteuer", v)} suffix="€" /></Field>
        <Field label="Notar und Grundbuch" className="sm:col-span-3"><NumberInput value={d.closingCosts.notar} onChange={(v) => cc("notar", v)} suffix="€" /></Field>
        <Field label="Makler" className="sm:col-span-3"><NumberInput value={d.closingCosts.makler} onChange={(v) => cc("makler", v)} suffix="€" /></Field>
        <Field label="Sonstige Nebenkosten" className="sm:col-span-3"><NumberInput value={d.closingCosts.sonstige} onChange={(v) => cc("sonstige", v)} suffix="€" /></Field>
      </Section>

      <Section title="Abschreibung und Wert">
        <Field label="Bodenwertanteil" hint="Nicht abschreibbar; laut Kaufvertrag oder BMF-Arbeitshilfe" className="col-span-2"><NumberInput value={d.landSharePct} onChange={(landSharePct) => set({ landSharePct })} suffix="%" digits={1} /></Field>
        <Field label="AfA-Methode" className="col-span-2">
          <Select<AfaMethod>
            value={d.afa.method}
            onChange={(method) => set({ afa: { method, ratePct: method === "degressiv" ? 5 : method === "linear" ? statutoryAfaRate(d.yearBuilt) : d.afa.ratePct } })}
            options={[{ value: "linear", label: "Linear (gesetzlich)" }, { value: "degressiv", label: "Degressiv (§ 7 Abs. 5a)" }, { value: "individuell", label: "Individuell (Gutachten)" }]}
          />
        </Field>
        <Field label="AfA-Satz" className="col-span-2"><NumberInput value={d.afa.ratePct} onChange={(ratePct) => set({ afa: { ...d.afa, ratePct } })} suffix="%" digits={2} /></Field>
        <Field label="Marktwert" className="col-span-2">
          <Select value={d.valuation.mode} onChange={(mode) => set({ valuation: { ...d.valuation, mode } })} options={[{ value: "index", label: "Schätzung per Preisindex" }, { value: "manuell", label: "Eigener Wert (Gutachten)" }]} />
        </Field>
        {d.valuation.mode === "manuell" && <>
          <Field label="Wert" className="col-span-2"><NumberInput value={d.valuation.manualValue} onChange={(manualValue) => set({ valuation: { ...d.valuation, manualValue } })} suffix="€" /></Field>
          <Field label="Stichtag" className="col-span-2"><DateInput value={d.valuation.manualDate ?? todayISO()} onChange={(manualDate) => set({ valuation: { ...d.valuation, manualDate } })} /></Field>
        </>}
      </Section>

      <Section title="Laufende Kosten pro Jahr">
        <Field label="Verwaltung" hint="Nicht umlagefähig" className="sm:col-span-3"><NumberInput value={d.costs.verwaltung} onChange={(v) => co("verwaltung", v)} suffix="€" /></Field>
        <Field label="Instandhaltung" hint="Rücklage oder kalkulatorisch" className="sm:col-span-3"><NumberInput value={d.costs.instandhaltung} onChange={(v) => co("instandhaltung", v)} suffix="€" /></Field>
        <Field label="Sonstige, nicht umlagefähig" className="sm:col-span-3"><NumberInput value={d.costs.sonstige} onChange={(v) => co("sonstige", v)} suffix="€" /></Field>
        <Field label="Umlagefähige Betriebskosten" hint="Trägt bei Leerstand der Eigentümer" className="sm:col-span-3"><NumberInput value={d.costs.umlagefaehig} onChange={(v) => co("umlagefaehig", v)} suffix="€" /></Field>
      </Section>
    </Modal>
  );
}

/* ───────────── Einheit ───────────── */

export function UnitForm({ open, onClose, propertyId, unit }: { open: boolean; onClose: () => void; propertyId: string; unit?: Unit }) {
  const { upsert, remove } = useStore();
  const [d, set] = useDraft<Unit>(open, () => unit ?? { id: uid(), propertyId, name: "", area: 0, rooms: 2, status: "leer", marketRent: 0 });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={unit ? "Einheit bearbeiten" : "Neue Einheit"}
      footer={<>
        {unit && <DeleteButton what="Einheit" onDelete={() => { remove("units", unit.id); onClose(); }} />}
        <Button onClick={onClose}>Abbrechen</Button>
        <Button variant="primary" disabled={!d.name.trim()} onClick={() => { upsert("units", { ...d, name: d.name.trim() }); onClose(); }}>Speichern</Button>
      </>}
    >
      <Section title="Einheit">
        <Field label="Bezeichnung" className="col-span-2 sm:col-span-6"><TextInput value={d.name} onChange={(name) => set({ name })} placeholder="z. B. 2. OG links" autoFocus={!unit} /></Field>
        <Field label="Wohnfläche" className="sm:col-span-2"><NumberInput value={d.area} onChange={(area) => set({ area })} suffix="m²" digits={2} /></Field>
        <Field label="Zimmer" className="sm:col-span-2"><NumberInput value={d.rooms} onChange={(rooms) => set({ rooms })} digits={1} /></Field>
        <Field label="Marktmiete kalt" hint="Erzielbar bei Neuvermietung" className="col-span-2"><NumberInput value={d.marketRent} onChange={(marketRent) => set({ marketRent })} suffix="€" /></Field>
        <Field label="Status ohne Mietvertrag" hint="Mit laufendem Vertrag gilt die Einheit als vermietet." className="col-span-2 sm:col-span-3">
          <Select<UnitStatus> value={d.status === "vermietet" ? "leer" : d.status} onChange={(status) => set({ status })} options={opts(UNIT_STATUS_LABEL).filter((o) => o.value !== "vermietet")} />
        </Field>
        <Field label="Leer seit" className="col-span-2 sm:col-span-3"><DateInput value={d.vacantSince ?? ""} onChange={(v) => set({ vacantSince: v || undefined })} /></Field>
      </Section>
    </Modal>
  );
}

/* ───────────── Mietvertrag ───────────── */

export function LeaseForm({ open, onClose, unit, lease }: { open: boolean; onClose: () => void; unit: Unit; lease?: Lease }) {
  const { upsert, remove } = useStore();
  const [d, set] = useDraft<Lease>(open, () => lease ?? {
    id: uid(), unitId: unit.id, tenantName: "", start: todayISO(), coldRent: unit.marketRent, prepayment: 0, deposit: unit.marketRent * 3, rentType: "standard", steps: [],
  });
  const step = (i: number, p: Partial<Lease["steps"][number]>) => set({ steps: d.steps.map((s, n) => (n === i ? { ...s, ...p } : s)) });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={lease ? "Mietvertrag bearbeiten" : "Neuer Mietvertrag"}
      description={unit.name}
      footer={<>
        {lease && <DeleteButton what="Vertrag" onDelete={() => { remove("leases", lease.id); onClose(); }} />}
        <Button onClick={onClose}>Abbrechen</Button>
        <Button variant="primary" disabled={!d.tenantName.trim() || !d.start} onClick={() => { upsert("leases", { ...d, tenantName: d.tenantName.trim(), steps: [...d.steps].sort((a, b) => a.date.localeCompare(b.date)) }); onClose(); }}>Speichern</Button>
      </>}
    >
      <Section title="Mieter">
        <Field label="Name" className="col-span-2 sm:col-span-6"><TextInput value={d.tenantName} onChange={(tenantName) => set({ tenantName })} autoFocus={!lease} /></Field>
        <Field label="E-Mail" className="col-span-2 sm:col-span-3"><TextInput type="email" value={d.tenantEmail ?? ""} onChange={(v) => set({ tenantEmail: v || undefined })} /></Field>
        <Field label="Telefon" className="col-span-2 sm:col-span-3"><TextInput type="tel" value={d.tenantPhone ?? ""} onChange={(v) => set({ tenantPhone: v || undefined })} /></Field>
      </Section>
      <Section title="Vertrag">
        <Field label="Mietbeginn" className="sm:col-span-3"><DateInput value={d.start} onChange={(start) => set({ start })} /></Field>
        <Field label="Mietende" hint="Leer = unbefristet" className="sm:col-span-3"><DateInput value={d.end ?? ""} onChange={(v) => set({ end: v || undefined })} /></Field>
        <Field label="Kaltmiete" className="sm:col-span-2"><NumberInput value={d.coldRent} onChange={(coldRent) => set({ coldRent })} suffix="€" digits={2} /></Field>
        <Field label="Vorauszahlung" className="sm:col-span-2"><NumberInput value={d.prepayment} onChange={(prepayment) => set({ prepayment })} suffix="€" digits={2} /></Field>
        <Field label="Kaution" className="col-span-2"><NumberInput value={d.deposit} onChange={(deposit) => set({ deposit })} suffix="€" /></Field>
        <Field label="Mietanpassung" className="col-span-2 sm:col-span-3">
          <Select<RentType> value={d.rentType} onChange={(rentType) => set({ rentType })} options={[{ value: "standard", label: "Vergleichsmiete (§ 558 BGB)" }, { value: "staffel", label: "Staffelmiete (§ 557a BGB)" }, { value: "index", label: "Indexmiete (§ 557b BGB)" }]} />
        </Field>
        <Field label="Letzte Erhöhung" className="col-span-2 sm:col-span-3"><DateInput value={d.lastIncrease ?? ""} onChange={(v) => set({ lastIncrease: v || undefined })} /></Field>
      </Section>
      {d.rentType === "staffel" && (
        <fieldset>
          <legend className="eyebrow mb-3">Staffeln</legend>
          <div className="space-y-2">
            {d.steps.map((s, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <DateInput value={s.date} onChange={(date) => step(i, { date })} />
                <NumberInput value={s.coldRent} onChange={(coldRent) => step(i, { coldRent })} suffix="€" digits={2} />
                <IconButton label="Staffel entfernen" onClick={() => set({ steps: d.steps.filter((_, n) => n !== i) })}><Trash2 size={15} /></IconButton>
              </div>
            ))}
          </div>
          <Button size="sm" className="mt-3" icon={<Plus size={14} />} onClick={() => {
            const last = d.steps[d.steps.length - 1];
            set({ steps: [...d.steps, { date: addYears(last?.date ?? d.start, 1), coldRent: Math.round((last?.coldRent ?? d.coldRent) * 1.03) }] });
          }}>Staffel hinzufügen</Button>
        </fieldset>
      )}
    </Modal>
  );
}

/* ───────────── Darlehen ───────────── */

export function LoanForm({ open, onClose, propertyId, loan }: { open: boolean; onClose: () => void; propertyId: string; loan?: Loan }) {
  const { upsert, remove } = useStore();
  const [d, set] = useDraft<Loan>(open, () => loan ?? {
    id: uid(), propertyId, lender: "", label: "", type: "annuitaet", principal: 0, startDate: todayISO(), interestPct: 3.5,
    repaymentPct: 2, fixedUntil: addYears(todayISO(), 10), specialRepayments: [], rateChanges: [],
  });
  const sp = (i: number, p: Partial<Loan["specialRepayments"][number]>) => set({ specialRepayments: d.specialRepayments.map((s, n) => (n === i ? { ...s, ...p } : s)) });
  const rc = (i: number, p: Partial<Loan["rateChanges"][number]>) => set({ rateChanges: d.rateChanges.map((s, n) => (n === i ? { ...s, ...p } : s)) });
  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={loan ? "Darlehen bearbeiten" : "Neues Darlehen"}
      footer={<>
        {loan && <DeleteButton what="Darlehen" onDelete={() => { remove("loans", loan.id); onClose(); }} />}
        <span className="mr-auto text-[13px] text-text-2">Monatsrate <strong className="tnum text-text">{eur2(contractualPayment(d))}</strong></span>
        <Button onClick={onClose}>Abbrechen</Button>
        <Button variant="primary" disabled={!d.lender.trim() || d.principal <= 0} onClick={() => { upsert("loans", { ...d, lender: d.lender.trim() }); onClose(); }}>Speichern</Button>
      </>}
    >
      <Section title="Darlehen">
        <Field label="Bank" className="col-span-2 sm:col-span-3"><TextInput value={d.lender} onChange={(lender) => set({ lender })} autoFocus={!loan} /></Field>
        <Field label="Bezeichnung" className="col-span-2 sm:col-span-3"><TextInput value={d.label} onChange={(label) => set({ label })} placeholder="z. B. Hauptdarlehen" /></Field>
        <Field label="Art" className="col-span-2 sm:col-span-3"><Select<LoanType> value={d.type} onChange={(type) => set({ type })} options={opts(LOAN_TYPE_LABEL)} /></Field>
        <Field label="Darlehenssumme" className="col-span-2 sm:col-span-3"><NumberInput value={d.principal} onChange={(principal) => set({ principal })} suffix="€" /></Field>
        <Field label="Auszahlung" className="sm:col-span-3"><DateInput value={d.startDate} onChange={(startDate) => set({ startDate })} /></Field>
        <Field label="Zinsbindung bis" className="sm:col-span-3"><DateInput value={d.fixedUntil} onChange={(fixedUntil) => set({ fixedUntil })} /></Field>
        <Field label="Sollzins p. a." className="sm:col-span-2"><NumberInput value={d.interestPct} onChange={(interestPct) => set({ interestPct })} suffix="%" digits={2} /></Field>
        {d.type !== "endfaellig" && <>
          <Field label="Anfängliche Tilgung" className="sm:col-span-2"><NumberInput value={d.repaymentPct} onChange={(repaymentPct) => set({ repaymentPct })} suffix="%" digits={2} /></Field>
          <Field label="Feste Rate" hint="Optional, ersetzt Zins + Tilgung" className="col-span-2"><NumberInput value={d.monthlyPayment} onChange={(v) => set({ monthlyPayment: v || undefined })} suffix="€" digits={2} placeholder="automatisch" /></Field>
        </>}
        <Field label="Anschlusszins (Annahme)" hint="Für Prognosen nach Ende der Zinsbindung" className="col-span-2 sm:col-span-3"><NumberInput value={d.followUpPct} onChange={(v) => set({ followUpPct: v || undefined })} suffix="%" digits={2} placeholder="unverändert" /></Field>
      </Section>
      <fieldset className="mb-6">
        <legend className="eyebrow mb-3">Sondertilgungen</legend>
        <div className="space-y-2">
          {d.specialRepayments.map((s, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <DateInput value={s.date} onChange={(date) => sp(i, { date })} />
              <NumberInput value={s.amount} onChange={(amount) => sp(i, { amount })} suffix="€" />
              <IconButton label="Sondertilgung entfernen" onClick={() => set({ specialRepayments: d.specialRepayments.filter((_, n) => n !== i) })}><Trash2 size={15} /></IconButton>
            </div>
          ))}
        </div>
        <Button size="sm" className="mt-3" icon={<Plus size={14} />} onClick={() => set({ specialRepayments: [...d.specialRepayments, { date: todayISO(), amount: 0 }] })}>Sondertilgung hinzufügen</Button>
      </fieldset>
      {d.type === "variabel" && (
        <fieldset>
          <legend className="eyebrow mb-3">Zinsänderungen</legend>
          <div className="space-y-2">
            {d.rateChanges.map((s, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <DateInput value={s.date} onChange={(date) => rc(i, { date })} />
                <NumberInput value={s.interestPct} onChange={(interestPct) => rc(i, { interestPct })} suffix="%" digits={2} />
                <IconButton label="Zinsänderung entfernen" onClick={() => set({ rateChanges: d.rateChanges.filter((_, n) => n !== i) })}><Trash2 size={15} /></IconButton>
              </div>
            ))}
          </div>
          <Button size="sm" className="mt-3" icon={<Plus size={14} />} onClick={() => set({ rateChanges: [...d.rateChanges, { date: todayISO(), interestPct: d.interestPct }] })}>Zinsänderung hinzufügen</Button>
        </fieldset>
      )}
    </Modal>
  );
}

/* ───────────── Ausgabe ───────────── */

export function ExpenseForm({ open, onClose, propertyId, expense }: { open: boolean; onClose: () => void; propertyId: string; expense?: Expense }) {
  const { upsert, remove } = useStore();
  const [d, set] = useDraft<Expense>(open, () => expense ?? { id: uid(), propertyId, date: todayISO(), category: "reparatur", amount: 0, deductible: true, note: "" });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={expense ? "Ausgabe bearbeiten" : "Neue Ausgabe"}
      description="Einmalige Ausgaben außerhalb der laufenden Kosten: Reparaturen, Modernisierungen, Sonderumlagen."
      footer={<>
        {expense && <DeleteButton what="Ausgabe" onDelete={() => { remove("expenses", expense.id); onClose(); }} />}
        <Button onClick={onClose}>Abbrechen</Button>
        <Button variant="primary" disabled={d.amount <= 0} onClick={() => { upsert("expenses", d); onClose(); }}>Speichern</Button>
      </>}
    >
      <Section title="Ausgabe">
        <Field label="Datum" className="sm:col-span-3"><DateInput value={d.date} onChange={(date) => set({ date })} /></Field>
        <Field label="Betrag" className="sm:col-span-3"><NumberInput value={d.amount} onChange={(amount) => set({ amount })} suffix="€" digits={2} /></Field>
        <Field label="Kategorie" className="col-span-2 sm:col-span-6">
          <Select<ExpenseCategory> value={d.category} onChange={(category) => set({ category, deductible: category !== "modernisierung" })} options={opts(EXPENSE_CATEGORY_LABEL)} />
        </Field>
        <Field label="Beschreibung" className="col-span-2 sm:col-span-6"><TextInput value={d.note} onChange={(note) => set({ note })} /></Field>
      </Section>
      <Toggle
        checked={d.deductible}
        onChange={(deductible) => set({ deductible })}
        label="Sofort als Werbungskosten abziehen"
        hint="Erhaltungsaufwand ist sofort abziehbar. Ausgeschaltet wird die Ausgabe aktiviert und über die AfA verteilt, etwa bei Standardhebung oder anschaffungsnahem Aufwand über 15 % in den ersten drei Jahren."
      />
    </Modal>
  );
}

/* ───────────── Termin ───────────── */

export function ReminderForm({ open, onClose, reminder }: { open: boolean; onClose: () => void; reminder?: Reminder }) {
  const { upsert, remove } = useStore();
  const properties = useStore((s) => s.pf.properties);
  const [d, set] = useDraft<Reminder>(open, () => reminder ?? { id: uid(), title: "", date: todayISO(), kind: "wartung", repeatMonths: 0, done: false });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={reminder ? "Termin bearbeiten" : "Neuer Termin"}
      description="Fristen aus Darlehen, Kaufdaten und Mietverträgen entstehen automatisch. Hier ergänzen Sie eigene Termine."
      footer={<>
        {reminder && <DeleteButton what="Termin" onDelete={() => { remove("reminders", reminder.id); onClose(); }} />}
        <Button onClick={onClose}>Abbrechen</Button>
        <Button variant="primary" disabled={!d.title.trim()} onClick={() => { upsert("reminders", { ...d, title: d.title.trim() }); onClose(); }}>Speichern</Button>
      </>}
    >
      <Section title="Termin">
        <Field label="Titel" className="col-span-2 sm:col-span-6"><TextInput value={d.title} onChange={(title) => set({ title })} placeholder="z. B. Heizungswartung" autoFocus={!reminder} /></Field>
        <Field label="Datum" className="sm:col-span-3"><DateInput value={d.date} onChange={(date) => set({ date })} /></Field>
        <Field label="Art" className="sm:col-span-3">
          <Select<ReminderKind> value={d.kind} onChange={(kind) => set({ kind })} options={(["wartung", "versicherung", "vertragsende", "mieterhoehung", "sonstiges"] as ReminderKind[]).map((value) => ({ value, label: DEADLINE_KIND_LABEL[value] }))} />
        </Field>
        <Field label="Objekt" className="col-span-2 sm:col-span-3">
          <Select value={d.propertyId ?? ""} onChange={(v) => set({ propertyId: v || undefined })} options={[{ value: "", label: "Gesamter Bestand" }, ...properties.map((p) => ({ value: p.id, label: p.name }))]} />
        </Field>
        <Field label="Wiederholung" className="col-span-2 sm:col-span-3">
          <Select value={String(d.repeatMonths)} onChange={(v) => set({ repeatMonths: Number(v) })} options={[{ value: "0", label: "Einmalig" }, { value: "1", label: "Monatlich" }, { value: "3", label: "Vierteljährlich" }, { value: "6", label: "Halbjährlich" }, { value: "12", label: "Jährlich" }, { value: "24", label: "Alle 2 Jahre" }, { value: "36", label: "Alle 3 Jahre" }]} />
        </Field>
        <Field label="Notiz" className="col-span-2 sm:col-span-6"><TextInput value={d.note ?? ""} onChange={(v) => set({ note: v || undefined })} /></Field>
      </Section>
    </Modal>
  );
}
