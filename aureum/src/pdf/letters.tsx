import { Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import type { Portfolio, Sender } from "@/lib/types";
import { ALLOCATION_LABEL } from "@/lib/types";
import { statements, UNIT_OF_KEY, type Statement } from "@/lib/calc/billing";
import { arrears, rentIncrease } from "@/lib/calc/letters";
import { addMonths } from "@/lib/calc/dates";
import type { DunningLetter, IncreaseLetter } from "@/lib/report";
import { dateDE, eur2, monthDE, num, pct } from "@/lib/format";
import { C, Doc, Mark, Table, type DocMeta } from "./kit";

/**
 * Geschäftsbriefe in Anlehnung an DIN 5008: Absenderzeile über dem Anschriftfeld
 * (passt ins Fensterkuvert), Datum rechts, Betreff, Text, Fußzeile mit Kontakt
 * und Bankverbindung.
 */

const s = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 74, paddingHorizontal: 62, fontFamily: "Inter", fontSize: 9.6, color: C.ink, lineHeight: 1.5 },
  p: { marginBottom: 8 },
  subject: { fontFamily: "Display", fontWeight: 600, fontSize: 12.5, letterSpacing: -0.2, marginBottom: 14, lineHeight: 1.25 },
  footer: { position: "absolute", bottom: 26, left: 62, right: 62, borderTopWidth: 0.6, borderTopColor: C.line, paddingTop: 7, flexDirection: "row", justifyContent: "space-between", fontSize: 7.2, color: C.muted, lineHeight: 1.4 },
});

const P = ({ children }: { children: ReactNode }) => <Text style={s.p}>{children}</Text>;
const B = ({ children }: { children: ReactNode }) => <Text style={{ fontWeight: 600 }}>{children}</Text>;

function Letter({ sender, to, date, subject, children }: { sender: Sender; to: string[]; date: string; subject: string; children: ReactNode }) {
  const line = [sender.name, sender.street, sender.zipCity].filter(Boolean).join(" · ");
  return (
    <Page size="A4" style={s.page}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", height: 62 }}>
        <View>
          <Text style={{ fontFamily: "Display", fontWeight: 600, fontSize: 13, letterSpacing: -0.3 }}>{sender.name || "Absender in den Einstellungen ergänzen"}</Text>
          <Text style={{ fontSize: 8.4, color: C.muted }}>{[sender.street, sender.zipCity].filter(Boolean).join(", ")}</Text>
        </View>
        <Mark size={18} />
      </View>
      <View style={{ height: 96 }}>
        <Text style={{ fontSize: 6.6, color: C.muted, borderBottomWidth: 0.5, borderBottomColor: C.line, paddingBottom: 2, marginBottom: 6, alignSelf: "flex-start" }}>{line || "Absender"}</Text>
        {to.map((t, i) => <Text key={i} style={{ fontSize: 10.2, lineHeight: 1.4 }}>{t}</Text>)}
      </View>
      <Text style={{ textAlign: "right", marginBottom: 20, color: C.text }}>{sender.zipCity ? `${sender.zipCity.replace(/^\d{5}\s*/, "")}, ` : ""}{date}</Text>
      <Text style={s.subject}>{subject}</Text>
      {children}
      <View style={s.footer} fixed>
        <Text>{[sender.name, sender.street, sender.zipCity].filter(Boolean).join(" · ")}{"\n"}{[sender.phone, sender.email].filter(Boolean).join(" · ")}</Text>
        <Text style={{ textAlign: "right" }}>{sender.bank}{sender.bank && sender.iban ? "\n" : ""}{sender.iban ? `IBAN ${sender.iban}` : ""}</Text>
      </View>
    </Page>
  );
}

const Sign = ({ sender }: { sender: Sender }) => (
  <View wrap={false} style={{ marginTop: 10 }}>
    <Text>Mit freundlichen Grüßen</Text>
    <Text style={{ marginTop: 30 }}>{sender.name}</Text>
  </View>
);

