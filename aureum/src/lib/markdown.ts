/** Kleiner Markdown-Parser für Antworten des Beraters: Überschriften, Listen, Tabellen, Absätze. */

export interface Inline { text: string; bold?: boolean; italic?: boolean; code?: boolean }

export type Block =
  | { type: "h"; level: 1 | 2 | 3; inline: Inline[] }
  | { type: "p"; inline: Inline[] }
  | { type: "ul" | "ol"; items: Inline[][] }
  | { type: "table"; head: Inline[][]; rows: Inline[][][] }
  | { type: "hr" };

export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g;
  let last = 0;
  for (const m of s.matchAll(re)) {
    if (m.index > last) out.push({ text: s.slice(last, m.index) });
    const t = m[0];
    if (t.startsWith("**")) out.push({ text: t.slice(2, -2), bold: true });
    else if (t.startsWith("`")) out.push({ text: t.slice(1, -1), code: true });
    else out.push({ text: t.slice(1, -1), italic: true });
    last = m.index + t.length;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out;
}

const cells = (line: string): string[] => line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r/g, "").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) { blocks.push({ type: "h", level: Math.min(3, h[1].length) as 1 | 2 | 3, inline: parseInline(h[2]) }); i++; continue; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { blocks.push({ type: "hr" }); i++; continue; }
    if (line.includes("|") && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1] ?? "")) {
      const head = cells(line).map(parseInline);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) { rows.push(cells(lines[i]).map(parseInline)); i++; }
      blocks.push({ type: "table", head, rows });
      continue;
    }
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (ul || ol) {
      const type = ul ? "ul" : "ol";
      const re = ul ? /^\s*[-*•]\s+(.*)$/ : /^\s*\d+[.)]\s+(.*)$/;
      const items: Inline[][] = [];
      while (i < lines.length) {
        const m = re.exec(lines[i]);
        if (!m) break;
        items.push(parseInline(m[1]));
        i++;
      }
      blocks.push({ type, items });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4})\s/.test(lines[i]) && !/^\s*([-*•]|\d+[.)])\s+/.test(lines[i]) && !(lines[i].includes("|") && /^\s*\|?[\s:|-]+\|/.test(lines[i + 1] ?? ""))) {
      para.push(lines[i].trim());
      i++;
    }
    blocks.push({ type: "p", inline: parseInline(para.join(" ")) });
  }
  return blocks;
}
