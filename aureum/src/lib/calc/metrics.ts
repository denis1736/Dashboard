import type { ISODate, Lease, Loan, Portfolio, Property, Unit, UnitStatus } from "../types";
import { afaForYear, closingCostsTotal, totalInvestment } from "./afa";
import { daysBetween, yearOf } from "./dates";
import { loanStatus } from "./loans";
import { estimateValue, mergedIndex } from "./valuation";

export const isLeaseActive = (l: Lease, asOf: ISODate): boolean => l.start <= asOf && (!l.end || l.end >= asOf);

/** Aktuelle Nettokaltmiete eines Vertrags; bei Staffelmiete die letzte erreichte Stufe. */
export function currentColdRent(l: Lease, asOf: ISODate): number {
  let rent = l.coldRent;
  if (l.rentType === "staffel") {
    const reached = l.steps.filter((s) => s.date <= asOf).sort((a, b) => a.date.localeCompare(b.date));
    if (reached.length) rent = reached[reached.length - 1].coldRent;
  }
  return rent;
}

export interface UnitState {
  unit: Unit;
  lease?: Lease;
  status: UnitStatus;
  rent: number;
  vacantDays: number;
}

/** Der Status folgt dem Vertrag: Eine Einheit mit laufendem Mietvertrag ist vermietet. */
export function unitState(unit: Unit, leases: Lease[], asOf: ISODate): UnitState {
  const lease = leases.find((l) => l.unitId === unit.id && isLeaseActive(l, asOf));
  if (lease) return { unit, lease, status: "vermietet", rent: currentColdRent(lease, asOf), vacantDays: 0 };
  const status: UnitStatus = unit.status === "vermietet" ? "leer" : unit.status;
  const vacantDays =
    status !== "eigennutzung" && unit.vacantSince ? Math.max(0, daysBetween(unit.vacantSince, asOf)) : 0;
  return { unit, status, rent: 0, vacantDays };
}

export interface Metrics {
  units: number;
  unitsVacant: number;
  area: number;
  /** Ist-Kaltmiete p. a. (laufende Verträge). */
  rentActual: number;
  /** Soll-Kaltmiete p. a.: laufende Verträge plus Marktmiete der nicht vermieteten Einheiten. */
  rentTarget: number;
  /** Kaltmiete p. a., wenn alle Einheiten zur Marktmiete vermietet wären. */
  rentMarket: number;
  /** Wirtschaftliche Leerstandsquote: entgangene Miete im Verhältnis zur Sollmiete. */
  vacancyPct: number;
  /** Leerstandskosten p. a.: entgangene Miete plus nicht umlegbare Betriebskosten. */
  vacancyCost: number;
  vacancyDays: number;
  /** Nicht umlagefähige Bewirtschaftungskosten p. a. inkl. Betriebskosten leerer Flächen. */
  opex: number;
  maintenance: number;
  /** Reinertrag (Net Operating Income). */
  noi: number;
  interest: number;
  principal: number;
  debtService: number;
  monthlyPayment: number;
  afa: number;
  taxableResult: number;
  tax: number;
  cfBeforePrincipal: number;
  cfPreTax: number;
  cfAfterTax: number;
  cfAfterTaxBeforePrincipal: number;
  purchasePrice: number;
  closingCosts: number;
  investment: number;
  loanPrincipal: number;
  equityInvested: number;
  value: number;
  valueGain: number;
  debt: number;
  equity: number;
  ltvPct: number;
  grossYieldPct: number;
  netYieldPct: number;
  factor: number;
  cashOnCashPct: number | null;
  dscr: number | null;
  rentPerSqm: number;
  opexPerSqm: number;
  maintenancePerSqm: number;
  avgInterestPct: number;
  /** Vermögenszuwachs p. a.: Cashflow nach Steuern plus Tilgung. */
  wealthGain: number;
}

const pct = (a: number, b: number): number => (b > 0 ? (a / b) * 100 : 0);

