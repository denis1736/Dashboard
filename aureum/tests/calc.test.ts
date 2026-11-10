import { describe, expect, it } from "vitest";
import type { Loan, Property } from "@/lib/types";
import { buildSchedule, contractualPayment, loanStatus, yearlySchedule } from "@/lib/calc/loans";
import { afaBasis, afaSchedule, statutoryAfaRate, totalInvestment } from "@/lib/calc/afa";
import { estimateValue, indexAt } from "@/lib/calc/valuation";
import { portfolioMetrics, propertyMetrics, wealthHistory } from "@/lib/calc/metrics";
import { BASE_ASSUMPTIONS, project } from "@/lib/calc/projection";
import { deadlines, insights } from "@/lib/calc/deadlines";
import { rentRoll } from "@/lib/calc/rents";
import { taxYear } from "@/lib/calc/tax";
import { addMonths, addYears, daysBetween } from "@/lib/calc/dates";
import { demoPortfolio } from "@/lib/demo";

const loan = (o: Partial<Loan> = {}): Loan => ({
  id: "l", propertyId: "p", lender: "Bank", label: "", type: "annuitaet", principal: 100_000,
  startDate: "2020-01-15", interestPct: 3, repaymentPct: 2, fixedUntil: "2030-01-31",
  specialRepayments: [], rateChanges: [], ...o,
});

describe("Darlehen", () => {
  it("berechnet die Annuität aus Zins und anfänglicher Tilgung", () => {
    // 100.000 € × (3 % + 2 %) / 12 = 416,67 €
    expect(contractualPayment(loan())).toBe(416.67);
  });

  it("teilt die erste Rate korrekt in Zins und Tilgung", () => {
    const [first, second] = buildSchedule(loan());
    expect(first.month).toBe("2020-02");
    expect(first.interest).toBe(250);
    expect(first.principal).toBe(166.67);
    expect(first.balance).toBe(99_833.33);
    // 99.833,33 × 3 % / 12 = 249,58
    expect(second.interest).toBe(249.58);
    expect(second.principal).toBe(167.09);
  });

  it("trifft die geschlossene Formel für die Restschuld nach zehn Jahren", () => {
    const rows = buildSchedule(loan());
    const q = 1 + 0.03 / 12;
    const expected = 100_000 * Math.pow(q, 120) - 416.67 * ((Math.pow(q, 120) - 1) / (q - 1));
    // Abweichung nur durch Cent-Rundung jeder Monatsrate.
    expect(Math.abs(rows[119].balance - expected)).toBeLessThan(1);
  });

  it("tilgt vollständig und zahlt nie mehr als die Restschuld", () => {
    const rows = buildSchedule(loan({ repaymentPct: 10 }));
    const last = rows[rows.length - 1];
    expect(last.balance).toBe(0);
    const repaid = rows.reduce((s, r) => s + r.principal + r.special, 0);
    expect(Math.round(repaid * 100) / 100).toBe(100_000);
  });

  it("berücksichtigt Sondertilgungen", () => {
    const withSpecial = buildSchedule(loan({ specialRepayments: [{ date: "2021-06-10", amount: 10_000 }] }));
    const without = buildSchedule(loan());
    const i = withSpecial.findIndex((r) => r.month === "2021-06");
    expect(withSpecial[i].special).toBe(10_000);
    expect(without[i].balance - withSpecial[i].balance).toBe(10_000);
    expect(withSpecial.length).toBeLessThan(without.length);
  });

  it("lässt endfällige Darlehen ungetilgt", () => {
    const rows = buildSchedule(loan({ type: "endfaellig", repaymentPct: 0 }), { maxMonths: 24 });
    expect(rows.every((r) => r.principal === 0 && r.balance === 100_000 && r.interest === 250)).toBe(true);
  });

  it("wendet den Anschlusszins erst nach der Zinsbindung an und hebt die Rate auf Mindesttilgung", () => {
    const l = loan({ repaymentPct: 1, followUpPct: 8 });
    const rows = buildSchedule(l);
    const before = rows.find((r) => r.month === "2030-01")!;
    const after = rows.find((r) => r.month === "2030-02")!;
    expect(before.ratePct).toBe(3);
    expect(after.ratePct).toBe(8);
    expect(after.principal).toBeGreaterThan(0);
    expect(after.payment).toBeGreaterThan(before.payment);
  });

  it("liefert Stand, Restschuld zum Bindungsende und Jahreswerte konsistent", () => {
    const l = loan();
    const st = loanStatus(l, "2025-01-20");
    const rows = buildSchedule(l);
    expect(st.balance).toBe(rows.find((r) => r.month === "2025-01")!.balance);
    expect(st.balanceAtFixedEnd).toBe(rows.find((r) => r.month === "2030-01")!.balance);
    expect(st.monthsToFixedEnd).toBe(60);
    expect(st.repaid + st.balance).toBeCloseTo(100_000, 2);
    const years = yearlySchedule(rows);
    expect(years[0].year).toBe(2020);
    expect(years.reduce((s, y) => s + y.principal, 0)).toBeCloseTo(100_000, 1);
  });

  it("zeigt vor der ersten Rate die volle Darlehenssumme", () => {
    expect(loanStatus(loan(), "2020-01-20").balance).toBe(100_000);
  });
});

