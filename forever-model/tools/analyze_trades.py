#!/usr/bin/env python3
"""Faktor-Analyse für das Forever-Model-Script.

Liest die aus dem TradingView-Strategietester exportierte Trade-Liste (CSV oder XLSX),
zerlegt den Feature-Tag im Feld "Signal" (z. B. "L|sw1|if0|smt0|t0948|dw3|rr2.6|...")
und wertet aus, welche Merkmale und Merkmals-Kombinationen die beste Erwartung haben.

Gegen Overfitting:
  * Trefferquote wird zusätzlich als Wilson-Untergrenze (95 %) ausgegeben.
  * Kombinationen werden nur auf den ersten --is Anteil der Trades (chronologisch)
    gesucht und anschließend auf dem Rest (Out-of-Sample) gegengeprüft.

Aufruf:
  python analyze_trades.py trades.csv [--min-n 20] [--is 0.6] [--out ergebnis.csv]
"""
import argparse
import itertools
import math
import re
import sys

import pandas as pd

CATEGORICAL = ["side", "pk", "tf", "se", "cn", "sw", "if", "smt", "cf", "v", "q", "eq", "ds", "dw"]
NUMERIC = ["rr", "pd", "fz", "rk", "ra", "tb", "dl", "ve"]
# Klartext für Codes aus dem Pine-Tag
NAMES = {
    "pk": {1: "FVG", 2: "BAG", 3: "OB", 4: "Breaker", 5: "BPR", 6: "HTF-IFVG"},
    "se": {1: "London", 2: "NY AM", 3: "NY PM"},
    "ds": {0: "keine", 1: "HTF-Swing", 2: "PDH/PDL", 3: "Asia", 4: "London", 5: "Equal H/L"},
}
TAG_RE = re.compile(r"^([a-z]+)(-?\d+(?:\.\d+)?)$")


def find_col(df, *candidates, exclude=()):
    for cand in candidates:
        for col in df.columns:
            low = col.lower()
            if cand in low and not any(x in low for x in exclude):
                return col
    return None


def load(path):
    df = pd.read_excel(path) if path.lower().endswith((".xlsx", ".xls")) else pd.read_csv(path)
    c_trade = find_col(df, "trade #", "trade")
    c_type = find_col(df, "type")
    c_sig = find_col(df, "signal")
    c_pnl = find_col(df, "net p&l", "profit", "p&l", exclude=("%", "cum"))
    c_time = find_col(df, "date", "time")
    c_run = find_col(df, "run-up", exclude=("%",))
    if not all([c_trade, c_type, c_sig, c_pnl]):
        sys.exit(f"Spalten nicht erkannt. Gefunden: {list(df.columns)}")

    rows = []
    for _, g in df.groupby(c_trade):
        entry = g[g[c_type].astype(str).str.contains("entry", case=False)]
        exit_ = g[g[c_type].astype(str).str.contains("exit", case=False)]
        if entry.empty or exit_.empty:
            continue  # offener Trade
        tag = parse_tag(str(entry[c_sig].iloc[0]))
        if tag is None:
            continue
        tag["sig"] = str(entry[c_sig].iloc[0])
        tag["pnl"] = num(exit_[c_pnl].iloc[0])
        tag["runup"] = num(exit_[c_run].iloc[0]) if c_run else float("nan")
        tag["time"] = pd.to_datetime(entry[c_time].iloc[0]) if c_time else None
        rows.append(tag)
    if not rows:
        sys.exit("Keine Trades mit Forever-Model-Tag gefunden.")
    out = pd.DataFrame(rows)
    # Teilausstiege erscheinen in TradingView als eigene Trades mit gleichem Entry → zu einer Position zusammenfassen
    keys = ["time", "sig"] if c_time else ["sig"]
    agg = {c: "first" for c in out.columns if c not in keys}
    agg.update(pnl="sum", runup="max")
    out = out.groupby(keys, as_index=False, sort=False).agg(agg)
    out = out.sort_values("time" if c_time else "pnl").reset_index(drop=True)
    for col, names in NAMES.items():
        if col in out:
            out[col] = out[col].map(lambda v, n=names: n.get(int(v), v) if pd.notna(v) else v)
    out["R"] = out["pnl"] / out["rd"].where(out["rd"] > 0)
    out["runR"] = out["runup"] / out["rd"].where(out["rd"] > 0)
    out["win"] = out["pnl"] > 0
    return out


def num(v):
    try:
        return float(str(v).replace(",", "").replace(" ", ""))
    except ValueError:
        return float("nan")


def parse_tag(sig):
    parts = sig.split("|")
    if not parts or parts[0] not in ("L", "S"):
        return None
    tag = {"side": parts[0]}
    for p in parts[1:]:
        m = TAG_RE.match(p)
        if m:
            tag[m.group(1)] = float(m.group(2))
    if "t" in tag:  # HHMM → Halbstunden-Slot "09:30"
        hh, mm = divmod(int(tag.pop("t")), 100)
        tag["slot"] = f"{hh:02d}:{0 if mm < 30 else 30:02d}"
    return tag


