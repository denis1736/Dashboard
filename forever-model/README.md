# Forever Model (Justin Werlein): Trading-Bot-Projekt

| Datei | Zweck |
|---|---|
| `forever_model.pine` | TradingView-Strategie (Pine v6): Erkennung, Visualisierung, Backtest, Feature-Tags, Webhook-JSON |
| `tools/analyze_trades.py` | Faktor-Analyse der exportierten Trade-Liste mit In-Sample-/Out-of-Sample-Prüfung |

## 1. Das Regelwerk und wie es mechanisiert ist

Grundlage sind öffentliche Zusammenfassungen des Modells (Werlein-PDF „Backtesting Reimagined“ und Video-Zusammenfassungen). **Die Originalquellen konnten nicht vollständig gelesen werden.** Die mit ⚠ markierten Punkte sind meine Interpretation und müssen bestätigt werden.

| # | Original (sinngemäß) | Umsetzung im Script |
|---|---|---|
| 1 | Klare Draw on Liquidity (DOL) | Dealing Range = letztes 1H-Swing-High/-Low (oder Vortages-H/L). DOL Long = Range-High, DOL Short = Range-Low ⚠ |
| 2 | 1H-FVG passend zu Premium/Discount | 3-Kerzen-FVG auf dem HTF (nur geschlossene Bars, kein Repainting). Long nur, wenn die FVG-Mitte unter dem EQ (50 %) liegt, Short nur darüber |
| 3 | Pullback ins 1H-FVG nach Inducement | Tap = LTF-Kerze handelt im FVG. Inducement = Extrem im FVG nimmt ein LTF-Swing-Tief/-Hoch (Pivot, Länge 3) ⚠ |
| 4 | Inverse FVG (IFVG) | Ein LTF-FVG des Gegen-Legs wird per Close überschritten. Optional als Pflichtfilter |
| 5 | CISD | Close über dem Open der ersten Kerze der letzten bärischen Serie ins Tief (Long), spiegelbildlich für Short |
| 6 | Entry auf Retest des CISD | Limit-Order am CISD-Level, gültig für N Bars. Alternativ Market beim CISD-Close |
| 7 | SL am letzten Hoch/Tief | Inducement-Extrem ± Puffer in Ticks |
| 8 | TP 2–2,5 SD des Inducement-Legs, sonst nächste Liquidität, mindestens 2R | `TP = Extrem + SD × Leg-Range` in Trade-Richtung. Fallback: DOL. Bleibt das RR unter dem Minimum, wird das Setup verworfen ⚠ (Anker und Zählweise der SD sind in den Quellen nicht eindeutig) |
| 9 | SMT (NQ/ES) | Optional: Eigenes Symbol unterschreitet das Referenztief, das Vergleichssymbol nicht |
| 10 | NY-AM-Session, keine Red-Folder-News | Entry-Fenster 09:30–11:00 NY. Zwei frei setzbare News-Sperrfenster |

**Visualisierung im Chart:** HTF-FVGs (aktiv in Farbe, invalidiert in Grau), Dealing Range mit EQ und Premium/Discount-Schattierung, Entry-Fenster, Tap, Inducement inkl. Sweep, IFVG, CISD-Linie, SMT-Marke, Entry/SL/TP-Boxen mit RR, SD-Level 1/2/2,5, verworfene Setups mit Grund und eine Status-Tabelle.

**Backtest-Realismus:** Limit-Fills erst, wenn der Preis 1 Tick durch das Limit läuft. Bar Magnifier ist aktiv (Premium-Plan nötig). Gerechnet wird mit 2,50 $ Kommission pro Kontrakt und Seite und 1 Tick Slippage.

## 2. Ehrliche Einordnung

1. **„Perfekt eingestellt“ gibt es nicht.** Mit 10 Filtern und 300 Trades findet ein Optimizer immer eine Kombination mit 80 % Trefferquote, und die ist fast immer Zufall. Der Selbsttest des Analyse-Tools mit Zufallsdaten zeigt das: Die beste In-Sample-Kombination fiel Out-of-Sample von 85 % auf 35 %. Das Ziel ist deshalb eine **robuste** Parametrisierung: Sie bleibt profitabel, wenn sich die Parameter um ±20 % verschieben, und sie hält Out-of-Sample.
2. **Ein diskretionäres Modell verliert bei der Mechanisierung Information.** Ob eine DOL „klar“ ist, entscheidet beim Menschen der Kontext. Das Script braucht eine feste Regel. Schneidet der Bot schlechter ab als Werleins Ergebnisse, liegt der Grund zuerst hier und nicht in den Parametern.
3. **Backtests in TradingView sind optimistisch.** Ursachen sind Limit-Fills, Kerzen, in denen Stop und Ziel beide erreicht werden, und die begrenzte Historie. Erst der Forward-Test zählt.

