import { parseMarkdown, type Inline } from "@/lib/markdown";

const Span = ({ parts }: { parts: Inline[] }) => (
  <>
    {parts.map((p, i) =>
      p.bold ? <strong key={i} className="font-semibold text-text">{p.text}</strong>
        : p.italic ? <em key={i}>{p.text}</em>
        : p.code ? <code key={i} className="rounded-[5px] bg-surface-3 px-1 py-[1px] text-[0.92em]">{p.text}</code>
        : <span key={i}>{p.text}</span>,
    )}
  </>
);

/** Rendert Antworten des Beraters. Baut ausschließlich React-Knoten, kein HTML aus dem Modelltext. */
export function Markdown({ text }: { text: string }) {
  const blocks = parseMarkdown(text);
  return (
    <div className="space-y-3 leading-relaxed text-text-2">
      {blocks.map((b, i) => {
        switch (b.type) {
          case "h":
            return b.level === 1
              ? <h3 key={i} className="display pt-1 text-[24px] text-text"><Span parts={b.inline} /></h3>
              : <h4 key={i} className="pt-2 text-[15px] font-semibold text-text"><Span parts={b.inline} /></h4>;
          case "p":
            return <p key={i}><Span parts={b.inline} /></p>;
          case "ul":
            return <ul key={i} className="space-y-1.5 pl-1">{b.items.map((it, n) => <li key={n} className="flex gap-2.5"><span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-accent" /><span><Span parts={it} /></span></li>)}</ul>;
          case "ol":
            return <ol key={i} className="space-y-1.5 pl-1">{b.items.map((it, n) => <li key={n} className="flex gap-2.5"><span className="tnum shrink-0 font-semibold text-accent">{n + 1}.</span><span><Span parts={it} /></span></li>)}</ol>;
          case "table":
            return (
              <div key={i} className="overflow-x-auto rounded-[10px] border border-line">
                <table className="tbl text-[13px]">
                  <thead><tr>{b.head.map((h, n) => <th key={n}><Span parts={h} /></th>)}</tr></thead>
                  <tbody>{b.rows.map((r, n) => <tr key={n}>{r.map((c, k) => <td key={k} className={k > 0 ? "tnum" : "text-text"}><Span parts={c} /></td>)}</tr>)}</tbody>
                </table>
              </div>
            );
          case "hr":
            return <div key={i} className="rule-gold" />;
        }
      })}
    </div>
  );
}