const Box = ({ label, value, tone }: { label: string; value: string; tone?: "bad" | "good" }) => (
  <View wrap={false} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: C.cream, borderLeftWidth: 2.5, borderLeftColor: tone === "good" ? C.good : tone === "bad" ? C.bad : C.gold, paddingVertical: 9, paddingHorizontal: 12, marginVertical: 10 }}>
    <Text style={{ fontWeight: 600, fontSize: 10.4 }}>{label}</Text>
    <Text style={{ fontFamily: "Display", fontWeight: 600, fontSize: 14, letterSpacing: -0.3 }}>{value}</Text>
  </View>
);

const meta = (pf: Portfolio, today: string, title: string, subtitle: string): DocMeta => ({ title, subtitle, owner: pf.settings.sender.name || pf.settings.ownerName, date: dateDE(today) });
const address = (name: string, st: { street: string; zip: string; city: string }) => [name, st.street, `${st.zip} ${st.city}`];
const salutation = (name: string) => `Guten Tag ${name},`;

/* ───────────── Betriebskostenabrechnung ───────────── */

function StatementLetter({ st, sender, today }: { st: Statement; sender: Sender; today: string }) {
  const y = st.billing.year;
  const partial = st.days < st.daysInYear;
  const owes = st.balance > 0.005;
  const credit = st.balance < -0.005;
  return (
    <Letter sender={sender} to={address(st.lease.tenantName, st.property)} date={dateDE(today)} subject={`Betriebskostenabrechnung ${y} · ${st.property.street}, ${st.unit.name}`}>
      <P>{salutation(st.lease.tenantName)}</P>
      <P>
        nachstehend erhalten Sie die Abrechnung der Betriebskosten für den Zeitraum {dateDE(`${y}-01-01`)} bis {dateDE(`${y}-12-31`)}.
        {partial ? ` Ihr Nutzungszeitraum umfasst ${dateDE(st.from)} bis ${dateDE(st.to)}, das sind ${st.days} von ${st.daysInYear} Tagen; alle Kosten sind entsprechend zeitanteilig berechnet.` : ""}
      </P>
      <Table
        cols={[{ label: "Kostenart", w: 34 }, { label: "Gesamtkosten", w: 15, right: true }, { label: "Umlageschlüssel", w: 17 }, { label: "Gesamt", w: 11, right: true }, { label: "Ihr Anteil", w: 11, right: true }, { label: "Ihr Betrag", w: 14, right: true }]}
        rows={st.lines.map((l) => [
          l.title,
          eur2(l.item.amount),
          ALLOCATION_LABEL[l.key],
          l.denom === null ? "–" : `${num(l.denom, l.key === "flaeche" ? 2 : 0)} ${UNIT_OF_KEY[l.key]}`,
          l.key === "direkt" ? eur2(l.num) : `${num(l.num, l.key === "flaeche" ? 2 : 0)} ${UNIT_OF_KEY[l.key]}`,
          { text: eur2(l.amount), bold: true },
        ])}
        foot={["Summe", eur2(st.billing.items.reduce((a, i) => a + i.amount, 0)), "", "", "", eur2(st.costs)]}
      />
      <View wrap={false} style={{ marginTop: 6 }}>
        {[["Auf Sie entfallende Betriebskosten", eur2(st.costs)], ["abzüglich Ihrer Vorauszahlungen", eur2(-st.prepaid)]].map(([k, v]) => (
          <View key={k} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 2.5 }}><Text>{k}</Text><Text>{v}</Text></View>
        ))}
      </View>
      <Box label={owes ? "Nachzahlung zu Ihren Lasten" : credit ? "Guthaben zu Ihren Gunsten" : "Ausgeglichen"} value={eur2(Math.abs(st.balance))} tone={owes ? "bad" : credit ? "good" : undefined} />
      {owes && <P>Bitte überweisen Sie den Betrag von <B>{eur2(st.balance)}</B> bis zum <B>{dateDE(addMonths(today, 1))}</B>{sender.iban ? <> auf das Konto IBAN {sender.iban}</> : null} unter Angabe des Verwendungszwecks „Betriebskosten {y}, {st.unit.name}“.</P>}
      {credit && <P>Das Guthaben von <B>{eur2(-st.balance)}</B> überweise ich in den nächsten Tagen auf das mir bekannte Konto. Sollte sich Ihre Bankverbindung geändert haben, geben Sie mir bitte kurz Bescheid.</P>}
      {st.billing.adjustPrepayment && Math.abs(st.suggestedPrepayment - st.lease.prepayment) >= 1 && (
        <P>
          <B>Anpassung der Vorauszahlung:</B> Auf Grundlage dieser Abrechnung passe ich die monatliche Betriebskostenvorauszahlung gemäß § 560 Abs. 4 BGB von {eur2(st.lease.prepayment)} auf <B>{eur2(st.suggestedPrepayment)}</B> an. Der neue Betrag gilt ab der nächsten Mietzahlung, die nach Zugang dieses Schreibens fällig wird.
        </P>
      )}
      {st.labor35a > 0 && <P><B>Steuerhinweis:</B> In Ihrem Anteil sind {eur2(st.labor35a)} für haushaltsnahe Dienstleistungen und Handwerkerleistungen enthalten, die Sie nach § 35a EStG in Ihrer Einkommensteuererklärung geltend machen können.</P>}
      <P>
        Erläuterung der Umlageschlüssel: „Wohnfläche“ verteilt nach dem Verhältnis Ihrer Wohnfläche zur Gesamtwohnfläche des Hauses, „Wohneinheiten“ zu gleichen Teilen je Wohnung, „Personen“ nach der Zahl der Bewohner, „Verbrauch“ nach den erfassten Verbrauchseinheiten; bei „Direkte Zuordnung“ ist der für Ihre Wohnung ermittelte Betrag angesetzt.
      </P>
      <P>Die der Abrechnung zugrunde liegenden Belege können Sie nach Terminabsprache bei mir einsehen. Einwendungen gegen die Abrechnung teilen Sie mir bitte innerhalb von zwölf Monaten nach Zugang mit (§ 556 Abs. 3 BGB).</P>
      <Sign sender={sender} />
    </Letter>
  );
}

