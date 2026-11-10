import type { Expense, Property } from "../types";
import { monthIndex, round2, yearOf } from "./dates";

export const closingCostsTotal = (p: Property): number =>
  p.closingCosts.grunderwerbsteuer + p.closingCosts.notar + p.closingCosts.makler + p.closingCosts.sonstige;

/** Gesamtinvestition: Kaufpreis, Kaufnebenkosten und Anfangsinvestition. */
export const totalInvestment = (p: Property): number => p.purchasePrice + closingCostsTotal(p) + p.initialCapex;

/**
 * AfA-Bemessungsgrundlage: Kaufpreis und Nebenkosten werden im Verhältnis des
 * Gebäudeanteils aufgeteilt; anschaffungsnahe Herstellungskosten entfallen
 * vollständig auf das Gebäude.
 */
export const afaBasis = (p: Property): number =>
  round2((p.purchasePrice + closingCostsTotal(p)) * (1 - p.landSharePct / 100) + p.initialCapex);

/** Gesetzlicher linearer Satz nach § 7 Abs. 4 EStG (Wohngebäude) anhand des Baujahrs. */
export const statutoryAfaRate = (yearBuilt: number): number => {
  if (yearBuilt >= 2023) return 3;
  if (yearBuilt < 1925) return 2.5;
  return 2;
};

export interface AfaRow {
  year: number;
  amount: number;
  residual: number;
}

/** Monate, in denen das Objekt im ersten Jahr gehalten wurde (inkl. Anschaffungsmonat). */
const monthsHeldInYear = (startISO: string, year: number): number => {
  const startYear = yearOf(startISO);
  if (year < startYear) return 0;
  if (year > startYear) return 12;
  return 12 - (monthIndex(startISO) % 12);
};

/**
 * Abschreibungsplan des Gebäudes.
 * - linear / individuell: fester Prozentsatz der Bemessungsgrundlage, im Erstjahr zeitanteilig.
 * - degressiv (§ 7 Abs. 5a EStG): Prozentsatz vom jeweiligen Restwert, im Erstjahr zeitanteilig.
 * Aktivierte Modernisierungen (Ausgaben ohne Sofortabzug) werden linear mit dem
 * gesetzlichen Satz ab dem Monat der Ausgabe abgeschrieben.
 */
export function afaSchedule(p: Property, expenses: Expense[], untilYear: number): AfaRow[] {
  const basis = afaBasis(p);
  const startYear = yearOf(p.purchaseDate);
  const rows: AfaRow[] = [];
  let residual = basis;

  const capitalized = expenses.filter((e) => e.propertyId === p.id && !e.deductible && e.category === "modernisierung");
  const capRate = statutoryAfaRate(p.yearBuilt);
  const capResidual = capitalized.map((e) => e.amount);

  for (let year = startYear; year <= untilYear; year++) {
    const months = monthsHeldInYear(p.purchaseDate, year);
    let amount =
      p.afa.method === "degressiv"
        ? (residual * p.afa.ratePct) / 100
        : (basis * p.afa.ratePct) / 100;
    amount = Math.min(residual, (amount * months) / 12);
    residual = round2(residual - amount);

    let capAmount = 0;
    capitalized.forEach((e, i) => {
      const m = monthsHeldInYear(e.date, year);
      if (m === 0) return;
      const a = Math.min(capResidual[i], (e.amount * capRate * m) / 1200);
      capResidual[i] = round2(capResidual[i] - a);
      capAmount += a;
    });

    rows.push({
      year,
      amount: round2(amount + capAmount),
      residual: round2(residual + capResidual.reduce((s, v) => s + v, 0)),
    });
  }
  return rows;
}

export function afaForYear(p: Property, expenses: Expense[], year: number): number {
  if (year < yearOf(p.purchaseDate)) return 0;
  const rows = afaSchedule(p, expenses, year);
  return rows[rows.length - 1]?.amount ?? 0;
}
