/**
 * Reading one post: front matter, blocks, reading time.
 *
 * Nothing here knows where the files come from, so the app can hand it text
 * from `import.meta.glob` and `scripts/seo.mjs` can hand it text from disk
 * — the page and the static HTML the build writes are then parsed by the
 * very same code.
 */
import { parseMarkdown, toPlainText } from "./markdown.js";

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** `key: value` lines; `a, b` becomes a list for tags. */
export const parseFrontMatter = (raw) => {
  const text = String(raw ?? "");
  const match = text.match(FRONT_MATTER);
  if (!match) return { data: {}, body: text };
  const data = {};
  match[1].split(/\r?\n/).forEach((line) => {
    const at = line.indexOf(":");
    if (at < 1) return;
    const key = line.slice(0, at).trim();
    let value = line.slice(at + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key === "tags") data.tags = value.split(",").map((t) => t.trim()).filter(Boolean);
    else if (key === "draft") data.draft = value === "true";
    else data[key] = value;
  });
  return { data, body: text.slice(match[0].length) };
};

const WORDS_PER_MINUTE = 200;

/** A file's text → the post the pages render. `slug` comes from the file name. */
export const parsePost = (raw, slug) => {
  const { data, body } = parseFrontMatter(raw);
  const blocks = parseMarkdown(body);
  const plain = toPlainText(blocks);
  const words = plain ? plain.split(/\s+/).length : 0;
  const heading = blocks.find((b) => b.type === "heading" && b.level === 1);
  return {
    slug,
    title: data.title || heading?.text || slug,
    description: data.description || plain.slice(0, 180).trim(),
    date: data.date || "",
    author: data.author || "",
    image: data.image || "",
    tags: data.tags || [],
    draft: Boolean(data.draft),
    readingMinutes: Math.max(1, Math.round(words / WORDS_PER_MINUTE)),
    words,
    // The H1 is the page's heading, so it is not repeated in the body.
    blocks: heading ? blocks.filter((b) => b !== heading) : blocks,
    headings: blocks.filter((b) => b.type === "heading" && (b.level === 2 || b.level === 3) && b !== heading),
  };
};

/** Newest first; posts with no date sort last, by title. */
export const sortPosts = (posts) =>
  [...posts].sort((a, b) => (b.date || "").localeCompare(a.date || "") || a.title.localeCompare(b.title));

/** "2026-09-23" → "23 September 2026"; an empty date stays empty. */
export const formatDate = (value) => {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
};
