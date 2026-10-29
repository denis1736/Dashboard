# Forever Model (Justin Werlein): Trading-Bot-Projekt

| Datei | Zweck |
|---|---|
| `forever_model.pine` | TradingView-Strategie (Pine v6): Erkennung, Visualisierung, Backtest, Feature-Tags, Webhook-JSON |
| `tools/analyze_trades.py` | Faktor-Analyse der exportierten Trade-Liste mit In-Sample-/Out-of-Sample-Prüfung |

## 1. Das Regelwerk und wie es mechanisiert ist

Quelle ist das Werlein-PDF „Justin Werlein's Forever Model“ (FX Replay). ⚠ markiert die Stellen, an denen das PDF Interpretationsspielraum lässt.

| # | Regel laut PDF | Umsetzung im Script |
|---|---|---|
| 1 | NY-Session, Execution auf 1/3/5m, HTF 1H, NQ/ES, idealerweise NY AM | Entry-Fenster 09:30–11:00 NY (einstellbar), HTF = 60 |
| 2 | Zuerst eine **klare DOL** identifizieren. Rangfolge: relative Equal H/L > Trendlinien-Liquidität > Buy-/Sellside (interne H/L, Session-H/L) | DOL = nächste unberührte Liquidität aus **Equal H/L** (zwei Swings innerhalb 0,15 × ATR), HTF-Swing, PDH/PDL, Asia, London. ⚠ Trendlinien-Liquidität ist nicht umgesetzt, weil sie kaum objektiv zu fassen ist |
| 3 | 1H-FVG passend zu Premium/Discount, DOL liegt vom FVG weg | 3-Kerzen-FVG auf geschlossenen 1H-Bars. Long nur im Discount, Short nur im Premium der Dealing Range ⚠ (Wahl der Range) |
| 4 | **Inducement**: LTF-Liquidity-Sweep in den HTF-POI | Das Extrem im FVG nimmt ein LTF-Swing-Tief/-Hoch |
| 5 | **IFVG**: FVG, durch das der Preis zurückschließt | Ein LTF-FVG des Legs ins FVG wird per Close überschritten |
| 6 | **CISD**: Close jenseits des Bodys des letzten Price-Legs | Close über dem Open der ersten Kerze der letzten Gegenserie |
| 7 | Entry: **Limit auf den CISD-Retest**. Alternativ: Retest des IFVG | Limit am CISD-Level (Default) oder an der IFVG-Kante |
| 8 | SL am letzten Hoch/Tief | Extrem ± Puffer |
| 9 | TP: 2–2,5 SD-Projektion des **Inducement-Legs**. Bringt das keine 2R, nächste interne H/L oder Liquidität | `TP = Extrem + SD × Leg-Range`, Fallback nächste DOL mit RR ≥ 2. ⚠ Wie die SD gezählt wird, sagt das PDF nicht. Der Multiplikator wird deshalb optimiert |
| 10 | Kein Trade unter 2R, keiner direkt vor Red-Folder-News | Min-RR 2. News-Sperrfenster, manuell zu setzen |
| 11 | Optional **SMT** mit ES (Wick-H/L; Body-Vergleich = „Hidden SMT“) | Wick-SMT am Extrem. ⚠ Hidden SMT ist noch nicht umgesetzt |
| 12 | Bonus: **V-Shape**, also schnelle IFVG-Inversion plus CISD | V-Shape = IFVG und CISD höchstens 5 Bars nach dem Extrem |
| 13 | Trade-Management: keines. Bei gegenläufigem SMT ggf. teilschließen | Kein Management (Break-Even optional). ⚠ SMT-Exit ist für v3 geplant |
| 14 | „Fehlt ein Parameter, sinkt die Qualität, nur A+ Setups“ | **Qualitäts-Score 0–6**: PD, Sweep, IFVG, SMT, V-Shape, Equal-H/L-DOL. Ein Mindestscore ist einstellbar |
| 15 | Optional weitere 1H-POIs (Order Blocks, Breaker, im Beispiel ein BPR) | ⚠ Nicht umgesetzt (Backlog v3) |

