import type { Lease, Payment, Portfolio, Unit } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { monthIndex, monthKey } from "./calc/dates";
import { rentDue } from "./calc/rents";

/**
 * Beispielportfolio: fünf Objekte, 17 Einheiten. Bewusst mit den Fällen, die im
 * Alltag zählen: auslaufende Zinsbindung, Miete unter Markt, Leerstand,
 * Sanierung, Neubau mit degressiver AfA und negativem Cashflow.
 */
export function demoPortfolio(today: string): Portfolio {
  const units: Unit[] = [];
  const leases: Lease[] = [];
  const u = (
    propertyId: string, name: string, area: number, rooms: number, marketRent: number,
    lease?: Partial<Lease> & { tenantName: string; start: string; coldRent: number },
    extra: Partial<Unit> = {},
  ) => {
    const id = `${propertyId}-u${units.filter((x) => x.propertyId === propertyId).length + 1}`;
    units.push({ id, propertyId, name, area, rooms, marketRent, status: lease ? "vermietet" : "leer", ...extra });
    if (lease) {
      leases.push({
        id: `${id}-l1`, unitId: id, prepayment: Math.round(area * 2.9), deposit: lease.coldRent * 3,
        rentType: "standard", steps: [], ...lease,
      });
    }
  };

  // Leipzig – Gründerzeit, Zinsbindung läuft aus
  u("lpz", "EG links", 62, 2, 650, { tenantName: "M. Schubert", start: "2015-04-01", coldRent: 480, lastIncrease: "2022-05-01" });
  u("lpz", "EG rechts", 71, 3, 745, { tenantName: "Fam. Kowalski", start: "2019-09-01", coldRent: 610, lastIncrease: "2023-10-01" });
  u("lpz", "1. OG links", 64, 2, 675, { tenantName: "J. Winkler", start: "2021-02-01", coldRent: 620 });
  u("lpz", "1. OG rechts", 88, 3, 925, { tenantName: "Dr. A. Petrov", start: "2023-06-01", coldRent: 890, rentType: "index", lastIncrease: "2025-07-01" });
  u("lpz", "2. OG", 96, 4, 1010, { tenantName: "Fam. Brandt", start: "2018-03-01", coldRent: 760, lastIncrease: "2023-04-01" });
  u("lpz", "Dachgeschoss", 54, 2, 620, {
    tenantName: "L. Hoffmann", start: "2024-10-01", coldRent: 560, rentType: "staffel",
    steps: [{ date: "2025-10-01", coldRent: 578 }, { date: "2026-10-01", coldRent: 596 }, { date: "2027-10-01", coldRent: 614 }],
  });

  // Berlin – ETW, Miete deutlich unter Markt
  u("ber", "Wohnung 12", 68, 2, 1150, { tenantName: "S. Yilmaz", start: "2013-08-01", coldRent: 782, lastIncrease: "2023-01-01" });

  // München – Neubau, degressive AfA
  u("muc", "Wohnung 3.04", 62, 2, 1420, { tenantName: "T. Lindner", start: "2025-06-01", coldRent: 1390, rentType: "index" });

  // Dortmund – MFH mit Leerstand und Sanierung
  u("dor", "EG links", 58, 2, 520, { tenantName: "H. Nowak", start: "2012-07-01", coldRent: 430, lastIncrease: "2024-02-01" });
  u("dor", "EG rechts", 58, 2, 520, undefined, { status: "vermarktung", vacantSince: "2026-08-01" });
  u("dor", "1. OG links", 74, 3, 660, { tenantName: "Fam. Demir", start: "2020-01-01", coldRent: 585, lastIncrease: "2024-02-01" });
  u("dor", "1. OG rechts", 74, 3, 660, { tenantName: "P. Krüger", start: "2022-11-01", coldRent: 640 });
  u("dor", "2. OG links", 74, 3, 660, undefined, { status: "sanierung", vacantSince: "2026-10-01" });
  u("dor", "2. OG rechts", 74, 3, 660, { tenantName: "E. Sommer", start: "2017-05-01", coldRent: 540, lastIncrease: "2023-06-01" });
  u("dor", "Dachgeschoss links", 49, 1.5, 450, { tenantName: "N. Vogel", start: "2025-03-01", coldRent: 445, end: "2027-02-28" });
  u("dor", "Dachgeschoss rechts", 49, 1.5, 450, { tenantName: "R. Ahmeti", start: "2023-09-01", coldRent: 425 });

  // Hamburg – Reihenhaus
  u("ham", "Reihenhaus", 118, 5, 1790, { tenantName: "Fam. Petersen", start: "2021-08-01", coldRent: 1650, lastIncrease: "2024-09-01" });

  const pf: Portfolio = {
    version: 1,
    properties: [
      {
        id: "lpz", name: "Gründerzeithaus Südvorstadt", street: "Kochstraße 48", zip: "04275", city: "Leipzig",
        type: "MFH", yearBuilt: 1908, purchaseDate: "2017-03-01", notaryDate: "2016-12-14", purchasePrice: 780_000,
        closingCosts: { grunderwerbsteuer: 27_300, notar: 11_700, makler: 27_846, sonstige: 1_200 },
        initialCapex: 62_000, landSharePct: 26, afa: { method: "linear", ratePct: 2.5 },
        valuation: { mode: "index" },
        costs: { verwaltung: 2_160, instandhaltung: 5_200, sonstige: 600, umlagefaehig: 13_900 },
      },
      {
        id: "ber", name: "Altbauwohnung Prenzlauer Berg", street: "Stargarder Straße 21", zip: "10437", city: "Berlin",
        type: "ETW", yearBuilt: 1998, purchaseDate: "2014-07-01", notaryDate: "2014-05-20", purchasePrice: 215_000,
        closingCosts: { grunderwerbsteuer: 12_900, notar: 3_440, makler: 15_351, sonstige: 0 },
        initialCapex: 6_500, landSharePct: 38, afa: { method: "linear", ratePct: 2 },
        valuation: { mode: "index" },
        costs: { verwaltung: 420, instandhaltung: 950, sonstige: 180, umlagefaehig: 2_050 },
      },
      {
        id: "muc", name: "Neubauwohnung Freiham", street: "Aubinger Allee 112", zip: "81248", city: "München",
        type: "ETW", yearBuilt: 2025, purchaseDate: "2025-05-01", notaryDate: "2024-02-09", purchasePrice: 498_000,
        closingCosts: { grunderwerbsteuer: 17_430, notar: 8_960, makler: 0, sonstige: 900 },
        initialCapex: 9_800, landSharePct: 42, afa: { method: "degressiv", ratePct: 5 },
        valuation: { mode: "index" },
        costs: { verwaltung: 384, instandhaltung: 620, sonstige: 150, umlagefaehig: 1_980 },
      },
      {
        id: "dor", name: "Mehrfamilienhaus Kreuzviertel", street: "Arneckestraße 9", zip: "44139", city: "Dortmund",
        type: "MFH", yearBuilt: 1958, purchaseDate: "2019-10-01", notaryDate: "2019-08-06", purchasePrice: 1_050_000,
        closingCosts: { grunderwerbsteuer: 68_250, notar: 15_750, makler: 37_485, sonstige: 2_400 },
        initialCapex: 85_000, landSharePct: 22, afa: { method: "linear", ratePct: 2 },
        valuation: { mode: "index" },
        costs: { verwaltung: 2_880, instandhaltung: 7_650, sonstige: 900, umlagefaehig: 17_800 },
      },
      {
        id: "ham", name: "Reihenhaus Rahlstedt", street: "Wiesenredder 34", zip: "22149", city: "Hamburg",
        type: "EFH", yearBuilt: 1976, purchaseDate: "2021-06-01", notaryDate: "2021-04-12", purchasePrice: 465_000,
        closingCosts: { grunderwerbsteuer: 20_925, notar: 7_440, makler: 14_531, sonstige: 0 },
        initialCapex: 18_000, landSharePct: 45, afa: { method: "linear", ratePct: 2 },
        valuation: { mode: "manuell", manualValue: 512_000, manualDate: "2025-09-15" },
        costs: { verwaltung: 0, instandhaltung: 1_900, sonstige: 320, umlagefaehig: 2_640 },
      },
    ],
    units,
    leases,
    loans: [
      {
        id: "lpz-d1", propertyId: "lpz", lender: "Sparkasse Leipzig", label: "Hauptdarlehen", type: "annuitaet",
        principal: 640_000, startDate: "2017-03-15", interestPct: 1.65, repaymentPct: 2.5, fixedUntil: "2027-03-31",
        followUpPct: 3.7, specialRepayments: [{ date: "2021-12-15", amount: 20_000 }], rateChanges: [],
      },
      {
        id: "lpz-d2", propertyId: "lpz", lender: "KfW", label: "Programm 151 Sanierung", type: "annuitaet",
        principal: 60_000, startDate: "2017-06-01", interestPct: 0.75, repaymentPct: 4.2, fixedUntil: "2027-06-30",
        followUpPct: 3.7, specialRepayments: [], rateChanges: [],
      },
      {
        id: "ber-d1", propertyId: "ber", lender: "ING", label: "Baufinanzierung", type: "annuitaet",
        principal: 172_000, startDate: "2014-07-01", interestPct: 2.45, repaymentPct: 3, fixedUntil: "2029-06-30",
        followUpPct: 3.7, specialRepayments: [{ date: "2019-11-30", amount: 8_000 }], rateChanges: [],
      },
      {
        id: "muc-d1", propertyId: "muc", lender: "Münchner Bank", label: "Annuitätendarlehen", type: "annuitaet",
        principal: 340_000, startDate: "2025-05-01", interestPct: 3.58, repaymentPct: 1.5, fixedUntil: "2040-04-30",
        specialRepayments: [], rateChanges: [],
      },
      {
        id: "muc-d2", propertyId: "muc", lender: "KfW", label: "Programm 297 Klimafreundlicher Neubau", type: "endfaellig",
        principal: 100_000, startDate: "2025-05-01", interestPct: 2.31, repaymentPct: 0, fixedUntil: "2035-04-30",
        followUpPct: 3.7, specialRepayments: [], rateChanges: [],
      },
      {
        id: "dor-d1", propertyId: "dor", lender: "Deutsche Bank", label: "Hauptdarlehen", type: "annuitaet",
        principal: 860_000, startDate: "2019-10-01", interestPct: 1.32, repaymentPct: 2.2, fixedUntil: "2034-09-30",
        followUpPct: 3.7, specialRepayments: [], rateChanges: [],
      },
      {
        id: "ham-d1", propertyId: "ham", lender: "Hamburger Sparkasse", label: "Baufinanzierung", type: "annuitaet",
        principal: 372_000, startDate: "2021-06-01", interestPct: 1.08, repaymentPct: 2.5, fixedUntil: "2031-05-31",
        followUpPct: 3.7, specialRepayments: [], rateChanges: [],
      },
    ],
    expenses: [
      { id: "e1", propertyId: "lpz", date: "2026-04-22", category: "reparatur", amount: 8_420, deductible: true, note: "Dachrinnen und Fallrohre erneuert" },
      { id: "e2", propertyId: "lpz", date: "2026-09-03", category: "reparatur", amount: 1_860, deductible: true, note: "Therme 1. OG rechts getauscht" },
      { id: "e3", propertyId: "dor", date: "2026-10-14", category: "modernisierung", amount: 21_500, deductible: false, note: "Kernsanierung Bad und Elektrik 2. OG links" },
      { id: "e4", propertyId: "dor", date: "2025-11-20", category: "reparatur", amount: 4_300, deductible: true, note: "Heizungsverteiler, hydraulischer Abgleich" },
      { id: "e5", propertyId: "ber", date: "2026-02-10", category: "sonstiges", amount: 640, deductible: true, note: "Sonderumlage WEG Fassade (Anteil)" },
      { id: "e6", propertyId: "ham", date: "2026-06-18", category: "reparatur", amount: 2_950, deductible: true, note: "Terrassentür und Rollladen" },
    ],
    payments: [],
    reminders: [
      { id: "r1", propertyId: "lpz", title: "Heizungswartung", date: "2026-11-24", kind: "wartung", repeatMonths: 12, done: false, note: "Fa. Thermo-Service" },
      { id: "r2", propertyId: "dor", title: "Legionellenprüfung Trinkwasser", date: "2027-01-18", kind: "wartung", repeatMonths: 36, done: false },
      { id: "r3", propertyId: "dor", title: "Wohngebäudeversicherung: Hauptfälligkeit", date: "2027-01-01", kind: "versicherung", repeatMonths: 12, done: false, note: "Kündigung bis 30.09." },
      { id: "r4", propertyId: "ber", title: "Eigentümerversammlung", date: "2026-12-03", kind: "sonstiges", repeatMonths: 0, done: false, note: "Beschluss Fassadensanierung" },
      { id: "r5", propertyId: "lpz", title: "Rauchwarnmelder prüfen", date: "2027-03-10", kind: "wartung", repeatMonths: 12, done: false },
      { id: "r6", propertyId: "ham", title: "Schornsteinfeger: Feuerstättenschau", date: "2027-05-12", kind: "wartung", repeatMonths: 42, done: false },
      { id: "r7", title: "Steuererklärung: Anlage V zusammenstellen", date: "2027-02-15", kind: "sonstiges", repeatMonths: 12, done: false },
    ],
    settings: { ...DEFAULT_SETTINGS, ownerName: "Beispielportfolio", onboarded: true },
  };

  // Zahlungseingänge der letzten sechs Monate; im laufenden Monat bleiben einige offen.
  const now = monthIndex(today);
  const payments: Payment[] = [];
  for (let i = 5; i >= 0; i--) {
    const month = monthKey(now - i);
    leases.forEach((l, n) => {
      const due = rentDue(l, month);
      if (due <= 0) return;
      const current = i === 0;
      if (current && (n % 5 === 3 || today < `${month}-03`)) return;
      const partial = (current && n === 9) || (i === 1 && n === 4);
      payments.push({
        id: `p-${l.id}-${month}`, leaseId: l.id, month,
        amount: partial ? Math.round(due * 0.6) : due, paidAt: `${month}-0${1 + (n % 4)}`,
      });
    });
  }
  pf.payments = payments;
  return pf;
}
