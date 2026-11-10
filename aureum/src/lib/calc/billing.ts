import type { AllocationKey, Billing, CostItem, Lease, Portfolio, Property, Unit } from "../types";
import { ALLOCATION_LABEL, BETRKV } from "../types";
import { daysBetween, monthIndex, round2 } from "./dates";

export interface StatementLine {
  item: CostItem;
  title: string;
  key: AllocationKey;
  /** Summe aller Verteilereinheiten im Objekt (z. B. m² gesamt); null bei direkter Zuordnung. */
  denom: number | null;
  /** Verteilereinheiten der Wohnung. */
  num: number;
  amount: number;
}

export interface Statement {
  billing: Billing;
  lease: Lease;
  unit: Unit;
  property: Property;
  from: string;
  to: string;
  days: number;
  daysInYear: number;
  lines: StatementLine[];
  costs: number;
  /** Vertragliches Soll der Vorauszahlungen im Zeitraum. */
  prepaidDue: number;
  /** Angesetzte Vorauszahlungen: erfasster Ist-Wert, sonst das Soll. */
  prepaid: number;
  /** Positiv = Nachzahlung des Mieters, negativ = Guthaben. */
  balance: number;
  labor35a: number;
  /** Kostendeckende Vorauszahlung pro Monat, auf volle Euro gerundet. */
  suggestedPrepayment: number;
}

export const costTitle = (item: CostItem): string => {
  const c = BETRKV.find((b) => b.key === item.category);
  return [c?.label ?? "Betriebskosten", item.label].filter(Boolean).join(" · ");
};

export const UNIT_OF_KEY: Record<AllocationKey, string> = {
  flaeche: "m²",
  einheiten: "Einh.",
  personen: "Pers.",
  verbrauch: "Einh.",
  direkt: "€",
};

const daysInYear = (year: number): number => (new Date(year, 1, 29).getMonth() === 1 ? 366 : 365);

/**
 * Einzelabrechnung je Mietvertrag.
 *
 * Verteilung: Gesamtkosten × Anteil der Wohnung am Schlüssel × Nutzungstage / Jahrestage.
 * Leerstand bleibt im Nenner und geht damit zu Lasten des Eigentümers. Bei
 * Mieterwechsel innerhalb des Jahres wird jede Kostenart zeitanteilig geteilt;
 * für Verbrauchskosten mit Zwischenablesung sind stattdessen die abgelesenen
 * Werte als direkte Zuordnung zu erfassen.
 */
export function statements(billing: Billing, pf: Portfolio): Statement[] {
  const property = pf.properties.find((p) => p.id === billing.propertyId);
  if (!property) return [];
  const units = pf.units.filter((u) => u.propertyId === property.id);
  const yStart = `${billing.year}-01-01`;
  const yEnd = `${billing.year}-12-31`;
  const diy = daysInYear(billing.year);
  const totalArea = units.reduce((s, u) => s + u.area, 0);
  const out: Statement[] = [];

  for (const unit of units) {
    for (const lease of pf.leases.filter((l) => l.unitId === unit.id)) {
      const from = lease.start > yStart ? lease.start : yStart;
      const to = lease.end && lease.end < yEnd ? lease.end : yEnd;
      if (from > to) continue;
      const days = daysBetween(from, to) + 1;
      const time = days / diy;

      const lines: StatementLine[] = billing.items.map((item) => {
        let denom: number | null = null;
        let num = 0;
        let amount = 0;
        if (item.key === "direkt") {
          num = item.shares[unit.id] ?? 0;
          amount = num * time;
        } else {
          if (item.key === "flaeche") { denom = totalArea; num = unit.area; }
          else if (item.key === "einheiten") { denom = units.length; num = 1; }
          else { denom = units.reduce((s, u) => s + (item.shares[u.id] ?? 0), 0); num = item.shares[unit.id] ?? 0; }
          amount = denom > 0 ? (item.amount * num * time) / denom : 0;
        }
        return { item, title: costTitle(item), key: item.key, denom, num, amount: round2(amount) };
      });

      const costs = round2(lines.reduce((s, l) => s + l.amount, 0));
      const months = monthIndex(to) - monthIndex(from) + 1;
      const prepaidDue = round2(lease.prepayment * months);
      const prepaid = billing.prepaid[lease.id] ?? prepaidDue;
      const labor35a = round2(lines.reduce((s, l) => s + (l.item.amount > 0 ? (l.item.labor35a * l.amount) / l.item.amount : 0), 0));
      out.push({
        billing, lease, unit, property, from, to, days, daysInYear: diy, lines, costs, prepaidDue, prepaid,
        balance: round2(costs - prepaid), labor35a,
        suggestedPrepayment: Math.ceil(costs / months),
      });
    }
  }
  return out.sort((a, b) => a.unit.name.localeCompare(b.unit.name) || a.from.localeCompare(b.from));
}

