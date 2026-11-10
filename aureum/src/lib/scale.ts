/** Runde Achsenschritte (1, 2, 2,5, 5 × 10ⁿ), null immer enthalten. */
export function niceScale(min: number, max: number, target = 4): { lo: number; hi: number; ticks: number[] } {
  if (min > 0) min = 0;
  if (max < 0) max = 0;
  if (max === min) max = min + 1;
  const raw = (max - min) / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.abs(v) < step / 1e6 ? 0 : v);
  return { lo, hi, ticks };
}
