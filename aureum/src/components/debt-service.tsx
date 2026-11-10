"use client";

import { useMemo } from "react";
import { buildSchedule, yearlySchedule } from "@/lib/calc/loans";
import type { Loan } from "@/lib/types";
import { BarChart, S } from "./charts";

/** Zins und Tilgung der nächsten Jahre, summiert über mehrere Darlehen. */
export function DebtService({ loans, from, years = 20 }: { loans: Loan[]; from: number; years?: number }) {
  const data = useMemo(() => {
    const map = new Map<number, { interest: number; principal: number }>();
    for (const l of loans) for (const y of yearlySchedule(buildSchedule(l))) {
      if (y.year < from || y.year >= from + years) continue;
      const row = map.get(y.year) ?? { interest: 0, principal: 0 };
      row.interest += y.interest;
      row.principal += y.principal;
      map.set(y.year, row);
    }
    const ys = [...map.keys()].sort((a, b) => a - b);
    return { labels: ys.map(String), interest: ys.map((y) => map.get(y)!.interest), principal: ys.map((y) => map.get(y)!.principal) };
  }, [loans, from, years]);
  if (data.labels.length === 0) return <p className="py-8 text-center text-text-2">Alle Darlehen sind getilgt.</p>;
  return (
    <BarChart
      ariaLabel="Zins und Tilgung je Jahr"
      labels={data.labels}
      total="Kapitaldienst"
      series={[
        { key: "p", label: "Tilgung", color: S.gold, values: data.principal },
        { key: "i", label: "Zinsen", color: S.blue, values: data.interest },
      ]}
    />
  );
}