const prop = (o: Partial<Property> = {}): Property => ({
  id: "p", name: "Test", street: "", zip: "", city: "", type: "ETW", yearBuilt: 1990,
  purchaseDate: "2020-07-01", notaryDate: "2020-05-10", purchasePrice: 300_000,
  closingCosts: { grunderwerbsteuer: 15_000, notar: 6_000, makler: 9_000, sonstige: 0 },
  initialCapex: 10_000, landSharePct: 30, afa: { method: "linear", ratePct: 2 },
  valuation: { mode: "index" }, costs: { verwaltung: 300, instandhaltung: 900, sonstige: 0, umlagefaehig: 1_800 },
  ...o,
});

describe("AfA", () => {
  it("bildet die Bemessungsgrundlage aus Gebäudeanteil und Anfangsinvestition", () => {
    // (300.000 + 30.000) × 70 % + 10.000 = 241.000
    expect(afaBasis(prop())).toBe(241_000);
    expect(totalInvestment(prop())).toBe(340_000);
  });

  it("schreibt linear ab, im Erstjahr zeitanteilig", () => {
    const rows = afaSchedule(prop(), [], 2022);
    expect(rows[0]).toMatchObject({ year: 2020, amount: 2_410 }); // 6 von 12 Monaten
    expect(rows[1].amount).toBe(4_820);
    expect(rows[2].residual).toBe(241_000 - 2_410 - 4_820 * 2);
  });

  it("schreibt degressiv vom Restwert ab", () => {
    const rows = afaSchedule(prop({ purchaseDate: "2024-01-01", afa: { method: "degressiv", ratePct: 5 } }), [], 2026);
    expect(rows[0].amount).toBe(12_050);
    expect(rows[1].amount).toBe(11_447.5);
    expect(rows[2].amount).toBeCloseTo(10_875.13, 2);
  });

  it("endet beim Restwert null", () => {
    const rows = afaSchedule(prop({ afa: { method: "individuell", ratePct: 25 } }), [], 2030);
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBeCloseTo(241_000, 2);
    expect(rows[rows.length - 1].amount).toBe(0);
  });

  it("aktiviert Modernisierungen und schreibt sie ab dem Ausgabemonat ab", () => {
    const rows = afaSchedule(prop(), [
      { id: "e", propertyId: "p", date: "2021-07-01", category: "modernisierung", amount: 20_000, deductible: false, note: "" },
    ], 2022);
    expect(rows[1].amount).toBe(4_820 + 200); // 2 % von 20.000 für 6 Monate
    expect(rows[2].amount).toBe(4_820 + 400);
  });

  it("kennt die gesetzlichen Sätze", () => {
    expect(statutoryAfaRate(1910)).toBe(2.5);
    expect(statutoryAfaRate(1990)).toBe(2);
    expect(statutoryAfaRate(2024)).toBe(3);
  });
});

describe("Bewertung", () => {
  const table = { "2020": 100, "2021": 110, "2022": 120 };
  it("interpoliert zwischen Jahresmitten und hält die Randwerte", () => {
    expect(indexAt(table, "2020-07-02")).toBeCloseTo(100, 0);
    expect(indexAt(table, "2021-01-01")).toBeCloseTo(105, 0);
    expect(indexAt(table, "2019-01-01")).toBe(100);
    expect(indexAt(table, "2030-01-01")).toBe(120);
  });
  it("schreibt den Kaufpreis mit dem Index fort", () => {
    const p = prop({ purchaseDate: "2020-07-02", initialCapex: 0 });
    expect(estimateValue(p, table, "2022-07-02")).toBeCloseTo(360_000, -3);
    expect(estimateValue(p, table, "2020-07-02")).toBe(300_000);
  });
  it("nimmt einen manuellen Wert als neue Basis", () => {
    const p = prop({ valuation: { mode: "manuell", manualValue: 400_000, manualDate: "2021-07-02" } });
    expect(estimateValue(p, table, "2021-07-02")).toBe(400_000);
    expect(estimateValue(p, table, "2022-07-02")).toBeCloseTo(436_364, -3);
  });
});

