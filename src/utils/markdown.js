/**
 * Markdown for the blog: a small, dependency-free parser that turns a post
 * into tokens, plus an HTML renderer for the build.
 *
 * Two renderers read the same tokens: `Prose` draws them as React elements
 * in the app, and `renderHtml` here writes the static HTML the build puts
 * in each post's page so a crawler sees the article without running any
 * JavaScript. One parser, so the two can never drift.
 *
 * Nothing is ever passed through as raw HTML — every piece of text is
 * escaped — so a post cannot inject markup into the page.
 */

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (text) => String(text ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]);

/** "A Heading, with punctuation" → "a-heading-with-punctuation" */
export const slugify = (text) =>
  String(text ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);

/**
 * A link a page may follow: the web, mail, this site, or a heading on the
 * page. A post is written by the people who run the site, but a scheme
 * like `javascript:` has no business in prose, so anything else keeps its
 * words and loses its link.
 */
export const safeHref = (href) => {
  const value = String(href ?? "").trim();
  if (!value) return "";
  if (/^(https?:|mailto:)/i.test(value)) return value;
  if (/^[#/]/.test(value)) return value;
  return /^[a-z][a-z0-9+.-]*:/i.test(value) ? "" : value;
};

// ─── Inline ──────────────────────────────────

const INLINE = /(!\[([^\]\n]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\))|(\[([^\]\n]+)\]\(([^)\s]+)\))|(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(_[^_\n]+_)/g;

/**
 * Inline markdown → nodes: `{ type: "text" | "code" | "strong" | "em" |
 * "link" | "image", … }`. Anything unrecognised stays text.
 */
export const parseInline = (source) => {
  const text = String(source ?? "");
  const nodes = [];
  let last = 0;
  let match;
  INLINE.lastIndex = 0;
  while ((match = INLINE.exec(text))) {
    if (match.index > last) nodes.push({ type: "text", value: text.slice(last, match.index) });
    if (match[1]) {
      const src = safeHref(match[3]);
      nodes.push(src ? { type: "image", alt: match[2] || "", src, title: match[4] || "" } : { type: "text", value: match[2] || "" });
    }
    else if (match[5]) {
      const href = safeHref(match[7]);
      // A link the page would refuse to follow is left as the words it wrapped.
      nodes.push(href ? { type: "link", value: match[6], href } : { type: "text", value: match[6] });
    }
    else if (match[8]) nodes.push({ type: "code", value: match[8].slice(1, -1) });
    else if (match[9]) nodes.push({ type: "strong", value: match[9].slice(2, -2) });
    else if (match[10]) nodes.push({ type: "em", value: match[10].slice(1, -1) });
    else if (match[11]) nodes.push({ type: "em", value: match[11].slice(1, -1) });
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push({ type: "text", value: text.slice(last) });
  return nodes;
};

// ─── Blocks ──────────────────────────────────

const HEADING = /^(#{1,4})\s+(.*)$/;
const UL_ITEM = /^[-*+]\s+(.*)$/;
const OL_ITEM = /^(\d+)[.)]\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const RULE = /^(-{3,}|\*{3,}|_{3,})$/;
const TABLE_DIVIDER = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/;

const cells = (line) =>
  line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((cell) => cell.trim());

/**
 * A post body → blocks: `{ type: "heading" | "paragraph" | "list" | "code"
 * | "quote" | "rule" | "table", … }`. Headings carry an `id` so a reader
 * can link to a section.
 */
export const parseMarkdown = (source) => {
  const lines = String(source ?? "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let i = 0;

  const paragraph = (buffer) => {
    const text = buffer.join(" ").trim();
    if (text) blocks.push({ type: "paragraph", inline: parseInline(text) });
  };

  let buffer = [];
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      paragraph(buffer);
      buffer = [];
      i += 1;
      continue;
    }

    // Fenced code — taken verbatim, including blank lines.
    if (trimmed.startsWith("```")) {
      paragraph(buffer);
      buffer = [];
      const language = trimmed.slice(3).trim();
      const code = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1; // closing fence
      blocks.push({ type: "code", language, value: code.join("\n") });
      continue;
    }

    const heading = trimmed.match(HEADING);
    if (heading) {
      paragraph(buffer);
      buffer = [];
      const text = heading[2].trim();
      blocks.push({ type: "heading", level: heading[1].length, text, id: slugify(text), inline: parseInline(text) });
      i += 1;
      continue;
    }

    if (RULE.test(trimmed)) {
      paragraph(buffer);
      buffer = [];
      blocks.push({ type: "rule" });
      i += 1;
      continue;
    }

    // Table: a header row followed by a divider row.
    if (trimmed.includes("|") && i + 1 < lines.length && TABLE_DIVIDER.test(lines[i + 1].trim())) {
      paragraph(buffer);
      buffer = [];
      const header = cells(trimmed).map((cell) => parseInline(cell));
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        rows.push(cells(lines[i].trim()).map((cell) => parseInline(cell)));
        i += 1;
      }
      blocks.push({ type: "table", header, rows });
      continue;
    }

    if (QUOTE.test(trimmed)) {
      paragraph(buffer);
      buffer = [];
      const quoted = [];
      while (i < lines.length && QUOTE.test(lines[i].trim())) {
        quoted.push(lines[i].trim().match(QUOTE)[1]);
        i += 1;
      }
      blocks.push({ type: "quote", inline: parseInline(quoted.join(" ").trim()) });
      continue;
    }

    if (UL_ITEM.test(trimmed) || OL_ITEM.test(trimmed)) {
      paragraph(buffer);
      buffer = [];
      const ordered = OL_ITEM.test(trimmed);
      const items = [];
      while (i < lines.length) {
        const current = lines[i].trim();
        const match = ordered ? current.match(OL_ITEM) : current.match(UL_ITEM);
        if (!match) break;
        const text = [ordered ? match[2] : match[1]];
        i += 1;
        // A wrapped line belongs to the item above it.
        while (i < lines.length && lines[i].trim() && !UL_ITEM.test(lines[i].trim()) && !OL_ITEM.test(lines[i].trim()) && !HEADING.test(lines[i].trim()) && !lines[i].trim().startsWith("```")) {
          text.push(lines[i].trim());
          i += 1;
        }
        items.push(parseInline(text.join(" ")));
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    buffer.push(trimmed);
    i += 1;
  }
  paragraph(buffer);
  return blocks;
};

// ─── HTML (the build's renderer) ─────────────

const inlineHtml = (nodes) =>
  nodes
    .map((node) => {
      switch (node.type) {
        case "code":
          return `<code>${escapeHtml(node.value)}</code>`;
        case "strong":
          return `<strong>${escapeHtml(node.value)}</strong>`;
        case "em":
          return `<em>${escapeHtml(node.value)}</em>`;
        case "link": {
          const external = /^https?:\/\//.test(node.href);
          return `<a href="${escapeHtml(node.href)}"${external ? ' target="_blank" rel="noreferrer noopener"' : ""}>${escapeHtml(node.value)}</a>`;
        }
        case "image":
          return `<img src="${escapeHtml(node.src)}" alt="${escapeHtml(node.alt)}"${node.title ? ` title="${escapeHtml(node.title)}"` : ""} loading="lazy" />`;
        default:
          return escapeHtml(node.value);
      }
    })
    .join("");

/** Blocks → HTML, for the static page the build writes for each post. */
export const renderHtml = (blocks) =>
  blocks
    .map((block) => {
      switch (block.type) {
        case "heading":
          return `<h${block.level} id="${escapeHtml(block.id)}">${inlineHtml(block.inline)}</h${block.level}>`;
        case "code":
          return `<pre><code${block.language ? ` class="language-${escapeHtml(block.language)}"` : ""}>${escapeHtml(block.value)}</code></pre>`;
        case "list": {
          const tag = block.ordered ? "ol" : "ul";
          return `<${tag}>${block.items.map((item) => `<li>${inlineHtml(item)}</li>`).join("")}</${tag}>`;
        }
        case "quote":
          return `<blockquote>${inlineHtml(block.inline)}</blockquote>`;
        case "rule":
          return "<hr />";
        case "table":
          return `<table><thead><tr>${block.header.map((cell) => `<th>${inlineHtml(cell)}</th>`).join("")}</tr></thead><tbody>${block.rows
            .map((row) => `<tr>${row.map((cell) => `<td>${inlineHtml(cell)}</td>`).join("")}</tr>`)
            .join("")}</tbody></table>`;
        default:
          return `<p>${inlineHtml(block.inline)}</p>`;
      }
    })
    .join("\n");

/** Plain text, for an excerpt or a meta description. */
export const toPlainText = (blocks) =>
  blocks
    .filter((block) => block.type === "paragraph")
    .map((block) => block.inline.map((node) => (node.type === "image" ? "" : node.value)).join(""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
