# Forever Model (Justin Werlein): Trading-Bot-Projekt

| Datei | Zweck |
|---|---|
| `forever_model.pine` | TradingView-Strategie v2 (Pine v6): Erkennung, Visualisierung, Backtest, Exit-Lab, Feature-Tags, Webhook-JSON |
| `tools/analyze_trades.py` | Faktor-Analyse der exportierten Trade-Liste mit In-Sample-/Out-of-Sample-Prüfung |

## 1. Regelwerk und Umsetzung

Quelle ist das Werlein-PDF „Justin Werlein's Forever Model“ (FX Replay). ⚠ markiert Stellen, an denen das PDF Spielraum lässt.

| # | Regel laut PDF | Umsetzung im Script |
|---|---|---|
| 1 | NY-Session, Execution 1/3/5m, HTF 1H, NQ/ES | Drei Sessions einzeln schaltbar: **London 02–05, NY AM 09:30–12, NY PM 13:30–15:30** (NY-Zeit). Die Session steht im Tag (`se`) und lässt sich so auswerten |
| 2 | Klare DOL. Rangfolge: relative Equal H/L > Trendlinie > interne H/L, Session-H/L | Nächste unberührte Liquidität aus Equal H/L, HTF-Swing, PDH/PDL, Asia, London. ⚠ Trendlinien-Liquidität ist nicht umgesetzt |
| 3 | 1H-POI passend zu Premium/Discount | POIs auf **zwei HTFs (Default 15m + 1H)**. Long nur im Discount, Short nur im Premium |
| 4 | Inducement = LTF-Sweep in den POI | Das Extrem im POI nimmt ein LTF-Swing-Tief/-Hoch |
| 5 | IFVG | Ein LTF-FVG des Legs wird per Close überschritten |
| 6 | CISD = Close jenseits des Bodys des letzten Legs | Close über dem Open der ersten Kerze der letzten Gegenserie |
| 7 | Limit-Entry am CISD-Retest (alternativ IFVG-Retest) | Beides wählbar, zusätzlich Market |
| 8 | SL am letzten Hoch/Tief | Extrem ± Puffer |
| 9 | TP 2–2,5 SD des Inducement-Legs, sonst nächste Liquidität, min. 2R | `TP = Extrem + SD × Leg-Range`, Fallback DOL. **Trades unter Min-RR (Default 2) werden nicht eingegangen** |
| 10 | Keine Trades direkt vor Red-Folder-News | Zwei Sperrfenster (manuell) |
| 11 | SMT optional | Wick-SMT mit Vergleichssymbol. ⚠ Hidden SMT fehlt noch |
| 12 | V-Shape als Bonus | IFVG + CISD höchstens 5 Bars nach dem Extrem |
| 13 | Kein Trade-Management | Default aus. Optional Teilgewinn und Break-Even. Was davon sinnvoll ist, misst das Exit-Lab |
| 14 | „Nur A+ Setups“ | Qualitäts-Score 0–7: PD, Sweep, IFVG, SMT, V-Shape, EQ-DOL, CISD+FVG |
| 15 | Weitere 1H-POIs (OB, Breaker, BPR) | Umgesetzt, siehe unten |

### POI-Typen (auf jedem HTF)

| Kürzel | Definition (mechanisch) | Rahmen im Chart |
|---|---|---|
| **FVG** | 3-Kerzen-Gap auf geschlossenen HTF-Bars | durchgezogen |
| **BAG** (Breakaway Gap) | FVG, dessen mittlere Kerze gleichzeitig ein **CISD** ist (Close über dem Open der letzten Gegenserie) | durchgezogen, kräftig |
| **OB** | Letzte Gegenkerze (bis 3 Kerzen) vor einem FVG-Displacement, dessen Close über ihr Hoch geht | gestrichelt |
| **BRK** (Breaker) | OB, durch den eine HTF-Kerze schließt. Gilt danach in Gegenrichtung | gepunktet |
| **BPR** | Überlappung eines neuen FVG mit einem gegenläufigen FVG der letzten 12 HTF-Bars | durchgezogen |
| **iFVG** | HTF-FVG, durch das eine HTF-Kerze schließt. Gilt danach in Gegenrichtung | gepunktet |

Grün steht für bullische, Rot für bärische Zonen. Die Beschriftung zeigt TF, Typ und Richtung (z. B. „15m BAG ▲“). Treffen mehrere POIs gleichzeitig, gewinnt der höhere TF. Die Anzahl gleichzeitig getroffener POIs wird als Konfluenz (`cn`) gespeichert.

Zusätzlich auf dem LTF: **CISD+FVG** (`cf`). Das Leg vom Extrem bis zum CISD hat ein FVG in Trade-Richtung erzeugt, also echtes Displacement.

### Anzeige

Der *Detailgrad* steuert die Darstellung:

| Stufe | Inhalt |
|---|---|
| **Minimal** | Nur Trades: POI, IFVG, CISD, Sweep, Entry/SL/TP, SD-Level |
| **Standard** | Zusätzlich aktive POIs (invalidierte werden gelöscht), Equal H/L, aktuelle Liquidität und Range nur am rechten Rand, Session-Hintergrund |
| **Debug** | Zusätzlich verworfene Setups mit Grund, invalidierte POIs in Grau, Swings und MFE je Trade |