describe("Kennzahlen", () => {
  const asOf = "2026-11-10";
  const pf = demoPortfolio(asOf);

  it("rechnet ein Einzelobjekt von Hand nachvollziehbar", () => {
    const ber = pf.properties.find((p) => p.id === "ber")!;
    const m = propertyMetrics(ber, pf, asOf);
    expect(m.rentActual).toBe(782 * 12);
    expect(m.rentTarget).toBe(m.rentActual);
    expect(m.vacancyPct).toBe(0);
    expect(m.grossYieldPct).toBeCloseTo((9_384 / 215_000) * 100, 6);
    expect(m.opex).toBe(420 + 950 + 180);
    expect(m.noi).toBe(9_384 - 1_550);
    expect(m.netYieldPct).toBeCloseTo((7_834 / (215_000 + 31_691 + 6_500)) * 100, 6);
    expect(m.cfPreTax).toBeCloseTo(m.noi - m.interest - m.principal, 6);
    expect(m.cfAfterTax).toBeCloseTo(m.cfPreTax - m.tax, 6);
    expect(m.tax).toBeCloseTo(((m.noi - m.interest - m.afa) * 42) / 100, 6);
    expect(m.equity).toBeCloseTo(m.value - m.debt, 6);
    // Annuität: Zins + Tilgung der nächsten zwölf Monate = zwölf Raten.
    expect(m.debtService).toBeCloseTo(m.monthlyPayment * 12, 0);
  });

  it("erfasst Leerstand wirtschaftlich", () => {
    const dor = pf.properties.find((p) => p.id === "dor")!;
    const m = propertyMetrics(dor, pf, asOf);
    expect(m.units).toBe(8);
    expect(m.unitsVacant).toBe(2);
    expect(m.rentTarget - m.rentActual).toBe((520 + 660) * 12);
    // Entgangene Miete plus anteilige Betriebskosten der leeren 132 von 510 m².
    expect(m.vacancyCost).toBeCloseTo(14_160 + (17_800 * 132) / 510, 6);
    expect(m.vacancyPct).toBeGreaterThan(0);
  });

  it("summiert das Portfolio und rechnet Quoten aus Summen", () => {
    const all = portfolioMetrics(pf, asOf);
    const parts = pf.properties.map((p) => propertyMetrics(p, pf, asOf));
    const sum = (k: "rentActual" | "debt" | "value" | "cfPreTax" | "equity" | "tax") => parts.reduce((s, m) => s + m[k], 0);
    expect(all.rentActual).toBeCloseTo(sum("rentActual"), 6);
    expect(all.debt).toBeCloseTo(sum("debt"), 6);
    expect(all.value).toBeCloseTo(sum("value"), 6);
    expect(all.cfPreTax).toBeCloseTo(sum("cfPreTax"), 4);
    expect(all.equity).toBeCloseTo(sum("equity"), 4);
    expect(all.ltvPct).toBeCloseTo((all.debt / all.value) * 100, 6);
    expect(all.units).toBe(17);
  });

  it("liefert eine lückenlose Vermögenshistorie", () => {
    const h = wealthHistory(pf, asOf);
    expect(h[0].year).toBe(2014);
    expect(h[h.length - 1].year).toBe(2026);
    const all = portfolioMetrics(pf, asOf);
    expect(h[h.length - 1].equity).toBeCloseTo(all.equity, 4);
  });

  it("projiziert konsistent und reagiert auf Annahmen", () => {
    const base = project(pf, asOf, BASE_ASSUMPTIONS);
    expect(base).toHaveLength(15);
    for (const r of base) {
      expect(r.cfPreTax).toBeCloseTo(r.noi - r.interest - r.principal - r.capex, 6);
      expect(r.equity).toBeCloseTo(r.value - r.debt, 6);
    }
    expect(base[14].debt).toBeLessThan(base[0].debt);
    const stress = project(pf, asOf, { ...BASE_ASSUMPTIONS, followUpPct: 6 });
    const relaxed = project(pf, asOf, { ...BASE_ASSUMPTIONS, followUpPct: 2 });
    expect(stress[5].interest).toBeGreaterThan(relaxed[5].interest);
    const capex = project(pf, asOf, { ...BASE_ASSUMPTIONS, capex: 50_000, capexYear: 2 });
    expect(capex[1].cfPreTax).toBeCloseTo(base[1].cfPreTax - 50_000, 6);
    expect(capex[1].tax).toBeCloseTo(base[1].tax - 21_000, 6);
  });
});

