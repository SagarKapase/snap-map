import { useMemo } from "react";
import MethodBadge from "../workspace/MethodBadge";
import { displayPath } from "../../utils/format";

/**
 * The subset of markdown the assistant is told to use, rendered without a
 * dependency and without innerHTML: fenced code, headings up to ###, bullet
 * and numbered lists, paragraphs; inline code, bold, links, and the
 * `[[node-12]]` references that become endpoint chips.
 */

// Chips: [[node-12]] for endpoints, [[svc_ab12]] for services on a Contract Graph.
const INLINE = /(\[\[((?:node-|svc_)[\w-]+)\]\])|(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\))/g;

/** A clickable method + path chip for an endpoint the model referred to. */
export const EndpointChip = ({ node, onSelect, label }) => {
  if (!node) {
    return (
      <span className="vz-mono rounded border border-vz-line bg-vz-panel-2 px-1.5 py-px text-[11px] text-vz-dim">
        {label}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onSelect?.(node)}
      title={node.path}
      className="vz-t inline-flex max-w-full items-center gap-1 rounded-md border border-vz-line bg-vz-panel-2 px-1.5 py-px align-middle text-[11.5px] text-vz-text hover:border-vz-accent/60 hover:bg-vz-accent/10"
    >
      <MethodBadge method={node.method} size="xs" />
      <span className="vz-mono truncate">{displayPath(node)}</span>
    </button>
  );
};

const renderInline = (text, ctx, keyBase) => {
  const out = [];
  let last = 0;
  let match;
  INLINE.lastIndex = 0;
  while ((match = INLINE.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const key = `${keyBase}-${match.index}`;
    if (match[1]) {
      const custom = ctx.chipFor?.(match[2], key);
      if (custom) out.push(custom);
      else {
        const node = ctx.nodeById?.get(match[2]);
        out.push(<EndpointChip key={key} node={node} label={match[2]} onSelect={ctx.onSelectNode} />);
      }
    } else if (match[3]) {
      out.push(
        <code key={key} className="vz-mono rounded bg-white/8 px-1 py-px text-[11.5px] text-[#fca5a5]">
          {match[3].slice(1, -1)}
        </code>,
      );
    } else if (match[4]) {
      out.push(<strong key={key} className="font-semibold text-vz-text">{match[4].slice(2, -2)}</strong>);
    } else if (match[5]) {
      out.push(
        <a key={key} href={match[7]} target="_blank" rel="noreferrer noopener" className="text-vz-accent-2 underline decoration-vz-accent/40 hover:decoration-vz-accent-2">
          {match[6]}
        </a>,
      );
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
};

const parseBlocks = (source) => {
  const lines = String(source || "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      const lang = line.trim().slice(3).trim();
      const code = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++]);
      i++;
      blocks.push({ type: "code", lang, text: code.join("\n") });
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2] });
      i++;
      continue;
    }
    if (/^\s*([-*•]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) {
        let item = lines[i].replace(/^\s*([-*•]|\d+[.)])\s+/, "");
        i++;
        // Continuation lines indented under the bullet.
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) {
          item += ` ${lines[i].trim()}`;
          i++;
        }
        items.push(item);
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const para = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !/^\s*```/.test(lines[i]) && !/^#{1,3}\s/.test(lines[i]) && !/^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) {
      para.push(lines[i++]);
    }
    blocks.push({ type: "para", text: para.join(" ") });
  }
  return blocks;
};

/** `chipFor(id, key)` may return a custom chip element for an id; otherwise ids resolve to endpoints in `nodes`. */
const Markdown = ({ text, nodes = [], onSelectNode, chipFor, className = "" }) => {
  const ctx = useMemo(
    () => ({ nodeById: new Map(nodes.map((n) => [n.id, n])), onSelectNode, chipFor }),
    [nodes, onSelectNode, chipFor],
  );
  const blocks = useMemo(() => parseBlocks(text), [text]);

  return (
    <div className={`space-y-2.5 text-[13px] leading-[1.65] text-vz-soft ${className}`}>
      {blocks.map((block, idx) => {
        const key = `b${idx}`;
        if (block.type === "code") {
          return (
            <pre key={key} className="vz-mono vz-scroll overflow-x-auto rounded-lg border border-vz-line-soft bg-vz-bg px-3 py-2.5 text-[11.5px] leading-[1.6] text-vz-soft">
              {block.text}
            </pre>
          );
        }
        if (block.type === "heading") {
          const cls = block.level === 1 ? "text-[14px]" : block.level === 2 ? "text-[13.5px]" : "text-[13px]";
          return (
            <p key={key} className={`${cls} pt-1 font-semibold text-vz-text`}>
              {renderInline(block.text, ctx, key)}
            </p>
          );
        }
        if (block.type === "list") {
          const Tag = block.ordered ? "ol" : "ul";
          return (
            <Tag key={key} className={`space-y-1 pl-4 ${block.ordered ? "list-decimal" : "list-disc"} marker:text-vz-dim`}>
              {block.items.map((item, j) => (
                <li key={`${key}-${j}`}>{renderInline(item, ctx, `${key}-${j}`)}</li>
              ))}
            </Tag>
          );
        }
        return <p key={key}>{renderInline(block.text, ctx, key)}</p>;
      })}
    </div>
  );
};

export default Markdown;
