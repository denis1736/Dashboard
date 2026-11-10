/** CSV für deutsches Excel: Semikolon, Dezimalkomma, UTF-8 mit BOM. */
export function toCsv(rows: (string | number)[][]): string {
  const cell = (v: string | number): string => {
    if (typeof v === "number") return (Math.round(v * 100) / 100).toString().replace(".", ",");
    return /[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  return "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n");
}

export function downloadText(filename: string, text: string, type = "text/csv;charset=utf-8"): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