export const billingTotal = (b: Billing): number => round2(b.items.reduce((s, i) => s + i.amount, 0));

/** Abrechnungsfrist: Zugang beim Mieter bis zwölf Monate nach Ende des Abrechnungszeitraums (§ 556 Abs. 3 BGB). */
export const billingDeadline = (year: number): string => `${year + 1}-12-31`;

/** Plausibilitätsprüfungen, die formelle und inhaltliche Fehler der Abrechnung verhindern sollen. */
export function billingWarnings(billing: Billing, pf: Portfolio, today: string): string[] {
  const w: string[] = [];
  const units = pf.units.filter((u) => u.propertyId === billing.propertyId);
  if (units.some((u) => u.area <= 0) && billing.items.some((i) => i.key === "flaeche")) {
    w.push("Mindestens eine Einheit hat keine Wohnfläche. Der Flächenschlüssel verteilt dann falsch.");
  }
  for (const item of billing.items) {
    const title = costTitle(item);
    if (item.key === "direkt") {
      const sum = units.reduce((s, u) => s + (item.shares[u.id] ?? 0), 0);
      if (Math.abs(sum - item.amount) > 0.5) w.push(`${title}: Die direkt zugeordneten Beträge (${sum.toLocaleString("de-DE")} €) weichen von den Gesamtkosten (${item.amount.toLocaleString("de-DE")} €) ab.`);
    }
    if ((item.key === "personen" || item.key === "verbrauch") && units.every((u) => !(item.shares[u.id] > 0))) {
      w.push(`${title}: Für den Schlüssel „${ALLOCATION_LABEL[item.key]}“ fehlen die Werte je Einheit.`);
    }
    if ((item.category === "heizung" || item.category === "warmwasser") && item.key !== "verbrauch" && item.key !== "direkt") {
      w.push(`${title}: Nach der Heizkostenverordnung sind 50 bis 70 % nach Verbrauch abzurechnen. Ohne Verbrauchserfassung darf der Mieter den Anteil um 15 % kürzen (§ 12 HeizkostenV). Übernehmen Sie die Beträge je Wohnung aus der Abrechnung des Messdienstes als direkte Zuordnung.`);
    }
    if (item.category === "antenne") w.push(`${title}: Kabel-TV-Entgelte sind seit 1. Juli 2024 nicht mehr umlagefähig; nur Betriebskosten der Anlage (z. B. Strom) dürfen angesetzt werden.`);
    if (item.category === "sonstige") w.push(`${title}: Sonstige Betriebskosten sind nur umlagefähig, wenn der Mietvertrag sie ausdrücklich benennt.`);
    if (item.labor35a > item.amount) w.push(`${title}: Die Arbeitskosten nach § 35a übersteigen die Gesamtkosten der Position.`);
  }
  if (!billing.issuedAt && today > billingDeadline(billing.year)) {
    w.push(`Die Abrechnungsfrist ist am 31.12.${billing.year + 1} abgelaufen. Nachforderungen sind ausgeschlossen, Guthaben bleiben auszuzahlen.`);
  }
  return w;
}
