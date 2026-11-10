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
