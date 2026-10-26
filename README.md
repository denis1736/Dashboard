# Glass Cockpit

Dashboard für Unternehmenskennzahlen im „Frosted Glass“-Stil: halbtransparente Glasflächen über einer weichgezeichneten Raum-Szene, Icon-Leiste links, Assistent-Leiste oben, schwebende Tab-Leiste unten.

Eine einzige Datei (`index.html`), ohne Build-Schritt und ohne Abhängigkeiten. Einfach im Browser öffnen.

## Bereiche

| Bereich | Inhalt |
|---|---|
| **Übersicht** | Liquidität über alle Konten, Umsatz/Kosten/Gewinn/Umsatzrendite des aktuellen Monats, Gewinn & Verlust (8 Monate), Kostenbudget, Firmenkarten, letzte Aktivitäten (Suche + Statusfilter) |
| **Aktivität** | Alle Buchungen, sortierbar, durchsuchbar, nach Status filterbar |
| **Ziele** | Rücklagen gesamt, monatliche Zuführung, automatische Rücklage (Schalter), Ziele mit Fortschrittsring, „Betrag zuführen“, neues Ziel anlegen |
| **Berichte** | Einnahmen, Ausgaben, Nettogewinn, Umsatzrendite für 6/12/24 Monate mit Vergleich zur Vorperiode, Einnahmen vs. Ausgaben, Kosten nach Kategorie, Monatsabschlüsse als CSV |
| **Konto** | Name, Unternehmen, Kostenbudget, Szene (Tag/Abend/eigenes Foto), CSV-Import und -Export |

Der **Assistent** oben beantwortet Fragen zu den geladenen Zahlen, z. B. „Wie hoch ist die Marge?“, „Welcher Monat war der beste?“ oder „Wie viel kostet Marketing?“. Er arbeitet regelbasiert und ohne KI-Anbindung.

## Eigene Daten

Unter **Konto › Daten** eine CSV mit Monatswerten importieren:

```
monat;einnahmen;personal;material;software;marketing;sonstiges
2026-01;412.500,00;121000;84000;27000;26000;15000
2026-02;398.200,00;121500;80000;27100;24000;14200
```

- Trennzeichen `;` (deutsches Excel, Komma = Dezimalzeichen) oder `,` (Punkt = Dezimalzeichen)
- Monat im Format `JJJJ-MM`, mindestens zwei Monate

Alle Einstellungen, Buchungen, Ziele und importierten Daten werden nur lokal im Browser gespeichert (`localStorage`).
