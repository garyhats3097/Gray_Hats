import type { ReactNode } from "react";

/**
 * A tiny, safe renderer for the assistant's replies: paragraphs, bullet and numbered lists,
 * headings, **bold**, *italic*, `code` and links. No HTML is ever injected.
 */
export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r/g, "").split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
    } else if (/^\s*[-*•]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length && (ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*•]\s+/).test(lines[i])) {
        items.push(lines[i].replace(/^\s*(?:[-*•]|\d+[.)])\s+/, ""));
        i++;
      }
      const List = ordered ? "ol" : "ul";
      blocks.push(
        <List key={blocks.length} className={ordered ? "list-decimal space-y-1 pl-5" : "list-disc space-y-1 pl-5"}>
          {items.map((it, k) => (
            <li key={k}>{inline(it)}</li>
          ))}
        </List>,
      );
    } else if (/^#{1,6}\s/.test(line)) {
      blocks.push(
        <p key={blocks.length} className="font-semibold text-ink">
          {inline(line.replace(/^#+\s/, ""))}
        </p>,
      );
      i++;
    } else {
      const para: string[] = [];
      while (i < lines.length && lines[i].trim() && !/^\s*([-*•]|\d+[.)]|#{1,6})\s/.test(lines[i])) para.push(lines[i++]);
      blocks.push(<p key={blocks.length}>{inline(para.join(" "))}</p>);
    }
  }
  return <div className="space-y-2">{blocks}</div>;
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
