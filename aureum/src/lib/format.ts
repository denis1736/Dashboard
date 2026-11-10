const nf0 = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MINUS = "−";
const NBSP = " ";
const fix = (s: string) => s.replace(/^-/, MINUS);

/** 1.234 € — ganze Euro, typografisches Minus. */
export const eur = (n: number): string => fix(`${nf0.format(Math.round(n) || 0)}${NBSP}€`);
/** 1.234,56 € */
export const eur2 = (n: number): string => fix(`${nf2.format(n || 0)}${NBSP}€`);

/** Kompakt für Kacheln und Achsen: 1,24 Mio. € · 386 Tsd. € · 950 € */
export const eurCompact = (n: number): string => {
  const a = Math.abs(n);
  const sign = n < 0 ? MINUS : "";
  if (a >= 1_000_000) {
    const v = a / 1_000_000;
    return `${sign}${v.toLocaleString("de-DE", { minimumFractionDigits: v >= 10 ? 1 : 2, maximumFractionDigits: v >= 10 ? 1 : 2 })}${NBSP}Mio.${NBSP}€`;
  }
  if (a >= 10_000) return `${sign}${nf0.format(Math.round(a / 1000))}${NBSP}Tsd.${NBSP}€`;
  return eur(n);
};

/** Achsenbeschriftung ohne Währungszeichen: 1,2 Mio. · 400 Tsd. · 0 */
export const axisCompact = (n: number): string => {
  const a = Math.abs(n);
  const sign = n < 0 ? MINUS : "";
  if (a >= 1_000_000) return `${sign}${(a / 1_000_000).toLocaleString("de-DE", { maximumFractionDigits: 1 })}${NBSP}Mio.`;
  if (a >= 1_000) return `${sign}${nf0.format(Math.round(a / 1000))}${NBSP}Tsd.`;
  return `${sign}${nf0.format(a)}`;
};

export const pct = (n: number, digits = 1): string =>
  fix(`${(n || 0).toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits })}${NBSP}%`);

export const num = (n: number, digits = 0): string =>
  fix((n || 0).toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits }));

export const signedEur = (n: number): string => (n > 0 ? `+${eur(n)}` : eur(n));

/** 31.03.2027 */
export const dateDE = (iso?: string): string => {
  if (!iso) return "–";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
};

const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const MONTHS_SHORT = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

/** "2027-03" -> März 2027 */
export const monthDE = (key: string): string => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
export const monthShortDE = (key: string): string => `${MONTHS_SHORT[Number(key.slice(5, 7)) - 1]} ${key.slice(2, 4)}`;

/** Relative Frist: heute · in 12 Tagen · in 5 Monaten · in 2,5 Jahren · seit 3 Tagen überfällig */
export const inDays = (days: number): string => {
  if (days === 0) return "heute";
  if (days < 0) return `seit ${-days} ${days === -1 ? "Tag" : "Tagen"} überfällig`;
  if (days === 1) return "morgen";
  if (days < 60) return `in ${days} Tagen`;
  if (days < 730) return `in ${Math.round(days / 30.4)} Monaten`;
  return `in ${(days / 365.25).toLocaleString("de-DE", { maximumFractionDigits: 1 })} Jahren`;
};

export const uid = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
