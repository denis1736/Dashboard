import type { ISODate, Loan } from "../types";
import { monthIndex, monthKey, round2 } from "./dates";

export interface ScheduleRow {
  /** "YYYY-MM" */
  month: string;
  idx: number;
  ratePct: number;
  interest: number;
  principal: number;
  special: number;
  payment: number;
  balance: number;
}

export interface ScheduleOptions {
  /** Überschreibt den Anschlusszins nach Ende der Zinsbindung (Szenarien). */
  followUpPct?: number;
  maxMonths?: number;
}

/** Mindesttilgung, auf die eine Rate nach einer Zinsänderung angehoben wird. */
const MIN_REPAYMENT_PCT = 1;

/** Vertragliche Monatsrate: bei Annuität (Zins + anfängliche Tilgung) / 12 auf die Darlehenssumme. */
export function contractualPayment(loan: Loan): number {
  if (loan.type === "endfaellig") return round2((loan.principal * loan.interestPct) / 1200);
  if (loan.monthlyPayment && loan.monthlyPayment > 0) return loan.monthlyPayment;
  return round2((loan.principal * (loan.interestPct + loan.repaymentPct)) / 1200);
}

/**
 * Monatlicher Tilgungsplan ab dem Monat nach der Auszahlung.
 *
 * Konventionen: Zinsen monatlich nachschüssig auf die Restschuld (30/360), Rate
 * konstant. Ändert sich der Zins (variables Darlehen oder Anschlussfinanzierung),
 * bleibt die Rate bestehen, wird aber mindestens auf Zins + 1 % Tilgung angehoben,
 * weil Banken eine Anschlussfinanzierung ohne Tilgung nicht vergeben.
 */
export function buildSchedule(loan: Loan, opts: ScheduleOptions = {}): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  const maxMonths = opts.maxMonths ?? 720;
  const first = monthIndex(loan.startDate) + 1;
  const fixedEnd = monthIndex(loan.fixedUntil);
  const followUp = opts.followUpPct ?? loan.followUpPct;
  const changes = [...loan.rateChanges].sort((a, b) => a.date.localeCompare(b.date));
  const specials = new Map<number, number>();
  for (const s of loan.specialRepayments) {
    const k = monthIndex(s.date);
    specials.set(k, (specials.get(k) ?? 0) + s.amount);
  }

  let balance = loan.principal;
  let payment = contractualPayment(loan);
  let lastRate = loan.interestPct;

  for (let i = 0; i < maxMonths && balance > 0.005; i++) {
    const idx = first + i;
    let rate = loan.interestPct;
    for (const c of changes) if (monthIndex(c.date) <= idx) rate = c.interestPct;
    if (idx > fixedEnd && followUp !== undefined) rate = followUp;

    const interest = round2((balance * rate) / 1200);
    let principal = 0;

    if (loan.type === "endfaellig") {
      payment = interest;
    } else {
      if (rate !== lastRate) {
        const floor = round2((balance * (rate + MIN_REPAYMENT_PCT)) / 1200);
        if (payment < floor) payment = floor;
      }
      principal = Math.min(balance, Math.max(0, round2(payment - interest)));
    }
    lastRate = rate;

    balance = round2(balance - principal);
    const special = Math.min(balance, specials.get(idx) ?? 0);
    balance = round2(balance - special);

    rows.push({
      month: monthKey(idx),
      idx,
      ratePct: rate,
      interest,
      principal,
      special,
      payment: round2(interest + principal),
      balance,
    });
  }
  return rows;
}

export interface LoanStatus {
  balance: number;
  repaid: number;
  repaidPct: number;
  interestPaid: number;
  /** Aktuelle Monatsrate (Zins + Tilgung). */
  payment: number;
  ratePct: number;
  /** Restschuld zum Ende der Zinsbindung. */
  balanceAtFixedEnd: number;
  monthsToFixedEnd: number;
  /** Monat der vollständigen Rückzahlung bei unveränderten Annahmen, sonst null. */
  payoffMonth: string | null;
  /** Zins und Tilgung der kommenden zwölf Monate. */
  next12: { interest: number; principal: number };
}

export function loanStatus(loan: Loan, asOf: ISODate, opts: ScheduleOptions = {}): LoanStatus {
  const schedule = buildSchedule(loan, opts);
  const now = monthIndex(asOf);
  const fixedEnd = monthIndex(loan.fixedUntil);

  let balance = loan.principal;
  let interestPaid = 0;
  let balanceAtFixedEnd = loan.principal;
  let next12Interest = 0;
  let next12Principal = 0;
  let current: ScheduleRow | undefined;

  for (const r of schedule) {
    if (r.idx <= now) {
      balance = r.balance;
      interestPaid += r.interest;
      current = r;
    }
    if (r.idx <= fixedEnd) balanceAtFixedEnd = r.balance;
    if (r.idx > now && r.idx <= now + 12) {
      next12Interest += r.interest;
      next12Principal += r.principal + r.special;
    }
  }

  const upcoming = schedule.find((r) => r.idx > now);
  const last = schedule[schedule.length - 1];
  const paidOff = last && last.balance <= 0.005;

  return {
    balance,
    repaid: round2(loan.principal - balance),
    repaidPct: loan.principal > 0 ? ((loan.principal - balance) / loan.principal) * 100 : 0,
    interestPaid: round2(interestPaid),
    payment: balance <= 0.005 ? 0 : (upcoming?.payment ?? current?.payment ?? contractualPayment(loan)),
    ratePct: upcoming?.ratePct ?? current?.ratePct ?? loan.interestPct,
    balanceAtFixedEnd,
    monthsToFixedEnd: fixedEnd - now,
    payoffMonth: paidOff ? last.month : null,
    next12: { interest: round2(next12Interest), principal: round2(next12Principal) },
  };
}

export interface YearRow {
  year: number;
  interest: number;
  principal: number;
  balance: number;
}

/** Tilgungsplan auf Kalenderjahre verdichtet. */
export function yearlySchedule(schedule: ScheduleRow[]): YearRow[] {
  const out: YearRow[] = [];
  for (const r of schedule) {
    const year = Math.floor(r.idx / 12);
    let row = out[out.length - 1];
    if (!row || row.year !== year) {
      row = { year, interest: 0, principal: 0, balance: r.balance };
      out.push(row);
    }
    row.interest = round2(row.interest + r.interest);
    row.principal = round2(row.principal + r.principal + r.special);
    row.balance = r.balance;
  }
  return out;
}

/** Restschuld am Ende eines Monats; vor der ersten Rate die volle Darlehenssumme, vor Auszahlung 0. */
export function balanceAt(loan: Loan, schedule: ScheduleRow[], idx: number): number {
  if (idx < monthIndex(loan.startDate)) return 0;
  let balance = loan.principal;
  for (const r of schedule) {
    if (r.idx > idx) break;
    balance = r.balance;
  }
  return balance;
}