describe("Fristen, Hinweise, Mieten, Steuer", () => {
  const asOf = "2026-11-10";
  const pf = demoPortfolio(asOf);

  it("leitet Fristen aus den Daten ab und sortiert sie", () => {
    const d = deadlines(pf, asOf, 365);
    expect(d.find((x) => x.id === "zb-lpz-d1")?.date).toBe("2027-03-31");
    expect(d.find((x) => x.id === "sk-lpz-d1")).toBeUndefined(); // Sonderkündigung erst nach der Bindung
    expect(d.some((x) => x.kind === "staffel" && x.date === "2027-10-01")).toBe(true);
    expect(d.some((x) => x.id === "ve-dor-u7-l1" && x.date === "2027-02-28")).toBe(true);
    expect([...d].sort((a, b) => a.date.localeCompare(b.date))).toEqual(d);
    expect(deadlines(pf, asOf, 30).every((x) => x.days <= 30)).toBe(true);
  });

  it("berechnet die Spekulationsfrist ab Kaufvertrag", () => {
    const d = deadlines(pf, asOf, 3650);
    expect(d.find((x) => x.id === "sp-lpz")?.date).toBe("2026-12-14");
    expect(d.find((x) => x.id === "sp-ber")).toBeUndefined(); // bereits abgelaufen
  });

  it("erkennt Mietpotenzial, Leerstand und auslaufende Zinsbindung", () => {
    const i = insights(pf, asOf);
    expect(i.some((x) => x.id === "mp-ber-u1")).toBe(true);
    expect(i.some((x) => x.id === "le-dor-u2" && x.level === "kritisch")).toBe(true);
    expect(i.some((x) => x.id === "zb-lpz-d1" && x.level === "kritisch")).toBe(true);
  });

  it("führt den Mietenspiegel mit Status", () => {
    const roll = rentRoll(pf, "2026-11", asOf);
    expect(roll).toHaveLength(15);
    expect(roll.filter((r) => r.status === "bezahlt").length).toBeGreaterThan(8);
    expect(roll.some((r) => r.status === "ueberfaellig")).toBe(true);
    expect(roll.some((r) => r.status === "teilweise")).toBe(true);
    const staffel = roll.find((r) => r.lease.id === "lpz-u6-l1")!;
    expect(staffel.due).toBe(596 + staffel.lease.prepayment);
  });

  it("gliedert das Steuerjahr wie die Anlage V", () => {
    const ber = pf.properties.find((p) => p.id === "ber")!;
    const t = taxYear(ber, pf, 2026);
    expect(t.rent).toBe(782 * 12);
    expect(t.afa).toBe(afaSchedule(ber, pf.expenses, 2026).at(-1)!.amount);
    expect(t.other).toBe(180 + 640);
    expect(t.result).toBeCloseTo(t.income - t.deductions, 6);
  });
});

describe("Datum", () => {
  it("klemmt Monatsenden und zählt Tage", () => {
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addYears("2016-12-14", 10)).toBe("2026-12-14");
    expect(daysBetween("2026-11-10", "2026-12-14")).toBe(34);
  });
});

import { billingWarnings, statements } from "@/lib/calc/billing";
import { arrears, rentIncrease } from "@/lib/calc/letters";
import type { Billing, Lease, Portfolio, Unit } from "@/lib/types";
import { EMPTY_PORTFOLIO } from "@/lib/types";