interface Raw {
  units: number; unitsVacant: number; area: number; leasedArea: number;
  rentActual: number; rentTarget: number; rentMarket: number;
  vacancyCost: number; vacancyDays: number; opex: number; maintenance: number;
  interest: number; principal: number; monthlyPayment: number; afa: number;
  purchasePrice: number; closingCosts: number; investment: number; loanPrincipal: number;
  value: number; valueBase: number; debt: number; weightedRate: number;
}

function rawFor(p: Property, pf: Portfolio, asOf: ISODate): Raw {
  const units = pf.units.filter((u) => u.propertyId === p.id);
  const states = units.map((u) => unitState(u, pf.leases, asOf));
  const area = units.reduce((s, u) => s + u.area, 0);
  const countable = states.filter((s) => s.status !== "eigennutzung");
  const vacant = countable.filter((s) => s.status !== "vermietet");
  const vacantArea = vacant.reduce((s, v) => s + v.unit.area, 0);

  const rentActual = states.reduce((s, v) => s + v.rent, 0) * 12;
  const lostRent = vacant.reduce((s, v) => s + v.unit.marketRent, 0) * 12;
  const rentMarket = countable.reduce((s, v) => s + Math.max(v.unit.marketRent, 0), 0) * 12;
  const vacancyOpex = area > 0 ? (p.costs.umlagefaehig * vacantArea) / area : 0;

  const loans = pf.loans.filter((l) => l.propertyId === p.id);
  let interest = 0, principal = 0, debt = 0, monthlyPayment = 0, loanPrincipal = 0, weightedRate = 0;
  for (const l of loans) {
    const st = loanStatus(l, asOf);
    interest += st.next12.interest;
    principal += st.next12.principal;
    debt += st.balance;
    monthlyPayment += st.payment;
    loanPrincipal += l.principal;
    weightedRate += st.balance * st.ratePct;
  }

  return {
    units: units.length,
    unitsVacant: vacant.length,
    area,
    leasedArea: states.filter((s) => s.status === "vermietet").reduce((s, v) => s + v.unit.area, 0),
    rentActual,
    rentTarget: rentActual + lostRent,
    rentMarket,
    vacancyCost: lostRent + vacancyOpex,
    vacancyDays: vacant.reduce((s, v) => s + v.vacantDays, 0),
    opex: p.costs.verwaltung + p.costs.instandhaltung + p.costs.sonstige + vacancyOpex,
    maintenance: p.costs.instandhaltung,
    interest,
    principal,
    monthlyPayment,
    afa: afaForYear(p, pf.expenses, yearOf(asOf)),
    purchasePrice: p.purchasePrice,
    closingCosts: closingCostsTotal(p),
    investment: totalInvestment(p),
    loanPrincipal,
    value: estimateValue(p, mergedIndex(pf.settings.indexOverrides), asOf),
    valueBase: p.purchasePrice + p.initialCapex,
    debt,
    weightedRate,
  };
}

