import type { Portfolio, Property } from "../types";
import { afaBasis, afaForYear } from "./afa";
import { buildSchedule } from "./loans";
import { rentDue } from "./rents";

export interface TaxYear {
  propertyId: string;
  year: number;
  /** Vereinnahmte Kaltmieten (Sollstellung laut Verträgen). */
  rent: number;
  /** Vereinnahmte Umlagen (Betriebskostenvorauszahlungen). */
  prepayments: number;
  income: number;
  afa: number;
  afaBasis: number;
  interest: number;
  /** Sofort abziehbarer Erhaltungsaufwand. */
  maintenance: number;
  /** Laufende Verwaltungs- und sonstige Kosten. */
  management: number;
  /** Vom Eigentümer gezahlte umlagefähige Betriebskosten. */
  operating: number;
  other: number;
  deductions: number;
  result: number;
  taxEffect: number;
}

const monthsOwned = (p: Property, year: number): number => {
  const y = Number(p.purchaseDate.slice(0, 4));
  if (year < y) return 0;
  if (year > y) return 12;
  return 12 - (Number(p.purchaseDate.slice(5, 7)) - 1);
};

/**
 * Einkünfte aus Vermietung und Verpachtung je Objekt und Kalenderjahr, gegliedert
 * wie die Anlage V. Grundlage sind die Sollmieten der Verträge, die laufenden
 * Kosten (zeitanteilig im Kaufjahr) und die erfassten Einzelausgaben. Dient der
 * Vorbereitung und ersetzt nicht die Prüfung durch den Steuerberater.
 */
export function taxYear(p: Property, pf: Portfolio, year: number): TaxYear {
  const share = monthsOwned(p, year) / 12;
  const unitIds = pf.units.filter((u) => u.propertyId === p.id).map((u) => u.id);
  let rent = 0, prepayments = 0;
  for (const l of pf.leases) {
    if (!unitIds.includes(l.unitId)) continue;
    for (let m = 1; m <= 12; m++) {
      const month = `${year}-${String(m).padStart(2, "0")}`;
      if (month < p.purchaseDate.slice(0, 7)) continue;
      const due = rentDue(l, month);
      if (due > 0) {
        rent += due - l.prepayment;
        prepayments += l.prepayment;
      }
    }
  }

  let interest = 0;
  for (const loan of pf.loans) {
    if (loan.propertyId !== p.id) continue;
    for (const r of buildSchedule(loan)) if (Math.floor(r.idx / 12) === year) interest += r.interest;
  }

  const ex = pf.expenses.filter((e) => e.propertyId === p.id && e.date.startsWith(String(year)) && e.deductible);
  const sum = (cats: string[]) => ex.filter((e) => cats.includes(e.category)).reduce((s, e) => s + e.amount, 0);

  const afa = afaForYear(p, pf.expenses, year);
  const maintenance = sum(["reparatur", "modernisierung"]);
  const management = p.costs.verwaltung * share + sum(["verwaltung"]);
  const operating = p.costs.umlagefaehig * share + sum(["betriebskosten", "grundsteuer", "versicherung"]);
  const other = p.costs.sonstige * share + sum(["sonstiges", "finanzierung"]);
  const income = rent + prepayments;
  const deductions = afa + interest + maintenance + management + operating + other;
  const result = income - deductions;

  return {
    propertyId: p.id, year, rent, prepayments, income, afa, afaBasis: afaBasis(p), interest,
    maintenance, management, operating, other, deductions, result,
    taxEffect: (result * pf.settings.taxRatePct) / 100,
  };
}