describe("Betriebskostenabrechnung", () => {
  const units: Unit[] = [
    { id: "a", propertyId: "p", name: "A", area: 60, rooms: 2, status: "vermietet", marketRent: 600 },
    { id: "b", propertyId: "p", name: "B", area: 40, rooms: 1, status: "vermietet", marketRent: 400 },
  ];
  const lease = (o: Partial<Lease>): Lease => ({ id: "l", unitId: "a", tenantName: "T", start: "2020-01-01", coldRent: 600, prepayment: 100, deposit: 0, rentType: "standard", steps: [], ...o });
  const billing: Billing = {
    id: "bill", propertyId: "p", year: 2025, prepaid: {}, adjustPrepayment: false,
    items: [
      { id: "1", category: "grundsteuer", label: "", amount: 1_000, key: "flaeche", shares: {}, labor35a: 0 },
      { id: "2", category: "muell", label: "", amount: 600, key: "einheiten", shares: {}, labor35a: 0 },
      { id: "3", category: "wasser", label: "", amount: 900, key: "personen", shares: { a: 2, b: 1 }, labor35a: 0 },
      { id: "4", category: "heizung", label: "", amount: 1_500, key: "direkt", shares: { a: 900, b: 600 }, labor35a: 0 },
      { id: "5", category: "hauswart", label: "", amount: 500, key: "flaeche", shares: {}, labor35a: 400 },
    ],
  };
  const pf = (leases: Lease[]): Portfolio => ({ ...EMPTY_PORTFOLIO, properties: [prop()], units, leases });

  it("verteilt nach Fläche, Einheiten, Personen und direkter Zuordnung", () => {
    const [s] = statements(billing, pf([lease({})]));
    expect(s.days).toBe(365);
    // 1.000 × 60/100, 600 / 2, 900 × 2/3, 900 direkt, 500 × 60/100
    expect(s.lines.map((l) => l.amount)).toEqual([600, 300, 600, 900, 300]);
    expect(s.costs).toBe(2_700);
    expect(s.prepaidDue).toBe(1_200);
    expect(s.balance).toBe(1_500);
    expect(s.labor35a).toBe(240); // 400 × 300/500
    expect(s.suggestedPrepayment).toBe(225);
  });

  it("rechnet bei Einzug im Jahr zeitanteilig und lässt Leerstand beim Eigentümer", () => {
    const all = statements(billing, pf([lease({ start: "2025-07-01" })]));
    expect(all).toHaveLength(1);
    const s = all[0];
    expect(s.days).toBe(184);
    expect(s.lines[0].amount).toBeCloseTo((600 * 184) / 365, 2);
    expect(s.prepaidDue).toBe(600);
    // Wohnung B steht leer: Ihr Anteil taucht in keiner Mieterabrechnung auf.
    expect(s.costs).toBeLessThan(2_700);
  });

  it("teilt die Kosten einer Wohnung bei Mieterwechsel ohne Lücke und ohne Doppelung", () => {
    const all = statements(billing, pf([lease({ id: "alt", end: "2025-03-31" }), lease({ id: "neu", start: "2025-04-01" })]));
    expect(all.map((s) => s.days)).toEqual([90, 275]);
    expect(all[0].costs + all[1].costs).toBeCloseTo(2_700, 1);
  });

  it("setzt erfasste Ist-Vorauszahlungen an und ignoriert Verträge außerhalb des Jahres", () => {
    const b = { ...billing, prepaid: { l: 1_000 } };
    expect(statements(b, pf([lease({})]))[0].balance).toBe(1_700);
    expect(statements(billing, pf([lease({ start: "2026-02-01" })]))).toHaveLength(0);
    expect(statements(billing, pf([lease({ end: "2024-12-31" })]))).toHaveLength(0);
  });

  it("warnt vor typischen Fehlern", () => {
    const bad: Billing = { ...billing, items: [
      { id: "1", category: "heizung", label: "", amount: 1_000, key: "flaeche", shares: {}, labor35a: 0 },
      { id: "2", category: "wasser", label: "", amount: 500, key: "direkt", shares: { a: 100 }, labor35a: 0 },
      { id: "3", category: "antenne", label: "", amount: 200, key: "einheiten", shares: {}, labor35a: 0 },
    ] };
    const w = billingWarnings(bad, pf([lease({})]), "2027-01-15");
    expect(w.some((x) => x.includes("Heizkostenverordnung"))).toBe(true);
    expect(w.some((x) => x.includes("weichen von den Gesamtkosten"))).toBe(true);
    expect(w.some((x) => x.includes("Kabel-TV"))).toBe(true);
    expect(w.some((x) => x.includes("Abrechnungsfrist ist am 31.12.2026 abgelaufen"))).toBe(true);
    expect(billingWarnings(billing, pf([lease({})]), "2026-06-01")).toEqual([]);
  });

  it("meldet die Abrechnungsfrist, bis die Abrechnung zugestellt ist", () => {
    const demo = demoPortfolio("2026-11-10");
    const d = deadlines(demo, "2026-11-10", 365);
    expect(d.find((x) => x.id === "nk-lpz-2025")?.date).toBe("2026-12-31");
    demo.billings[0].issuedAt = "2026-11-01";
    expect(deadlines(demo, "2026-11-10", 365).find((x) => x.id === "nk-lpz-2025")).toBeUndefined();
    expect(deadlines(demo, "2026-11-10", 365).find((x) => x.id === "nk-dor-2025")).toBeDefined();
  });
});

