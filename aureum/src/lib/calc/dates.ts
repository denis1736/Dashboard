import type { ISODate } from "../types";

/** Monatszähler seit Jahr 0; macht Monatsarithmetik zu Ganzzahlrechnung. */
export const monthIndex = (iso: string): number => {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  return y * 12 + (m - 1);
};

export const monthKey = (idx: number): string => {
  const y = Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
};

export const yearOf = (iso: string): number => Number(iso.slice(0, 4));

export const todayISO = (): ISODate => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const daysInMonth = (y: number, m: number): number => new Date(y, m, 0).getDate();

/** Addiert Monate und klemmt den Tag auf das Monatsende (31.01. + 1 Monat = 28./29.02.). */
export const addMonths = (iso: ISODate, months: number): ISODate => {
  const idx = monthIndex(iso) + months;
  const y = Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  const d = Math.min(Number(iso.slice(8, 10)) || 1, daysInMonth(y, m));
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};

export const addYears = (iso: ISODate, years: number): ISODate => addMonths(iso, years * 12);

export const daysBetween = (a: ISODate, b: ISODate): number => {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
};

/** Jahr als Dezimalzahl (2024-07-01 ≈ 2024,5) für Interpolationen. */
export const yearFraction = (iso: ISODate): number => {
  const y = yearOf(iso);
  const start = Date.parse(`${y}-01-01T00:00:00Z`);
  const end = Date.parse(`${y + 1}-01-01T00:00:00Z`);
  return y + (Date.parse(`${iso}T00:00:00Z`) - start) / (end - start);
};

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
