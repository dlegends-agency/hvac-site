import type { ReactNode } from "react";

/** Minimal, safe Markdown renderer: ##/### headings, lists, paragraphs, **bold**, *italic*, [links](url). No raw HTML. */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) out.push(<strong key={i++}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("*")) out.push(<em key={i++}>{tok.slice(1, -1)}</em>);
    else {
      const [, label, href] = /\[([^\]]+)\]\(([^)\s]+)\)/.exec(tok)!;
      const safe = /^(https?:\/\/|\/|#|mailto:)/.test(href);
      out.push(
        safe ? <a key={i++} href={href} className="text-primary underline">{label}</a> : <span key={i++}>{label}</span>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source }: { source: string }) {
  const blocks = source.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return (
    <div className="space-y-5 text-lg leading-relaxed text-slate-700">
      {blocks.map((raw, idx) => {
        const block = raw.trim();
        if (!block) return null;
        if (block.startsWith("### ")) return <h3 key={idx} className="pt-2 text-xl font-semibold text-navy">{inline(block.slice(4))}</h3>;
        if (block.startsWith("## ")) return <h2 key={idx} className="pt-4 text-2xl font-bold text-navy">{inline(block.slice(3))}</h2>;
        const lines = block.split("\n");
        if (lines.every((l) => /^[-*] /.test(l))) {
          return <ul key={idx} className="list-disc space-y-1.5 pl-6">{lines.map((l, i) => <li key={i}>{inline(l.slice(2))}</li>)}</ul>;
        }
        if (lines.every((l) => /^\d+\. /.test(l))) {
          return <ol key={idx} className="list-decimal space-y-1.5 pl-6">{lines.map((l, i) => <li key={i}>{inline(l.replace(/^\d+\. /, ""))}</li>)}</ol>;
        }
        return <p key={idx}>{inline(lines.join(" "))}</p>;
      })}
    </div>
  );
}
