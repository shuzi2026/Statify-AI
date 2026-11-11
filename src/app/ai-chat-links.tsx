import type { ReactNode } from "react";

function safeLink(value: string) {
  try {
    const url = new URL(value);
    if ((url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password)
      return url.href;
  } catch { /* Keep malformed links as text. */ }
}

function bareLink(value: string) {
  let link = value.replace(/[.,!?;:。，、！？；：]+$/, "");
  for (const [open, close] of [["(", ")"], ["[", "]"]]) {
    while (link.endsWith(close) && link.split(close).length > link.split(open).length)
      link = link.slice(0, -1);
  }
  return link;
}

type Link = { text: string; href: string; index: number; length: number; suffix: string };
export function chatLinks(content: string): Link[] {
  const pattern = /\[([^\]\n]+)\]\(((?:[^\s()]|\([^\s()]*\))+)\)|https?:\/\/[^\s<>"'`*。，、！？；：）】]+/gi;
  return Array.from(content.matchAll(pattern)).flatMap((match) => {
    const raw = match[2] ?? bareLink(match[0]);
    const href = safeLink(raw);
    return href ? [{
      text: match[1] ?? raw, href, index: match.index, length: match[0].length,
      suffix: match[2] ? "" : match[0].slice(raw.length),
    }] : [];
  });
}

function bold(text: string, key: number) {
  return text.split(/(\*\*[^*\n]+\*\*)/).map((part, index) =>
    index % 2 ? <strong key={`${key}-${index}`}>{part.slice(2, -2)}</strong> : part);
}

export function ChatLink({ href, children }: { href: string; children: ReactNode }) {
  return <a className="ai-chat-link" href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
}

export function ChatText({ content }: { content: string }) {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const link of chatLinks(content)) {
    nodes.push(...bold(content.slice(cursor, link.index), cursor));
    nodes.push(<ChatLink href={link.href} key={link.index}>{link.text}</ChatLink>, link.suffix);
    cursor = link.index + link.length;
  }
  nodes.push(...bold(content.slice(cursor), cursor));
  return nodes;
}
