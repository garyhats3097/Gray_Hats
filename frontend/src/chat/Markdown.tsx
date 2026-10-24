import type { ReactNode } from "react";

/**
 * A tiny, safe renderer for the assistant's replies: headings, paragraphs, bullet and numbered
 * lists, tables, **bold**, *italic*, `code` and links. No HTML is ever injected.
 */
export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text
    .replace(/\r/g, "")
    .replace(/<br\s*\/?>/gi, " · ")
    .split("\n");
  const isList = (l: string) => /^\s*([-*•]|\d+[.)])\s+/.test(l);
  const isTable = (l: string) => /^\s*\|.*\|\s*$/.test(l);
  const isHeading = (l: string) => /^\s*#{1,6}\s/.test(l);
  const isRule = (l: string) => /^\s*([-*_])\1{2,}\s*$/.test(l);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || isRule(line)) {
      i++;
    } else if (isTable(line)) {
      const rows: string[][] = [];
      while (i < lines.length && isTable(lines[i])) {
        const cells = lines[i]
          .trim()
          .slice(1, -1)
          .split("|")
          .map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells); // skip the |---|---| line
        i++;
      }
      blocks.push(<Table key={blocks.length} rows={rows} />);
    } else if (isList(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length && (ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*•]\s+/).test(lines[i])) {
        items.push(lines[i].replace(/^\s*(?:[-*•]|\d+[.)])\s+/, ""));
        i++;
      }
      const List = ordered ? "ol" : "ul";
      blocks.push(
        <List key={blocks.length} className={ordered ? "list-decimal space-y-1 pl-5 marker:text-subtle" : "list-disc space-y-1 pl-5 marker:text-accent"}>
          {items.map((it, k) => (
            <li key={k}>{inline(it)}</li>
          ))}
        </List>,
      );
    } else if (isHeading(line)) {
      blocks.push(
        <p key={blocks.length} className="flex items-center gap-1.5 pt-1 text-[13px] font-semibold text-ink first:pt-0">
          <span aria-hidden className="h-3 w-[3px] rounded-full bg-accent" />
          {inline(line.replace(/^\s*#+\s/, "").replace(/\*\*/g, ""))}
        </p>,
      );
      i++;
    } else {
      const para: string[] = [];
      while (i < lines.length && lines[i].trim() && !isList(lines[i]) && !isTable(lines[i]) && !isHeading(lines[i]) && !isRule(lines[i])) para.push(lines[i++]);
      blocks.push(<p key={blocks.length}>{inline(para.join(" "))}</p>);
    }
  }
  return <div className="space-y-2.5">{blocks}</div>;
}

/**
 * Tables are shaped for a narrow chat panel: two columns become label/value rows,
 * wider tables become one small card per row.
 */
function Table({ rows }: { rows: string[][] }) {
  if (rows.length === 0) return null;
  const [head, ...body] = rows.length > 1 ? rows : [[], ...rows];
  if (head.length <= 2) {
    return (
      <div className="divide-y divide-line rounded-xl border border-line bg-surface">
        {body.map((r, k) => (
          <div key={k} className="flex items-baseline justify-between gap-3 px-3 py-1.5">
            <span className="text-muted">{inline(r[0] ?? "")}</span>
            <span className="tabular min-w-0 text-right font-semibold break-words text-ink">{inline(r[1] ?? "")}</span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      {body.map((r, k) => (
        <div key={k} className="rounded-xl border border-line bg-surface px-3 py-2">
          {(r[1] ?? "").length <= 18 ? (
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-medium text-ink">{inline(r[0] ?? "")}</span>
              <span className="tabular shrink-0 font-semibold text-ink">{inline(r[1] ?? "")}</span>
            </div>
          ) : (
            <>
              <p className="font-medium text-ink">{inline(r[0] ?? "")}</p>
              <p className="mt-0.5 break-words text-ink">{inline(r[1] ?? "")}</p>
            </>
          )}
          {r.slice(2).map((cell, c) =>
            cell ? (
              <p key={c} className="mt-0.5 text-[12px] text-muted">
                {inline(cell)}
              </p>
            ) : null,
          )}
        </div>
      ))}
    </div>
  );
}

const TOKEN = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\)|https?:\/\/[^\s)]*[^\s).,!?:;'\"]|\*[^*\s][^*]*\*)/g;

function inline(text: string): ReactNode[] {
  return text.split(TOKEN).map((part, k) => {
    if (!part) return null;
    if (part.startsWith("**") && part.endsWith("**"))
      return (
        <b key={k} className="font-semibold text-ink">
          {part.slice(2, -2)}
        </b>
      );
    if (part.startsWith("`") && part.endsWith("`"))
      return (
        <code key={k} className="rounded bg-sunken px-1 font-mono text-[12px]">
          {part.slice(1, -1)}
        </code>
      );
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
    if (link || /^https?:\/\//.test(part)) {
      const href = link ? link[2] : part;
      return (
        <a key={k} href={href} target="_blank" rel="noreferrer" className="break-all text-accent underline-offset-2 hover:underline">
          {link ? link[1] : part}
        </a>
      );
    }
    if (part.length > 2 && part.startsWith("*") && part.endsWith("*")) return <i key={k}>{part.slice(1, -1)}</i>;
    return part;
  });
}