**Visualisierung im Chart:** Equal H/L (gelb), unberührte Liquidität (PDH/PDL, Asia, London), DOL-Ziel je Setup, HTF-FVGs (aktiv in Farbe, invalidiert in Grau), Dealing Range mit EQ und Premium/Discount-Schattierung, Entry-Fenster, Tap, Inducement inkl. Sweep, IFVG, CISD-Linie, SMT-Marke, Entry/SL/TP-Boxen mit RR, Score und V-Shape, SD-Level 1/2/2,5, verworfene Setups mit Grund und eine Status-Tabelle.

**Backtest-Realismus:** Limit-Fills erst, wenn der Preis 1 Tick durch das Limit läuft. Gerechnet wird mit 2,50 $ Kommission pro Kontrakt und Seite und 1 Tick Slippage. Der Bar Magnifier ist aus, weil er im Plus-Plan nicht verfügbar ist. Erreichen Stop und Ziel in derselben Kerze, ist das Ergebnis deshalb unscharf.

## 2. Ehrliche Einordnung

1. **„Perfekt eingestellt“ gibt es nicht.** Mit 10 Filtern und 300 Trades findet ein Optimizer immer eine Kombination mit 80 % Trefferquote, und die ist fast immer Zufall. Der Selbsttest des Analyse-Tools mit Zufallsdaten zeigt das: Die beste In-Sample-Kombination fiel Out-of-Sample von 85 % auf 35 %. Das Ziel ist deshalb eine **robuste** Parametrisierung: Sie bleibt profitabel, wenn sich die Parameter um ±20 % verschieben, und sie hält Out-of-Sample.
2. **Ein diskretionäres Modell verliert bei der Mechanisierung Information.** Ob eine DOL „klar“ ist, entscheidet beim Menschen der Kontext. Das Script braucht eine feste Regel. Schneidet der Bot schlechter ab als Werleins Ergebnisse, liegt der Grund zuerst hier und nicht in den Parametern.
3. **Backtests in TradingView sind optimistisch.** Ursachen sind Limit-Fills, Kerzen, in denen Stop und Ziel beide erreicht werden, und die begrenzte Historie. Erst der Forward-Test zählt.

## 3. Ablaufplan

**Rahmenbedingungen:** Der TradingView-Plus-Plan lädt nur rund 10.000 Bars. Das sind auf 5m etwa 6–7 Wochen, auf 1m wenige Tage, also zu wenige Trades für eine Aussage. TradingView dient deshalb der **visuellen Verifikation und der Live-Signalerzeugung**. Der statistische Backtest über mehrere Jahre läuft in **Python**.

