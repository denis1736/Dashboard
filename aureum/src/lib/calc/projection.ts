import type { ISODate, Portfolio } from "../types";
import { afaSchedule } from "./afa";
import { monthIndex, yearOf } from "./dates";
import { buildSchedule } from "./loans";
import { propertyMetrics } from "./metrics";
import { estimateValue, mergedIndex } from "./valuation";

export interface Assumptions {
  years: number;
  rentGrowthPct: number;
  costGrowthPct: number;
  valueGrowthPct: number;
  /** Einmalige Mietanpassung zu Beginn (z. B. Mieterhöhung auf Vergleichsmiete). */
  rentUpliftPct: number;
  /** Kalkulatorischer Mietausfall auf die Sollmiete; ersetzt den aktuellen Leerstand. */
  vacancyPct: number;
  /** Anschlusszins nach Ende der Zinsbindung; null = Annahme aus dem Darlehen. */
  followUpPct: number | null;
  /** Einmalige Sanierung: Betrag und Jahr (1 = erstes Projektionsjahr). */
  capex: number;
  capexYear: number;
  /** Sanierung als Erhaltungsaufwand sofort abziehen (sonst keine Steuerwirkung im Modell). */
  capexDeductible: boolean;
}

export const BASE_ASSUMPTIONS: Assumptions = {
  years: 15,
  rentGrowthPct: 1.5,
  costGrowthPct: 2,
  valueGrowthPct: 1.5,
  rentUpliftPct: 0,
  vacancyPct: 2,
  followUpPct: null,
  capex: 0,
  capexYear: 1,
  capexDeductible: true,
};

export interface ProjectionRow {
  year: number;
  rent: number;
  opex: number;
  noi: number;
  interest: number;
  principal: number;
  capex: number;
  afa: number;
  tax: number;
  cfPreTax: number;
  cfAfterTax: number;
  cumCf: number;
  debt: number;
  value: number;
  equity: number;
}

/**
 * Jahresprojektion ab dem Monat nach dem Stichtag. Jahr 1 sind die kommenden
 * zwölf Monate; Mieten und Kosten wachsen jeweils zum Jahreswechsel.
 */
export function project(pf: Portfolio, asOf: ISODate, a: Assumptions, propertyIds?: string[]): ProjectionRow[] {
  const props = propertyIds ? pf.properties.filter((p) => propertyIds.includes(p.id)) : pf.properties;
  const table = mergedIndex(pf.settings.indexOverrides);
  const now = monthIndex(asOf);
  const baseYear = yearOf(asOf);

  let rentBase = 0, opexBase = 0, value0 = 0;
  for (const p of props) {
    const m = propertyMetrics(p, pf, asOf);
    rentBase += m.rentTarget;
    opexBase += p.costs.verwaltung + p.costs.instandhaltung + p.costs.sonstige;
    value0 += estimateValue(p, table, asOf);
  }
  rentBase *= 1 + a.rentUpliftPct / 100;

  const schedules = pf.loans
    .filter((l) => props.some((p) => p.id === l.propertyId))
    .map((l) => ({
      loan: l,
      rows: buildSchedule(l, a.followUpPct === null ? {} : { followUpPct: a.followUpPct }),
    }));
  const afaRows = props.map((p) => afaSchedule(p, pf.expenses, baseYear + a.years));

  const rows: ProjectionRow[] = [];
  let cum = 0;
  for (let y = 1; y <= a.years; y++) {
    const from = now + (y - 1) * 12;
    const to = from + 12;
    const rent = rentBase * Math.pow(1 + a.rentGrowthPct / 100, y - 1) * (1 - a.vacancyPct / 100);
    const opex = opexBase * Math.pow(1 + a.costGrowthPct / 100, y - 1);
    const noi = rent - opex;

    let interest = 0, principal = 0, debt = 0;
    for (const s of schedules) {
      let bal = s.loan.startDate <= asOf ? s.loan.principal : 0;
      for (const r of s.rows) {
        if (r.idx > to) break;
        bal = r.balance;
        if (r.idx > from) {
          interest += r.interest;
          principal += r.principal + r.special;
        }
      }
      debt += bal;
    }

    const afa = afaRows.reduce((s, r) => s + (r.find((x) => x.year === baseYear + y - 1)?.amount ?? 0), 0);
    const capex = y === a.capexYear ? a.capex : 0;
    const taxable = noi - interest - afa - (a.capexDeductible ? capex : 0);
    const tax = (taxable * pf.settings.taxRatePct) / 100;
    const cfPreTax = noi - interest - principal - capex;
    const cfAfterTax = cfPreTax - tax;
    cum += cfAfterTax;
    const value = value0 * Math.pow(1 + a.valueGrowthPct / 100, y);

    rows.push({
      year: baseYear + y,
      rent, opex, noi, interest, principal, capex, afa, tax, cfPreTax, cfAfterTax,
      cumCf: cum, debt, value, equity: value - debt,
    });
  }
  return rows;
}
