import type { Lease, Portfolio } from "../types";
import { monthIndex } from "./dates";
import { currentColdRent } from "./metrics";

export type RentStatus = "bezahlt" | "teilweise" | "offen" | "ueberfaellig";

export interface RentRow {
  lease: Lease;
  unitName: string;
  propertyId: string;
  propertyName: string;
  due: number;
  paid: number;
  status: RentStatus;
}

/** Soll-Miete (kalt + Vorauszahlung) eines Vertrags im Monat "YYYY-MM"; 0 außerhalb der Laufzeit. */
export function rentDue(lease: Lease, month: string): number {
  const idx = monthIndex(month);
  if (idx < monthIndex(lease.start)) return 0;
  if (lease.end && idx > monthIndex(lease.end)) return 0;
  return currentColdRent(lease, `${month}-01`) + lease.prepayment;
}

/** Mietenspiegel eines Monats: Soll, Ist und Status je Vertrag. Fällig ist die Miete am 3. Werktag. */
export function rentRoll(pf: Portfolio, month: string, today: string): RentRow[] {
  const rows: RentRow[] = [];
  for (const lease of pf.leases) {
    const due = rentDue(lease, month);
    if (due <= 0) continue;
    const unit = pf.units.find((u) => u.id === lease.unitId);
    const prop = pf.properties.find((p) => p.id === unit?.propertyId);
    if (!unit || !prop) continue;
    const paid = pf.payments
      .filter((p) => p.leaseId === lease.id && p.month === month)
      .reduce((s, p) => s + p.amount, 0);
    const late = today > `${month}-05`;
    const status: RentStatus =
      paid >= due - 0.005 ? "bezahlt" : paid > 0 ? "teilweise" : late ? "ueberfaellig" : "offen";
    rows.push({ lease, unitName: unit.name, propertyId: prop.id, propertyName: prop.name, due, paid, status });
  }
  return rows.sort((a, b) => a.propertyName.localeCompare(b.propertyName) || a.unitName.localeCompare(b.unitName));
}