Alle Details zu einem Trade stehen im **Tooltip** des grünen R-Labels (mit der Maus darüberfahren). So bleibt der Chart frei.

## 2. Risiko

### Aktuelle Einstellungen

| Parameter | Default | Bedeutung |
|---|---|---|
| Positionsgröße | 1 Kontrakt fix | Alternativ **fixes $-Risiko** (Kontrakte = $-Risiko ÷ Stop-Distanz) oder % Equity |
| **1R** | = Stop-Distanz × Punktwert × Kontrakte | Mit festem $-Risiko ist 1R konstant (z. B. 200 $), sonst schwankt es mit der Stop-Größe |
| Min. RR | 2,0 | Liegt das Ziel unter 2R, wird der Trade nicht eingegangen (auch nicht über den DOL-Fallback) |
| Tagesstopp | −2R oder 2 Verlusttrades | Danach keine neuen Setups an diesem Tag |
| Max. Trades | 2 je Session, 4 je Tag | |
| Kosten | 0,90 $ je Kontrakt und Seite, 1 Tick Slippage | Für MNQ. Bei NQ in den Eigenschaften auf ca. 2,50 $ erhöhen |

### Empfehlung (vorläufig, wird nach dem Backtest mit Monte Carlo festgezurrt)

1. **Fixes $-Risiko statt fixer Kontrakte.** Nur so ist jeder Trade gleich gewichtet und die R-Auswertung sauber. Handle MNQ, damit die Größe fein genug skaliert.
2. **1R = Drawdown-Limit ÷ 15 bis ÷ 20.** Grund: Bei 40 % Trefferquote liegt die erwartete längste Verlustserie in 300 Trades bei etwa 9–10 Trades (ln(300 × 0,4) / ln(1/0,6) ≈ 9,4). Bei 2.000 $ Drawdown sind 200 $ pro Trade (DD ÷ 10) deshalb zu viel, 100–130 $ sind tragfähig.
3. **Tagesstopp −2R oder 2 Verluste.** Ist bereits eingebaut.
4. **Drawdown-Bremse.** Liegt die Equity 4R unter dem Hoch, das Risiko halbieren, bis ein neues Hoch erreicht ist. Wird im Python-Backtest simuliert und später im Bot umgesetzt.
5. **Erst skalieren, wenn der Puffer mindestens 2 × DD beträgt.** Dann höchstens auf das 1,5-fache.
6. **Teilgewinne nur, wenn das Exit-Lab sie bestätigt.** Teilgewinne senken die Schwankung, aber fast immer auch den Erwartungswert. Sie lohnen sich nur, wenn der Kurs nach dem ersten Ziel häufig dreht. Genau das misst das Exit-Lab. Mit einem einzelnen Kontrakt sind Teilgewinne technisch nicht möglich.

### Exit-Lab (Tabelle unten rechts)

Für jeden gefüllten Trade läuft im Hintergrund ein Schatten-Trade weiter, auch nach dem echten Ausstieg. Er läuft bis zum ursprünglichen Stop, zum Flat-Zeitpunkt oder bis 400 Bars. Gemessen wird Folgendes:

- **Reichweite (MFE) vor dem Stop:** Wie viele Trades haben ≥ 1R, 2R … 6R erreicht, bevor der Stop fiel, und wie hoch ist der Durchschnitt? Das beantwortet die Frage, wie viel R in jedem Trade drin war.
- **Trefferquote der Level vor dem Stop:** SD 1, SD 2, SD 2,5 und nächste Liquidität.
- **11 Ausstiegsvarianten im Vergleich** (Ø R, Σ R, Win %): fixe Ziele 1–5R, das Strategie-TP, SD 2, sowie Teilgewinne mit Break-Even (SD1 → SD2.5, Liquidität → SD2.5, 1R → TP, 2R → TP).

Die Rechnung ist konservativ: Erreicht eine Kerze sowohl Stop als auch Ziel, zählt der Stop. In der Fill-Kerze zählt nur die Gegenbewegung.

## 3. Längerer Backtest (kostenlos)

TradingView Plus lädt nur rund 10.000 Bars. Auf 1m sind das wenige Tage, auf 5m 6–7 Wochen. Das reicht nicht. Der kostenlose Weg:

1. **Daten: Dukascopy, 1m, kostenlos, ab etwa 2012.** Nasdaq 100 als `usatechidxusd`, S&P 500 als `usa500idxusd` für SMT. Herunterladen auf deinem PC (Node.js nötig, kostenlos):

   ```bash
   npx dukascopy-node -i usatechidxusd -from 2019-01-01 -to 2026-10-01 -t m1 -f csv
   ```

   Einschränkung: Das ist der CFD auf den Kassa-Index, nicht der Future. Der Preis hat einen Versatz, und Roll-Gaps fehlen. Die Intraday-Struktur (FVGs, Sweeps, CISD) ist jedoch praktisch identisch. Für ein Modell, das nur aus Preisstruktur besteht, ist das ausreichend. Zeiten liegen in UTC und werden im Backtester umgerechnet.