function finish(r: Raw, taxRatePct: number): Metrics {
  const noi = r.rentActual - r.opex;
  const debtService = r.interest + r.principal;
  const taxableResult = noi - r.interest - r.afa;
  const tax = (taxableResult * taxRatePct) / 100;
  const cfBeforePrincipal = noi - r.interest;
  const cfPreTax = cfBeforePrincipal - r.principal;
  const equityInvested = r.investment - r.loanPrincipal;
  return {
    units: r.units,
    unitsVacant: r.unitsVacant,
    area: r.area,
    rentActual: r.rentActual,
    rentTarget: r.rentTarget,
    rentMarket: r.rentMarket,
    vacancyPct: pct(r.rentTarget - r.rentActual, r.rentTarget),
    vacancyCost: r.vacancyCost,
    vacancyDays: r.vacancyDays,
    opex: r.opex,
    maintenance: r.maintenance,
    noi,
    interest: r.interest,
    principal: r.principal,
    debtService,
    monthlyPayment: r.monthlyPayment,
    afa: r.afa,
    taxableResult,
    tax,
    cfBeforePrincipal,
    cfPreTax,
    cfAfterTax: cfPreTax - tax,
    cfAfterTaxBeforePrincipal: cfBeforePrincipal - tax,
    purchasePrice: r.purchasePrice,
    closingCosts: r.closingCosts,
    investment: r.investment,
    loanPrincipal: r.loanPrincipal,
    equityInvested,
    value: r.value,
    valueGain: r.value - r.valueBase,
    debt: r.debt,
    equity: r.value - r.debt,
    ltvPct: pct(r.debt, r.value),
    grossYieldPct: pct(r.rentActual, r.purchasePrice),
    netYieldPct: pct(noi, r.investment),
    factor: r.rentActual > 0 ? r.purchasePrice / r.rentActual : 0,
    cashOnCashPct: equityInvested > 0 ? (cfPreTax / equityInvested) * 100 : null,
    dscr: debtService > 0 ? noi / debtService : null,
    rentPerSqm: r.leasedArea > 0 ? r.rentActual / 12 / r.leasedArea : 0,
    opexPerSqm: r.area > 0 ? r.opex / r.area : 0,
    maintenancePerSqm: r.area > 0 ? r.maintenance / r.area : 0,
    avgInterestPct: r.debt > 0 ? r.weightedRate / r.debt : 0,
    wealthGain: cfPreTax - tax + r.principal,
  };
}

/** Kennzahlen eines Objekts als aktuelle Jahres-Laufrate zum Stichtag. */
export function propertyMetrics(p: Property, pf: Portfolio, asOf: ISODate): Metrics {
  return finish(rawFor(p, pf, asOf), pf.settings.taxRatePct);
}

/** Portfolio: Summen der Objekte, Quoten neu aus den Summen berechnet (kein Mittel der Quoten). */
export function portfolioMetrics(pf: Portfolio, asOf: ISODate, propertyIds?: string[]): Metrics {
  const props = propertyIds ? pf.properties.filter((p) => propertyIds.includes(p.id)) : pf.properties;
  const sum: Raw = {
    units: 0, unitsVacant: 0, area: 0, leasedArea: 0, rentActual: 0, rentTarget: 0, rentMarket: 0,
    vacancyCost: 0, vacancyDays: 0, opex: 0, maintenance: 0, interest: 0, principal: 0, monthlyPayment: 0,
    afa: 0, purchasePrice: 0, closingCosts: 0, investment: 0, loanPrincipal: 0, value: 0, valueBase: 0,
    debt: 0, weightedRate: 0,
  };
  for (const p of props) {
    const r = rawFor(p, pf, asOf);
    (Object.keys(sum) as (keyof Raw)[]).forEach((k) => (sum[k] += r[k]));
  }
  return finish(sum, pf.settings.taxRatePct);
}

export interface WealthPoint {
  year: number;
  value: number;
  debt: number;
  equity: number;
}

/** Vermögensentwicklung jeweils zum Jahresende seit dem ersten Kauf, letzter Punkt = Stichtag. */
export function wealthHistory(pf: Portfolio, asOf: ISODate, propertyIds?: string[]): WealthPoint[] {
  const props = propertyIds ? pf.properties.filter((p) => propertyIds.includes(p.id)) : pf.properties;
  if (props.length === 0) return [];
  const table = mergedIndex(pf.settings.indexOverrides);
  const first = Math.min(...props.map((p) => yearOf(p.purchaseDate)));
  const nowYear = yearOf(asOf);
  const points: WealthPoint[] = [];
  for (let y = first; y <= nowYear; y++) {
    const date = y === nowYear ? asOf : `${y}-12-31`;
    let value = 0, debt = 0;
    for (const p of props) {
      if (p.purchaseDate > date) continue;
      value += estimateValue(p, table, date);
      for (const l of pf.loans) if (l.propertyId === p.id && l.startDate <= date) debt += loanStatus(l, date).balance;
    }
    points.push({ year: y, value, debt, equity: value - debt });
  }
  return points;
}