describe("Mieterhöhung nach § 558 BGB", () => {
  const unit: Unit = { id: "a", propertyId: "p", name: "A", area: 70, rooms: 3, status: "vermietet", marketRent: 800 };
  const lease: Lease = { id: "l", unitId: "a", tenantName: "T", start: "2018-05-01", coldRent: 600, prepayment: 150, deposit: 0, rentType: "standard", steps: [], lastIncrease: "2023-03-01" };
  const base = { lease, unit, letterDate: "2026-11-10", marketPerSqm: 11, rentThreeYearsAgo: 600, capPct: 20 as const };

  it("begrenzt auf die Kappungsgrenze, wenn sie unter der Vergleichsmiete liegt", () => {
    const r = rentIncrease(base);
    expect(r.maxByMarket).toBe(770);
    expect(r.maxByCap).toBe(720);
    expect(r.newRent).toBe(720);
    expect(r.limitedBy).toBe("kappungsgrenze");
    expect(r.increase).toBe(120);
    expect(r.warnings).toEqual([]);
  });

  it("begrenzt auf die Vergleichsmiete und beachtet 15 % in angespannten Märkten", () => {
    expect(rentIncrease({ ...base, marketPerSqm: 9.5 })).toMatchObject({ newRent: 665, limitedBy: "vergleichsmiete" });
    expect(rentIncrease({ ...base, capPct: 15 }).newRent).toBe(690);
    expect(rentIncrease({ ...base, requestedRent: 650 })).toMatchObject({ newRent: 650, limitedBy: "wunsch" });
  });

  it("berechnet Zustimmungsfrist und Wirksamkeit aus dem Zugangsmonat", () => {
    const r = rentIncrease(base);
    expect(r.consentUntil).toBe("2027-01-31");
    expect(r.effectiveDate).toBe("2027-02-01");
    expect(rentIncrease({ ...base, letterDate: "2026-12-05" })).toMatchObject({ consentUntil: "2027-02-28", effectiveDate: "2027-03-01" });
  });

  it("hält Jahressperrfrist und 15-Monats-Frist ein", () => {
    const recent = { ...base, lease: { ...lease, lastIncrease: "2026-02-01" } };
    const early = rentIncrease(recent);
    expect(early.earliestRequest).toBe("2027-02-01");
    expect(early.warnings.some((w) => w.includes("Jahressperrfrist"))).toBe(true);
    // Schreiben genau nach einem Jahr: wirksam frühestens 15 Monate nach der letzten Erhöhung.
    const ok = rentIncrease({ ...recent, letterDate: "2027-02-02" });
    expect(ok.warnings).toEqual([]);
    expect(ok.effectiveDate).toBe("2027-05-01");
  });

  it("schließt Staffel- und Indexmieten aus", () => {
    expect(rentIncrease({ ...base, lease: { ...lease, rentType: "index" } }).warnings[0]).toMatch(/ausgeschlossen/);
  });
});

describe("Zahlungsrückstände", () => {
  it("summiert offene Monate ab Beginn der Zahlungserfassung", () => {
    const pf = demoPortfolio("2026-11-10");
    const list = arrears(pf, "2026-11-10");
    const total = list.reduce((s, a) => s + a.total, 0);
    const roll = rentRoll(pf, "2026-11", "2026-11-10");
    const openNow = roll.reduce((s, r) => s + Math.max(0, r.due - r.paid), 0);
    expect(total).toBeGreaterThanOrEqual(openNow);
    expect(list[0].total).toBeGreaterThanOrEqual(list[list.length - 1].total);
    for (const a of list) expect(a.months.every((m) => m.month >= "2026-06" && m.open > 0)).toBe(true);
    // Vor Fälligkeit zählt der laufende Monat nicht als Rückstand.
    expect(arrears(pf, "2026-11-03").every((a) => a.months.every((m) => m.month < "2026-11"))).toBe(true);
    expect(arrears({ ...pf, payments: [] }, "2026-11-10")).toEqual([]);
  });
});