| Phase | Inhalt | Tools (Kosten) | Abnahmekriterium |
|---|---|---|---|
| **0 · Regeln festnageln** | Offene ⚠-Punkte klären (Werlein-PDF ist eingearbeitet) | – | Regelwerk ohne Interpretationsspielraum |
| **1 · Visuelle Verifikation** | Script auf MNQ/NQ 1m/3m/5m, im Bar Replay 30+ Setups mit eigener Lesart vergleichen, Regeln nachschärfen | TradingView Plus (vorhanden) | ≥ 90 % Übereinstimmung mit deinem manuellen Urteil |
| **2 · Daten beschaffen** | NQ + ES 1m-OHLCV, 2019 bis heute | Databento (ca. 125 $ Startguthaben, deckt das voraussichtlich ab) oder FirstRateData (einmalig ca. 100 $) | Datensatz ohne Lücken, Roll-adjustiert |
| **3 · Python-Replik** | Strategie 1:1 nachbauen. Abgleich gegen TV auf den Wochen, die TV laden kann | Python, pandas, numba (kostenlos) | ≥ 95 % identische Trades zum TV-Script |
| **4 · Basis-Backtest + Faktor-Analyse** | Alle Filter aus, jahrelange Historie. Danach Einzelfaktoren und 2er-Kombinationen, IS/OOS (`analyze_trades.py` liest dasselbe Tag-Format) | Python (kostenlos) | Faktoren mit OOS-avgR > 0 und n ≥ 30 |
| **5 · Robustheit** | Parameter-Heatmaps, Walk-Forward (z. B. 2 Jahre IS / 6 Monate OOS, rollierend), Monte-Carlo-Drawdown, Kostenstress | Python (kostenlos) | Profitabel in ≥ 70 % der Nachbar-Parameter und in jedem WF-Fenster. MC-Drawdown (95 %) < Prop-Limit |
| **6 · Prop-Regeln simulieren** | Trailing Drawdown, Daily Loss Limit, Konsistenzregel der gewählten Firma auf die Equity-Kurve legen | Python (kostenlos) | Bestehensquote der Evaluation in der Monte-Carlo-Simulation |
| **7 · Forward-Test** | TV-Alert (`{{strategy.order.alert_message}}`) → Webhook → Tradovate-Demo, 2–3 Monate | TV-Webhooks (Plus ✓). Bridge: TradersPost / PickMyTrade (kostenpflichtig) oder eigener Server | Live-Kennzahlen innerhalb der Backtest-Bandbreite |
| **8 · Evaluation / Live** | 1 MNQ, Kill-Switches (Tagesverlust, Max-Trades, Verbindungsverlust), Telegram-Logging | – | 100 Trades ohne Ausführungsfehler |

**Prop-Firma und Automatisierung (Stand der Quellen Okt. 2026, vor dem Kauf beim Anbieter prüfen):**

| Anbieter | Automatisierung |
|---|---|
| Apex | Laut aktuellen Quellen auf allen Konten verboten. Für den Bot ungeeignet |
| Topstep | Bots in Combine und Express Funded erlaubt, im Live Funded nicht. Kein VPS bzw. Remote-Server, der Bot muss auf deinem eigenen Rechner laufen |
| Lucid | Laut Update vom September 2026 erlaubt. HFT und Mikro-Scalping (≤ 5 s) verboten |
| Tradeify | Erlaubt, wenn du alleiniger Eigentümer der Strategie bist |

Folge für die Architektur: Der Ausführungs-Server sollte **lokal auf deinem PC** laufen können, nicht nur in der Cloud. Ich plane ihn so, dass beides geht.

## 4. Bedienung

**Script laden:** Pine-Editor → neues Script → Inhalt von `forever_model.pine` einfügen → *Zum Chart hinzufügen*. Empfohlener Chart: `CME_MINI:MNQ1!` oder `NQ1!` auf 1, 3 oder 5 Minuten. Die Zeitzone ist im Script fest auf New York gesetzt.

**Auswertung:**

1. Strategietester → *Liste der Trades* → Export (CSV)
2. `pip install pandas openpyxl`
3. `python tools/analyze_trades.py trades.csv --min-n 20 --is 0.6`

Mit dem Plus-Plan reicht das nur für einen Funktionstest. Aussagekräftig wird die Analyse ab Phase 4.

Für den Basis-Backtest alle Pflichtfilter deaktivieren (Sweep, IFVG, SMT, DOL). So werden alle Setups gehandelt, und die Analyse zeigt anhand der Tags, welche Filter wirklich helfen. Beispiel-Tag: `L|sw1|if0|smt1|t0948|dw3|rr2.6|pd0.31|fz24|rk58|rd290|ra1.2|tb7`

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
| `dl` | RR bis zur nächsten unberührten DOL (−1 = keine) |
| `ds` | DOL-Quelle: 1 HTF-Swing, 2 PDH/PDL, 3 Asia, 4 London, 5 Equal H/L |
| `q` | Qualitäts-Score 0–6 |
| `ve` | Bars vom Extrem bis zum CISD (V-Shape-Tempo) |
| `eq` | Unberührte Equal H/L in Trade-Richtung vorhanden (1/0) |
