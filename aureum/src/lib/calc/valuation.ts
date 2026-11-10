import type { ISODate, Property } from "../types";
import { yearFraction } from "./dates";

/**
 * Häuserpreisindex Deutschland, Jahresdurchschnitte, 2015 = 100.
 *
 * WICHTIG: Die Werte sind Näherungen an die Destatis-Reihe (Tabelle 61262-0001)
 * und wurden nicht automatisiert gegen die amtliche Quelle geprüft. Sie lassen
 * sich in den Einstellungen Jahr für Jahr überschreiben; für belastbare
 * Bewertungen (Bank, Finanzamt) ersetzt der Index kein Gutachten.
 */
export const HPI_DEFAULT: Record<string, number> = {
  "2005": 80.5, "2006": 80.3, "2007": 78.6, "2008": 79.6, "2009": 80.3,
  "2010": 81.0, "2011": 83.8, "2012": 86.7, "2013": 89.4, "2014": 92.2,
  "2015": 100.0, "2016": 107.5, "2017": 114.1, "2018": 121.7, "2019": 128.7,
  "2020": 138.7, "2021": 154.7, "2022": 162.9, "2023": 149.2, "2024": 147.0,
  "2025": 151.4,
};
export const HPI_AS_OF = "2025";

export type IndexTable = Record<string, number>;

export const mergedIndex = (overrides: IndexTable): IndexTable => ({ ...HPI_DEFAULT, ...overrides });

/**
 * Indexstand zu einem Datum. Jahresdurchschnitte gelten als Wert zur Jahresmitte,
 * dazwischen wird linear interpoliert. Außerhalb der Reihe wird der Randwert
 * gehalten: keine Fortschreibung mit einer unterstellten Wachstumsrate.
 */
export function indexAt(table: IndexTable, iso: ISODate): number {
  const years = Object.keys(table).map(Number).sort((a, b) => a - b);
  if (years.length === 0) return 100;
  const x = yearFraction(iso) - 0.5;
  if (x <= years[0]) return table[String(years[0])];
  const last = years[years.length - 1];
  if (x >= last) return table[String(last)];
  const y0 = Math.floor(x);
  const v0 = table[String(y0)];
  const v1 = table[String(y0 + 1)];
  if (v0 === undefined || v1 === undefined) {
    const near = years.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));
    return table[String(near)];
  }
  return v0 + (v1 - v0) * (x - y0);
}

/**
 * Geschätzter Marktwert. Basis ist der Kaufpreis zzgl. Anfangsinvestition zum
 * Kaufdatum oder ein manuell erfasster Wert (z. B. Gutachten) zu dessen Stichtag,
 * fortgeschrieben mit dem Häuserpreisindex.
 */
export function estimateValue(p: Property, table: IndexTable, asOf: ISODate): number {
  let base = p.purchasePrice + p.initialCapex;
  let baseDate = p.purchaseDate;
  if (p.valuation.mode === "manuell" && p.valuation.manualValue) {
    base = p.valuation.manualValue;
    baseDate = p.valuation.manualDate ?? asOf;
  }
  if (asOf <= baseDate) return base;
  const i0 = indexAt(table, baseDate);
  if (i0 <= 0) return base;
  return Math.round((base * indexAt(table, asOf)) / i0);
}