def wilson_lb(wins, n, z=1.96):
    if n == 0:
        return 0.0
    p = wins / n
    return (p + z * z / (2 * n) - z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / (1 + z * z / n)


def stats(sub):
    n = len(sub)
    wins = int(sub["win"].sum())
    gross_win = sub.loc[sub["pnl"] > 0, "pnl"].sum()
    gross_loss = -sub.loc[sub["pnl"] < 0, "pnl"].sum()
    return {
        "n": n,
        "winrate": wins / n if n else 0,
        "wr_lb95": wilson_lb(wins, n),
        "avgR": sub["R"].mean(),
        "sumR": sub["R"].sum(),
        "pf": gross_win / gross_loss if gross_loss > 0 else float("inf"),
    }


def add_bins(df, edges=None):
    """Numerische Merkmale in Quartile einteilen; Grenzen aus In-Sample übernehmen."""
    edges = edges or {}
    for col in NUMERIC:
        if col not in df:
            continue
        if col not in edges:
            q = df[col].quantile([0, 0.25, 0.5, 0.75, 1]).unique()
            if len(q) < 3:
                continue
            q[0], q[-1] = -math.inf, math.inf
            edges[col] = q
        df[col + "_b"] = pd.cut(df[col], edges[col], duplicates="drop").astype(str)
    return df, edges


def factors(df):
    cols = [c for c in CATEGORICAL + ["slot"] if c in df]
    return cols + [c + "_b" for c in NUMERIC if c + "_b" in df]


def table(df, keys, min_n):
    res = []
    for vals, sub in df.groupby(keys):
        if len(sub) >= min_n:
            vals = vals if isinstance(vals, tuple) else (vals,)
            res.append({"faktor": " & ".join(f"{k}={v}" for k, v in zip(keys, vals)), **stats(sub)})
    return res


def fmt(rows, limit=None):
    if not rows:
        return "  (keine Gruppe mit ausreichend Trades)"
    d = pd.DataFrame(rows).head(limit)
    return d.to_string(index=False, float_format=lambda x: f"{x:.2f}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("file")
    ap.add_argument("--min-n", type=int, default=20, help="Mindestanzahl Trades je Gruppe")
    ap.add_argument("--is", dest="is_share", type=float, default=0.6, help="In-Sample-Anteil (chronologisch)")
    ap.add_argument("--top", type=int, default=15)
    ap.add_argument("--out", help="Kombinationen als CSV speichern")
    a = ap.parse_args()

    df = load(a.file)
    cut = int(len(df) * a.is_share)
    ins, oos = df.iloc[:cut].copy(), df.iloc[cut:].copy()
    ins, edges = add_bins(ins)
    oos, _ = add_bins(oos, edges)
    df, _ = add_bins(df, edges)

    print(f"\n=== Gesamt ({len(df)} Trades, IS {len(ins)} / OOS {len(oos)}) ===")
    print(fmt([{"faktor": "alle", **stats(df)}, {"faktor": "In-Sample", **stats(ins)}, {"faktor": "Out-of-Sample", **stats(oos)}]))

    if df["runR"].notna().any():
        print("\n=== Run-up (max. Buchgewinn bis zum Ausstieg, in R) ===")
        print("  Hinweis: endet am TP, zeigt also nicht, wie weit der Kurs danach noch lief (dafür: Exit-Lab im Chart).")
        for k in (1, 2, 3, 4):
            print(f"  ≥ {k}R erreicht: {(df['runR'] >= k).mean():.0%}")
        print(f"  Verlierer, die vorher ≥ 1R im Plus waren: {((df['R'] < 0) & (df['runR'] >= 1)).sum()} von {(df['R'] < 0).sum()}")

    print(f"\n=== Einzelfaktoren (alle Trades, n ≥ {a.min_n}) ===")
    single = []
    for f in factors(df):
        single += table(df, [f], a.min_n)
    print(fmt(sorted(single, key=lambda r: r["avgR"], reverse=True)))

    print(f"\n=== Top-Kombinationen aus 2 Faktoren: gesucht In-Sample, geprüft Out-of-Sample ===")
    combos = []
    for keys in itertools.combinations(factors(ins), 2):
        for r in table(ins, list(keys), a.min_n):
            mask = pd.Series(True, index=oos.index)
            for part in r["faktor"].split(" & "):
                k, v = part.split("=", 1)
                mask &= oos[k].astype(str) == v
            o = stats(oos[mask]) if mask.any() else {"n": 0, "winrate": 0, "avgR": float("nan")}
            combos.append({**r, "oos_n": o["n"], "oos_winrate": o["winrate"], "oos_avgR": o["avgR"]})
    combos.sort(key=lambda r: (r["avgR"], r["wr_lb95"]), reverse=True)
    print(fmt(combos, a.top))
    print("\nHinweis: Nur Kombinationen übernehmen, deren oos_avgR klar > 0 und deren n groß genug ist.")

    if a.out and combos:
        pd.DataFrame(combos).to_csv(a.out, index=False)
        print(f"Gespeichert: {a.out}")


if __name__ == "__main__":
    main()