export function BillingDoc({ pf, today, billingId, leaseId }: { pf: Portfolio; today: string; billingId: string; leaseId?: string }) {
  const billing = pf.billings.find((b) => b.id === billingId);
  if (!billing) throw new Error("Abrechnung nicht gefunden.");
  const all = statements(billing, pf).filter((st) => !leaseId || st.lease.id === leaseId);
  if (all.length === 0) throw new Error("Für dieses Jahr gibt es keinen Mietvertrag mit Abrechnungszeitraum.");
  return (
    <Doc meta={meta(pf, today, `Betriebskostenabrechnung ${billing.year}`, all[0].property.name)}>
      {all.map((st) => <StatementLetter key={st.lease.id} st={st} sender={pf.settings.sender} today={today} />)}
    </Doc>
  );
}

/* ───────────── Mieterhöhung ───────────── */

export function IncreaseDoc({ pf, today, data }: { pf: Portfolio; today: string; data: IncreaseLetter }) {
  const lease = pf.leases.find((l) => l.id === data.leaseId);
  const unit = pf.units.find((u) => u.id === lease?.unitId);
  const property = pf.properties.find((p) => p.id === unit?.propertyId);
  if (!lease || !unit || !property) throw new Error("Mietvertrag nicht gefunden.");
  const r = rentIncrease({ lease, unit, letterDate: data.letterDate, marketPerSqm: data.marketPerSqm, rentThreeYearsAgo: data.rentThreeYearsAgo, capPct: data.capPct, requestedRent: data.requestedRent });
  const sender = pf.settings.sender;
  const basis = {
    mietspiegel: "Zur Begründung beziehe ich mich auf den Mietspiegel",
    vergleichswohnungen: "Zur Begründung benenne ich die folgenden Vergleichswohnungen",
    gutachten: "Zur Begründung beziehe ich mich auf das beigefügte Gutachten",
  }[data.basis];
  return (
    <Doc meta={meta(pf, today, "Mieterhöhungsverlangen", property.name)}>
      <Letter sender={sender} to={address(lease.tenantName, property)} date={dateDE(data.letterDate)} subject={`Zustimmung zur Mieterhöhung nach § 558 BGB · ${property.street}, ${unit.name}`}>
        <P>{salutation(lease.tenantName)}</P>
        <P>
          die Nettokaltmiete für Ihre Wohnung beträgt seit dem {dateDE(lease.lastIncrease ?? lease.start)} unverändert {eur2(r.currentRent)} monatlich, das sind {eur2(unit.area > 0 ? r.currentRent / unit.area : 0)} je m² bei {num(unit.area, 2)} m² Wohnfläche. Sie liegt damit unter der ortsüblichen Vergleichsmiete.
        </P>
        <P>Ich bitte Sie deshalb, einer Erhöhung der Nettokaltmiete gemäß § 558 BGB zuzustimmen:</P>
        <Table
          cols={[{ label: "", w: 46 }, { label: "Bisher", w: 18, right: true }, { label: "Neu", w: 18, right: true }, { label: "Veränderung", w: 18, right: true }]}
          rows={[
            ["Nettokaltmiete monatlich", eur2(r.currentRent), { text: eur2(r.newRent), bold: true }, `+${eur2(r.increase)} (${pct(r.increasePct)})`],
            ["je m² Wohnfläche", eur2(unit.area > 0 ? r.currentRent / unit.area : 0), eur2(unit.area > 0 ? r.newRent / unit.area : 0), ""],
            ["Betriebskostenvorauszahlung", eur2(lease.prepayment), eur2(lease.prepayment), "unverändert"],
            [{ text: "Gesamtmiete monatlich", bold: true }, eur2(r.currentRent + lease.prepayment), { text: eur2(r.newRent + lease.prepayment), bold: true }, ""],
          ]}
        />
        <Box label={`Neue Nettokaltmiete ab ${dateDE(r.effectiveDate)}`} value={eur2(r.newRent)} />
        <P>
          <B>Begründung:</B> {basis}{data.basisText ? `: ${data.basisText}` : "."} Danach beträgt die ortsübliche Vergleichsmiete für vergleichbaren Wohnraum {eur2(data.marketPerSqm)} je m², für Ihre Wohnung also {eur2(r.maxByMarket)} monatlich. Die verlangte Miete überschreitet diesen Wert nicht.
        </P>
        <P>
          <B>Kappungsgrenze:</B> Die Miete darf sich innerhalb von drei Jahren um höchstens {data.capPct} % erhöhen (§ 558 Abs. 3 BGB). Vor drei Jahren betrug die Nettokaltmiete {eur2(data.rentThreeYearsAgo)}; die Obergrenze liegt damit bei {eur2(r.maxByCap)} und ist eingehalten. Die Miete ist seit mehr als einem Jahr unverändert.
        </P>
        <P>
          Bitte erteilen Sie Ihre Zustimmung bis zum <B>{dateDE(r.consentUntil)}</B>, am einfachsten durch Rücksendung der unterschriebenen Erklärung unten. Die neue Miete ist dann ab dem <B>{dateDE(r.effectiveDate)}</B> zu zahlen (§ 558b BGB).
        </P>
        <P>Hinweis: Ihnen steht nach § 561 BGB ein Sonderkündigungsrecht zu. Sie können das Mietverhältnis bis zum Ablauf des zweiten Monats nach Zugang dieses Schreibens außerordentlich zum Ablauf des übernächsten Monats kündigen; die Mieterhöhung tritt dann nicht ein.</P>
        <Sign sender={sender} />
        <View wrap={false} style={{ marginTop: 22, borderTopWidth: 0.8, borderTopColor: C.ink, borderStyle: "dashed", paddingTop: 12 }}>
          <Text style={{ fontFamily: "Display", fontWeight: 600, fontSize: 11, marginBottom: 6 }}>Zustimmungserklärung</Text>
          <Text>
            Ich stimme der Erhöhung der Nettokaltmiete für die Wohnung {property.street}, {unit.name}, {property.zip} {property.city} von {eur2(r.currentRent)} auf {eur2(r.newRent)} monatlich mit Wirkung zum {dateDE(r.effectiveDate)} zu.
          </Text>
          <View style={{ flexDirection: "row", gap: 30, marginTop: 34 }}>
            <Text style={{ flex: 1, borderTopWidth: 0.6, borderTopColor: C.muted, paddingTop: 4, fontSize: 7.6, color: C.muted }}>Ort, Datum</Text>
            <Text style={{ flex: 1.4, borderTopWidth: 0.6, borderTopColor: C.muted, paddingTop: 4, fontSize: 7.6, color: C.muted }}>Unterschrift aller Mieter</Text>
          </View>
        </View>
      </Letter>
    </Doc>
  );
}