2. **Backtester: Python-Nachbau des Pine-Scripts** (nächster Schritt, kostenlos). Er arbeitet mit denselben Regeln, Tags und demselben Exit-Lab über 5–7 Jahre. Das ergibt Tausende Trades statt Dutzende. Danach laufen Walk-Forward, Monte Carlo und die Simulation der Prop-Regeln.

3. Optional zur Absicherung: echte Futures-Daten (Databento mit Startguthaben, oder FirstRateData). Damit lassen sich die Ergebnisse stichprobenartig gegenprüfen.

## 4. Ablaufplan

| Phase | Inhalt | Tools (Kosten) | Abnahmekriterium |
|---|---|---|---|
| **0 · Regeln** | Werlein-PDF eingearbeitet. Offene ⚠-Punkte im Replay klären | – | Regelwerk ohne Spielraum |
| **1 · Visuelle Verifikation** | v2 auf MNQ 1m/3m/5m, 30+ Setups im Bar Replay prüfen | TradingView Plus | ≥ 90 % Übereinstimmung mit deinem Urteil |
| **2 · Daten** | Dukascopy NAS100 + US500 1m, 2019–heute | kostenlos | lückenlos |
| **3 · Python-Replik** | Pine-Logik 1:1 in Python inkl. Exit-Lab | Python (kostenlos) | ≥ 95 % identische Trades zu TV im gemeinsamen Zeitraum |
| **4 · Faktor-Analyse** | Wert jeder Komponente (POI-Typ, TF, Session, Sweep, IFVG, CF, SMT …), IS/OOS | `analyze_trades.py` | Faktoren mit OOS-avgR > 0, n ≥ 30 |
| **5 · Robustheit** | Parameter-Heatmaps, Walk-Forward, Monte Carlo, doppelte Kosten | Python | profitabel in ≥ 70 % der Nachbarparameter und jedem WF-Fenster |
| **6 · Risiko & Prop** | Positionsgröße, Drawdown-Bremse und Prop-Regeln per Monte Carlo | Python | Bestehensquote der Evaluation ≥ Zielwert |
| **7 · Forward-Test** | TV-Alerts → Webhook → Tradovate-Demo, 2–3 Monate | TV-Webhooks. Bridge: eigener lokaler Server oder TradersPost/PickMyTrade | Live innerhalb der Backtest-Bandbreite |
| **8 · Live** | MNQ, Kill-Switches, Logging | – | 100 Trades ohne Ausführungsfehler |

**Prop-Firma und Automatisierung (Quellen Okt. 2026, vor dem Kauf prüfen):**

| Anbieter | Automatisierung |
|---|---|
| Apex | Laut aktuellen Quellen auf allen Konten verboten |
| Topstep | Bots in Combine und Express Funded erlaubt, im Live Funded nicht. Kein VPS, der Bot muss lokal laufen |
| Lucid | Laut Update vom September 2026 erlaubt. HFT und Mikro-Scalping verboten |
| Tradeify | Erlaubt bei alleinigem Eigentum an der Strategie |

## 5. Bedienung

**Script laden:** Pine-Editor → Inhalt von `forever_model.pine` einfügen → *Zum Chart hinzufügen*. Chart: `MNQ1!` oder `NQ1!` auf 1, 3 oder 5 Minuten. Auf einem 15m-Chart wird HTF 1 automatisch deaktiviert.

**Auswertung:** Strategietester → *Liste der Trades* → Export (CSV), danach:

```bash
pip install pandas openpyxl
```

```bash
python tools/analyze_trades.py trades.csv --min-n 20 --is 0.6
```

Teilausstiege werden automatisch zu einer Position zusammengefasst. Für den Basis-Backtest alle Pflichtfilter ausschalten (Sweep, IFVG, CF, SMT, DOL, Min-Score 0). Nur dann zeigen die Tags, welche Komponente wirklich etwas bringt.

| Tag | Bedeutung |
|---|---|
| `pk` | POI-Typ: 1 FVG, 2 BAG, 3 OB, 4 Breaker, 5 BPR, 6 HTF-IFVG |
| `tf` | POI-Timeframe in Minuten |
| `cn` | Konfluenz (Anzahl gleichzeitig getroffener POIs) |
| `se` | Session: 1 London, 2 NY AM, 3 NY PM |
| `sw` / `if` / `smt` / `cf` / `v` | Sweep / IFVG / SMT / CISD+FVG / V-Shape (1/0) |
| `q` | Qualitäts-Score 0–7 |
| `t` / `dw` | Uhrzeit (NY) / Wochentag (1 = So) |
| `rr` | geplantes RR |
| `pd` | POI-Lage in der Range (0 = Low, 1 = High) |
| `fz` | POI-Größe in Ticks |
| `rk` / `rd` / `ra` | Risiko in Ticks / in $ / relativ zur ATR |
| `tb` / `ve` | Bars Tap → CISD / Extrem → CISD |
| `dl` / `ds` / `eq` | RR bis zur nächsten DOL / DOL-Quelle (5 = Equal H/L) / Equal H/L vorhanden |
