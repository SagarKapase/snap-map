/**
 * Is this JSON really a table?
 *
 * Most of what comes back from an API is a list of records wrapped in one
 * envelope — `{"data": [...]}`, `{"results": [...]}`, `{"items": [...]}` —
 * and a list of records is far easier to read as rows than as eight hundred
 * lines of correctly indented text.
 *
 * This finds that list if it is there, and says plainly when it is not,
 * because a table view that quietly shows nothing is worse than one that
 * explains itself.
 */
import { flattenJson } from "./flatten.js";

/** Past this, the table is drawn in part; the rest is counted, not rendered. */
export const MAX_ROWS = 300;

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

/** The list of records inside a document, wherever it is. */
export const findRecords = (value) => {
  if (Array.isArray(value)) {
    return value.every(isRecord) && value.length > 0
      ? { rows: value, at: "$", reason: "" }
      : { rows: null, at: "", reason: value.length === 0 ? "The list is empty." : "This is a list, but not of records." };
  }

  if (!isRecord(value)) {
    return { rows: null, at: "", reason: "A table needs a list of records, and this is a single value." };
  }

  // One envelope deep: the usual shape of a paged response.
  const lists = Object.entries(value).filter(
    ([, inner]) => Array.isArray(inner) && inner.length > 0 && inner.every(isRecord),
  );
  if (lists.length === 1) return { rows: lists[0][1], at: `$.${lists[0][0]}`, reason: "" };
  if (lists.length > 1) {
    return {
      rows: lists[0][1],
      at: `$.${lists[0][0]}`,
      reason: `More than one list of records here; showing ${lists[0][0]}.`,
    };
  }

  return { rows: null, at: "", reason: "No list of records in this document — the tree view may suit it better." };
};

/**
 * Records as columns and rows.
 *
 * Every field any record has becomes a column, in the order the fields were
 * first seen, so a field only some records carry still gets one instead of
 * shifting everything after it. Nested values are flattened, which is what
 * makes a table of them possible at all.
 */
export const toTable = (rows) => {
  const flattened = rows.slice(0, MAX_ROWS).map((row) => {
    const { entries } = flattenJson(row);
    return new Map(entries.map((entry) => [entry.key, entry.value]));
  });

  const columns = [];
  const seen = new Set();
  flattened.forEach((row) => {
    row.forEach((_, key) => {
      if (seen.has(key)) return;
      seen.add(key);
      columns.push(key);
    });
  });

  return {
    columns,
    rows: flattened.map((row) => columns.map((column) => (row.has(column) ? row.get(column) : undefined))),
    total: rows.length,
    truncated: rows.length > MAX_ROWS,
  };
};

/** A cell as the short piece of text a table can hold. */
export const cellText = (value) => {
  if (value === undefined) return "";
  if (value === null) return "null";
  if (typeof value === "object") return Array.isArray(value) ? "[]" : "{}";
  return String(value);
};

/** What sort of thing a cell holds, so the table can colour it like the code view. */
export const cellKind = (value) => {
  if (value === undefined) return "missing";
  if (value === null) return "null";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "object") return "empty";
  return "string";
};