/* ───────────── Zahlungserinnerung und Mahnung ───────────── */

export function DunningDoc({ pf, today, data }: { pf: Portfolio; today: string; data: DunningLetter }) {
  const a = arrears(pf, today).find((x) => x.lease.id === data.leaseId);
  if (!a) throw new Error("Für diesen Mietvertrag besteht kein Rückstand.");
  const sender = pf.settings.sender;
  const due = dateDE(new Date(Date.parse(`${data.letterDate}T00:00:00Z`) + data.days * 86_400_000).toISOString().slice(0, 10));
  const subject = { 1: "Zahlungserinnerung", 2: "Mahnung", 3: "Letzte Mahnung" }[data.level];
  return (
    <Doc meta={meta(pf, today, subject, a.property.name)}>
      <Letter sender={sender} to={address(a.lease.tenantName, a.property)} date={dateDE(data.letterDate)} subject={`${subject} · Miete ${a.property.street}, ${a.unit.name}`}>
        <P>{salutation(a.lease.tenantName)}</P>
        {data.level === 1 && <P>bei der Durchsicht meiner Unterlagen ist mir aufgefallen, dass die folgenden Mietzahlungen noch nicht oder nicht vollständig eingegangen sind. Sicher handelt es sich um ein Versehen.</P>}
        {data.level === 2 && <P>trotz Fälligkeit sind die folgenden Mietzahlungen bis heute nicht vollständig eingegangen. Sie befinden sich damit in Verzug (§ 286 Abs. 2 Nr. 1 BGB).</P>}
        {data.level === 3 && <P>auf meine bisherigen Schreiben haben Sie nicht reagiert. Die folgenden Mietzahlungen stehen weiterhin aus.</P>}
        <Table
          cols={[{ label: "Monat", w: 34 }, { label: "Fällige Miete", w: 22, right: true }, { label: "Eingegangen", w: 22, right: true }, { label: "Offen", w: 22, right: true }]}
          rows={a.months.map((m) => [monthDE(m.month), eur2(m.due), eur2(m.paid), { text: eur2(m.open), bold: true }])}
          foot={["Summe", "", "", eur2(a.total)]}
        />
        <Box label="Offener Betrag" value={eur2(a.total)} tone="bad" />
        <P>Bitte überweisen Sie den offenen Betrag bis spätestens <B>{due}</B>{sender.iban ? <> auf das Konto IBAN {sender.iban}</> : null}. Sollten Sie die Zahlung inzwischen veranlasst haben, betrachten Sie dieses Schreiben als gegenstandslos.</P>
        {data.level >= 2 && <P>Die Geltendmachung von Verzugszinsen in gesetzlicher Höhe (§ 288 Abs. 1 BGB) und weiterer Verzugsschäden behalte ich mir vor.</P>}
        {data.level === 3 && (
          <P>
            {a.monthsOfRent >= 2
              ? "Der Rückstand erreicht inzwischen zwei Monatsmieten. Ich weise ausdrücklich darauf hin, dass ich in diesem Fall zur außerordentlichen fristlosen Kündigung des Mietverhältnisses berechtigt bin (§ 543 Abs. 2 Nr. 3 BGB). "
              : "Ich weise darauf hin, dass anhaltender Zahlungsverzug zur Kündigung des Mietverhältnisses berechtigen kann (§§ 543, 573 BGB). "}
            Nach fruchtlosem Ablauf der Frist werde ich die Forderung ohne weitere Ankündigung gerichtlich geltend machen.
          </P>
        )}
        {data.level === 1 && <P>Falls es einen Grund für die Verzögerung gibt, sprechen Sie mich gern an. Wir finden eine Lösung.</P>}
        <Sign sender={sender} />
      </Letter>
    </Doc>
  );
}