## 3. Ablaufplan

| Phase | Inhalt | Tools (Kosten) | Abnahmekriterium |
|---|---|---|---|
| **0 · Regeln festnageln** | ⚠-Punkte klären, ggf. Werlein-Material gegenlesen | – | Regelwerk ohne Interpretationsspielraum |
| **1 · Visuelle Verifikation** | Script auf NQ/MNQ 1m/3m/5m laden, im Bar Replay 30+ Setups mit eigener Lesart vergleichen | TradingView (vorhanden) | ≥ 90 % Übereinstimmung mit deinem manuellen Urteil |
| **2 · Basis-Backtest** | Alle Filter aus, möglichst lange Historie (Deep Backtesting), Trade-Liste exportieren | TradingView Premium | ≥ 300 Trades, Rohergebnis dokumentiert |
| **3 · Faktor-Analyse** | `analyze_trades.py`: Einzelfaktoren, 2er-Kombinationen, IS/OOS-Prüfung | Python + pandas (kostenlos) | Faktoren mit OOS-avgR > 0 und n ≥ 30 |
| **4 · Robustheit** | Parameter-Heatmaps (SD, minRR, Fenster), Walk-Forward, Monte-Carlo-Drawdown, Kostenstress (2× Slippage) | Python (kostenlos). Daten: TV-Chart-Export oder Python-Replik | Profitabel in ≥ 70 % der Nachbar-Parameter und in jedem WF-Fenster |
| **5 · Python-Replik** (optional, empfohlen) | Strategie 1:1 in Python für echte Grid-Searches über Jahre | Python, vectorbt/backtesting.py (kostenlos). Daten: TV-Export (kostenlos) oder Databento (ca. 1–2 $/Monat NQ-1m) | Abweichung zu TV < 5 % der Trades |
| **6 · Paper-Forward-Test** | TV-Alerts (`{{strategy.order.alert_message}}`) → Webhook → Broker-Paper-Konto, 2–3 Monate | TV-Webhooks (vorhanden), eigener Webhook-Server (Oracle Cloud Free Tier, kostenlos) | Live-Kennzahlen innerhalb der Backtest-Bandbreite |
| **7 · Live mit Mindestgröße** | 1 MNQ, harte Kill-Switches (Tagesverlust, Max-Trades, Verbindungsabbruch) | Broker-API (z. B. IBKR kostenlos, Tradovate) | 100 Live-Trades ohne Ausführungsfehler |
| **8 · Skalieren & Monitoring** | Logging, Telegram-Benachrichtigung, monatliches Re-Review statt Dauer-Optimierung | Telegram-Bot (kostenlos) | – |

## 4. Bedienung

**Script laden:** Pine-Editor → neues Script → Inhalt von `forever_model.pine` einfügen → *Zum Chart hinzufügen*. Empfohlener Chart: `CME_MINI:MNQ1!` oder `NQ1!` auf 1, 3 oder 5 Minuten. Die Zeitzone ist im Script fest auf New York gesetzt.

**Auswertung:**

1. Strategietester → *Liste der Trades* → Export (CSV)
2. `pip install pandas openpyxl`
3. `python tools/analyze_trades.py trades.csv --min-n 20 --is 0.6`

Für den Basis-Backtest alle Pflichtfilter deaktivieren (Sweep, IFVG, SMT). So werden alle Setups gehandelt, und die Analyse zeigt anhand der Tags, welche Filter wirklich helfen. Beispiel-Tag: `L|sw1|if0|smt1|t0948|dw3|rr2.6|pd0.31|fz24|rk58|rd290|ra1.2|tb7`

| Tag | Bedeutung |
|---|---|
| `sw` / `if` / `smt` | Sweep / IFVG / SMT vorhanden (1/0) |
| `t` | Uhrzeit des Entry-Signals (NY) |
| `dw` | Wochentag (1 = So … 7 = Sa) |
| `rr` | geplantes Chance-Risiko-Verhältnis |
| `pd` | FVG-Lage in der Range (0 = Low, 1 = High) |
| `fz` | FVG-Größe in Ticks |
| `rk` / `rd` | Risiko in Ticks / in $ |
| `ra` | Risiko / ATR(14) |
| `tb` | Bars vom Tap bis zum CISD |
