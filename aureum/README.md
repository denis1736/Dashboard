# Aureum

Vermögensverwaltung für private und semiprofessionelle Vermieter: Objekte, Finanzierung, Cashflow, Kennzahlen, Szenarien, Fristen, Steuervorbereitung, PDF-Berichte und ein KI-Berater, der mit den eigenen Zahlen rechnet.

Die Daten liegen ausschließlich im Browser des Nutzers (IndexedDB), optional mit AES-256-GCM verschlüsselt. Es gibt kein Konto, keinen Tracker und keinen Server, der Bestandsdaten speichert. Der einzige Serveraufruf ist der Proxy zum KI-Anbieter, und nur nach ausdrücklicher Einwilligung.

## Starten

```bash
npm install
```

```bash
npm run dev
```

Danach http://localhost:3000 öffnen. Beim ersten Start lässt sich ein Beispielportfolio laden (fünf Objekte, 17 Einheiten).

| Befehl | Zweck |
|---|---|
| `npm run dev` | Entwicklungsserver |
| `npm run build` / `npm start` | Produktions-Build und Start |
| `npm test` | Tests des Rechenkerns |
| `npm run typecheck` | Typprüfung |

### KI-Berater einrichten

`.env.example` nach `.env.local` kopieren und `GROQ_API_KEY` setzen (kostenloser Schlüssel unter console.groq.com). Ohne Schlüssel funktioniert alles andere unverändert; der Berater zeigt dann einen Einrichtungshinweis.

- `GROQ_MODELS`: Modelle in Prioritätsreihenfolge. Meldet das erste ein Rate-Limit, wird das nächste versucht.
- `GROQ_BASE_URL`: optional ein anderer OpenAI-kompatibler Endpunkt.

Der Proxy (`src/app/api/ai/route.ts`) prüft die Herkunft und drosselt je Client, hat aber **keine Anmeldung**. Wer die Anwendung öffentlich erreichbar betreibt, sollte sie hinter einen Zugangsschutz stellen, sonst kann jeder Besucher das Kontingent des hinterlegten Schlüssels verbrauchen.

## Aufbau

```
src/lib/calc/     Rechenkern, reines TypeScript ohne UI-Abhängigkeiten
  loans.ts          Tilgungspläne, Stand, Restschuld zum Bindungsende
  afa.ts            Bemessungsgrundlage, lineare und degressive AfA
  valuation.ts      Wertschätzung per Häuserpreisindex
  metrics.ts        Kennzahlen je Objekt und für den Bestand
  projection.ts     Jahresprojektion für Szenarien
  deadlines.ts      Fristen und Hinweise aus den Daten
  rents.ts, tax.ts  Mietenspiegel, Aufstellung nach Anlage V
src/lib/store.ts  Datenhaltung (IndexedDB), src/lib/crypto.ts Verschlüsselung
src/lib/ai/       Aufbereitung des Bestands für den Berater
src/components/   Bedienelemente, Diagramme, Formulare, Navigation
src/app/          Seiten und der KI-Proxy
src/pdf/          Berichte (wird erst beim Erzeugen eines PDFs geladen)
supabase/         Schema-Entwurf für den späteren Sync
tests/            Tests des Rechenkerns
```

Oberfläche und Rechenkern greifen nur über `useStore` auf die Daten zu. Ein Sync-Backend ersetzt später das Laden und Speichern in `store.ts`; `supabase/schema.sql` bildet dafür das Datenmodell samt Rollen und Zugriffsregeln ab (Entwurf, noch nicht gegen eine Datenbank ausgeführt).

## Rechenkonventionen

Alle Kennzahlen sind eine **Jahres-Laufrate zum Stichtag**: laufende Mietverträge, Zins und Tilgung der kommenden zwölf Monate.

| Größe | Definition |
|---|---|
| Bruttomietrendite | Jahreskaltmiete (Ist) / Kaufpreis |
| Nettomietrendite | Reinertrag / Gesamtinvestition (Kaufpreis + Nebenkosten + Anfangsinvestition) |
| Reinertrag | Kaltmiete − nicht umlagefähige Kosten − Betriebskosten leerer Flächen |
| Cashflow vor Steuern | Reinertrag − Zinsen − Tilgung |
| Steuer | (Reinertrag − Zinsen − AfA) × Grenzsteuersatz; negativ = Ersparnis |
| Cash-on-Cash | Cashflow vor Steuern / eingesetztes Eigenkapital |
| Leerstandsquote | entgangene Miete / Sollmiete (wirtschaftlich) |
| Annuität | (Sollzins + anfängliche Tilgung) / 12 auf die Darlehenssumme, Zinsen monatlich auf die Restschuld |
| Anschlussfinanzierung | Rate bleibt bestehen, mindestens Zins + 1 % Tilgung |
| AfA-Basis | (Kaufpreis + Nebenkosten) × Gebäudeanteil + Anfangsinvestition, im Erstjahr zeitanteilig |

Portfolio-Quoten werden aus den Summen berechnet, nicht als Mittel der Objektquoten.

## Grenzen, die man kennen sollte

- **Häuserpreisindex:** Die hinterlegten Jahreswerte sind Näherungen an die Destatis-Reihe und nicht automatisch mit der amtlichen Quelle abgeglichen. Sie lassen sich in den Einstellungen überschreiben. Der Bundesindex sagt wenig über einzelne Lagen; für Bank oder Finanzamt zählt ein Gutachten.
- **Steuer:** Die Aufstellung nach Anlage V rechnet mit Sollmieten und erfassten Kosten. Sie bereitet die Erklärung vor und ersetzt keine Beratung. In den Laufraten ist die Instandhaltung als laufender Aufwand angesetzt, in der Jahresaufstellung nur tatsächlich erfasste Ausgaben.
- **Berater:** Das Sprachmodell hat keine Live-Marktdaten. Standortanalysen beruhen auf allgemeinem Wissen und sind als Schätzung zu lesen. Getestet wurde der Proxy gegen einen lokalen Stellvertreter-Endpunkt, nicht gegen Groq selbst.
- **Ein Gerät:** Ohne Sync liegt der Bestand in genau einem Browser. Backups (Einstellungen) sind der einzige Schutz vor Datenverlust; bei gesetzter Passphrase gibt es keine Wiederherstellung.

## Noch nicht enthalten

Nebenkostenabrechnung, Mieterhöhungs- und Mahnschreiben als geprüfte Vorlagen, Dokumentenablage mit Belegerkennung, Wartungs- und Schadensverwaltung, Versicherungsliste, DATEV-Export, Anmeldung mit Sync und Rollen.
