import type { ISODate, Lease, Portfolio, Property, Unit } from "../types";
import { addMonths, monthIndex, monthKey, round2 } from "./dates";
import { currentColdRent, isLeaseActive } from "./metrics";
import { rentDue } from "./rents";

/* ───────────── Mieterhöhung bis zur ortsüblichen Vergleichsmiete (§ 558 BGB) ───────────── */

export interface RentIncreaseInput {
  lease: Lease;
  unit: Unit;
  /** Datum des Schreibens; der Zugang wird im selben Monat unterstellt. */
  letterDate: ISODate;
  /** Ortsübliche Vergleichsmiete in Euro je m². */
  marketPerSqm: number;
  /** Nettokaltmiete drei Jahre vor dem Wirksamwerden. */
  rentThreeYearsAgo: number;
  /** Kappungsgrenze: 20 %, in Gebieten mit angespanntem Wohnungsmarkt 15 %. */
  capPct: 15 | 20;
  /** Gewünschte neue Miete; leer = so viel wie zulässig. */
  requestedRent?: number;
}

export interface RentIncreaseResult {
  currentRent: number;
  maxByMarket: number;
  maxByCap: number;
  newRent: number;
  increase: number;
  increasePct: number;
  limitedBy: "vergleichsmiete" | "kappungsgrenze" | "wunsch";
  /** Früheste Zulässigkeit des Verlangens (Jahressperrfrist). */
  earliestRequest: ISODate;
  /** Ende der Überlegungsfrist des Mieters. */
  consentUntil: ISODate;
  /** Beginn der neuen Miete. */
  effectiveDate: ISODate;
  warnings: string[];
}

const firstOfMonth = (idx: number): ISODate => `${monthKey(idx)}-01`;
const lastOfMonth = (idx: number): ISODate => {
  const key = monthKey(idx);
  const d = new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0).getDate();
  return `${key}-${String(d).padStart(2, "0")}`;
};
const floor2 = (n: number): number => Math.floor(n * 100 + 1e-6) / 100;

export function rentIncrease(i: RentIncreaseInput): RentIncreaseResult {
  const currentRent = currentColdRent(i.lease, i.letterDate);
  const base = i.lease.lastIncrease ?? i.lease.start;
  const warnings: string[] = [];

  const maxByMarket = floor2(i.marketPerSqm * i.unit.area);
  const maxByCap = floor2(i.rentThreeYearsAgo * (1 + i.capPct / 100));
  const ceiling = Math.min(maxByMarket, maxByCap);
  let newRent = ceiling;
  let limitedBy: RentIncreaseResult["limitedBy"] = maxByMarket <= maxByCap ? "vergleichsmiete" : "kappungsgrenze";
  if (i.requestedRent && i.requestedRent > 0 && i.requestedRent < ceiling) {
    newRent = floor2(i.requestedRent);
    limitedBy = "wunsch";
  }

  // § 558 Abs. 1: Verlangen frühestens ein Jahr nach der letzten Erhöhung, Miete beim Eintritt 15 Monate unverändert.
  const earliestRequest = addMonths(base, 12);
  const m = monthIndex(i.letterDate);
  // § 558b: Zustimmung bis zum Ablauf des zweiten Kalendermonats nach Zugang, neue Miete ab dem dritten.
  const consentUntil = lastOfMonth(m + 2);
  let effectiveDate = firstOfMonth(m + 3);
  const unchangedUntil = addMonths(base, 15);
  if (effectiveDate < unchangedUntil) effectiveDate = firstOfMonth(monthIndex(unchangedUntil) + (unchangedUntil.endsWith("-01") ? 0 : 1));

  if (i.lease.rentType !== "standard") warnings.push("Bei Staffel- und Indexmiete ist eine Erhöhung nach § 558 BGB ausgeschlossen.");
  if (i.letterDate < earliestRequest) warnings.push(`Das Verlangen ist zu früh: Die Jahressperrfrist läuft bis ${earliestRequest.split("-").reverse().join(".")}. Ein verfrühtes Schreiben ist unwirksam.`);
  if (newRent <= currentRent) warnings.push("Die zulässige Miete liegt nicht über der aktuellen Miete. Eine Erhöhung ist derzeit nicht möglich.");
  if (i.unit.area <= 0) warnings.push("Für die Wohnung ist keine Wohnfläche erfasst.");
  if (Number(i.letterDate.slice(8, 10)) > 24) warnings.push("Das Schreiben ist spät im Monat datiert. Geht es erst im Folgemonat zu, verschieben sich Zustimmungsfrist und Wirksamkeit um einen Monat.");

  return {
    currentRent, maxByMarket, maxByCap, newRent,
    increase: round2(newRent - currentRent),
    increasePct: currentRent > 0 ? ((newRent - currentRent) / currentRent) * 100 : 0,
    limitedBy, earliestRequest, consentUntil, effectiveDate, warnings,
  };
}

/* ───────────── Zahlungsrückstände ───────────── */

export interface Arrears {
  lease: Lease;
  unit: Unit;
  property: Property;
  months: { month: string; due: number; paid: number; open: number }[];
  total: number;
  /** Rückstand in Monatsmieten (warm), Maßstab für § 543 Abs. 2 Nr. 3 BGB. */
  monthsOfRent: number;
}

/**
 * Offene Mieten je Mietvertrag. Betrachtet werden nur Monate ab dem ersten
 * erfassten Zahlungseingang: Davor wurde nicht gebucht, also wäre alles „offen“.
 * Der laufende Monat zählt erst nach Fälligkeit (ab dem 6.).
 */
export function arrears(pf: Portfolio, today: ISODate): Arrears[] {
  if (pf.payments.length === 0) return [];
  const first = pf.payments.reduce((a, p) => (p.month < a ? p.month : a), pf.payments[0].month);
  const now = monthIndex(today);
  const last = today > `${today.slice(0, 7)}-05` ? now : now - 1;
  const out: Arrears[] = [];

  for (const lease of pf.leases) {
    const unit = pf.units.find((u) => u.id === lease.unitId);
    const property = pf.properties.find((p) => p.id === unit?.propertyId);
    if (!unit || !property) continue;
    const months: Arrears["months"] = [];
    for (let idx = monthIndex(first); idx <= last; idx++) {
      const month = monthKey(idx);
      const due = rentDue(lease, month);
      if (due <= 0) continue;
      const paid = pf.payments.filter((p) => p.leaseId === lease.id && p.month === month).reduce((s, p) => s + p.amount, 0);
      if (due - paid > 0.005) months.push({ month, due, paid, open: round2(due - paid) });
    }
    if (months.length === 0) continue;
    const total = round2(months.reduce((s, x) => s + x.open, 0));
    const monthly = isLeaseActive(lease, today) ? rentDue(lease, today.slice(0, 7)) : months[months.length - 1].due;
    out.push({ lease, unit, property, months, total, monthsOfRent: monthly > 0 ? total / monthly : 0 });
  }
  return out.sort((a, b) => b.total - a.total);
}
