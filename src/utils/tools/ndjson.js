/**
 * JSON Lines: one document per line.
 *
 * It is what logs, exports and streaming APIs are written in, and the reason
 * it needs its own reader is that it fails one line at a time. A whole file
 * is not valid or invalid — line 8,412 is broken and the other fifty
 * thousand are fine, and the only thing worth knowing is which one and why.
 *
 * So every line is read separately, kept with its number, and a bad line
 * stops nothing.
 */
import { parseJson, toValue } from "./json.js";
import { queryJson } from "./jsonPath.js";

/**
 * Read a JSON Lines document.
 *
 * `limit` caps how many lines are parsed, so pasting a very large export
 * does not lock the tab; `stats.truncated` says when that happened.
 */
export const parseNdjson = (text, { limit = 5000, tolerant = true } = {}) => {
  // No byte-order mark to strip here: a mark can only be on the first line,
  // and that line goes through parseJson, which already drops it.
  const source = String(text ?? "");
  const lines = source.split(/\r?\n/);
  const records = [];
  const stats = { lines: 0, ok: 0, bad: 0, blank: 0, bytes: 0, truncated: false };

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    if (!raw.trim()) {
      stats.blank += 1;
      continue;
    }
    stats.lines += 1;
    if (records.length >= limit) {
      stats.truncated = true;
      continue;
    }
    const result = parseJson(raw, { tolerant });
    const record = {
      line: i + 1,
      raw,
      bytes: new TextEncoder().encode(raw).length,
      ok: result.ok,
      value: result.ok ? result.value : undefined,
      ast: result.ok ? result.ast : null,
      error: result.ok ? null : result.errors[0] || null,
      repairs: result.repairs.length,
    };
    stats.bytes += record.bytes;
    if (record.ok) stats.ok += 1;
    else stats.bad += 1;
    records.push(record);
  }

  return { records, stats, keys: commonKeys(records) };
};

/**
 * The top-level fields across the records, and how many have each — the
 * quickest way to see that a field is missing from a tenth of the rows.
 */
export const commonKeys = (records) => {
  const counts = new Map();
  let objects = 0;
  records.forEach((record) => {
    const value = record.value;
    if (!record.ok || value === null || typeof value !== "object" || Array.isArray(value)) return;
    objects += 1;
    Object.keys(value).forEach((key) => counts.set(key, (counts.get(key) || 0) + 1));
  });
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count, share: objects ? count / objects : 0 }))
    .sort((a, b) => b.count - a.count || (a.key < b.key ? -1 : 1));
};

/** A path is run over the file as if it were one array, so this finds the record. */
const ROOT_INDEX = /^\$\[(\d+)\]/;

/**
 * Keep the records a query matches.
 *
 * A plain word filters on the text of the line, which is what people reach
 * for first. Anything beginning with a dollar is run as a JSONPath **over the
 * file as if it were one array**, so a filter means what somebody who has
 * filtered a JSON array expects it to mean, and a record is kept when the
 * query reached into it. That is one pass over the whole file rather than one
 * query per line, which matters at fifty thousand records.
 *
 * A line that could not be read is never matched by a path — there is nothing
 * to match against — so those are found with a plain word instead.
 */
export const filterRecords = (records, query) => {
  const text = String(query || "").trim();
  if (!text) return { records, error: "", mode: "none" };

  if (!text.startsWith("$")) {
    const needle = text.toLowerCase();
    return { records: records.filter((record) => record.raw.toLowerCase().includes(needle)), error: "", mode: "text" };
  }

  const readable = records.filter((record) => record.ok);
  const result = queryJson(readable.map((record) => record.value), text);
  // An unreadable path is reported once rather than once per line.
  if (!result.ok) return { records: [], error: result.error, mode: "path" };

  const hit = new Set();
  let all = false;
  result.matches.forEach((match) => {
    const at = ROOT_INDEX.exec(match.path);
    if (at) hit.add(Number(at[1]));
    else if (match.path === "$") all = true;
  });
  if (all) return { records, error: "", mode: "path" };

  return { records: readable.filter((_, index) => hit.has(index)), error: "", mode: "path" };
};

/** The records as one JSON array, which is what most tools want instead. */
export const toJsonArray = (records, { indent = 2 } = {}) =>
  JSON.stringify(
    records.filter((record) => record.ok).map((record) => record.value),
    null,
    indent,
  );

/** A JSON array back to one document per line. */
export const fromJsonArray = (text) => {
  const result = parseJson(text);
  if (!result.ok) return { text: "", error: result.errors[0]?.message || "That is not JSON." };
  const value = toValue(result.ast);
  if (!Array.isArray(value)) return { text: "", error: "JSON Lines is made from a list, and this is not one." };
  return { text: value.map((item) => JSON.stringify(item)).join("\n"), error: "" };
};

/** A one-line summary of what was read. */
export const describeNdjson = ({ stats }) => {
  if (!stats.lines) return "Nothing to read yet.";
  const parts = [`${stats.lines} record${stats.lines === 1 ? "" : "s"}`];
  if (stats.bad) parts.push(`${stats.bad} could not be read`);
  if (stats.blank) parts.push(`${stats.blank} blank line${stats.blank === 1 ? "" : "s"} skipped`);
  if (stats.truncated) parts.push("stopped early — the rest was not read");
  return parts.join(" · ");
};
