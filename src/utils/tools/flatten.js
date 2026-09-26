/**
 * Nested JSON ↔ one level of dotted keys.
 *
 * Flattening is how JSON gets into a spreadsheet, a form post, an
 * environment file or a column of a database, and unflattening is how it
 * gets back. The two have to be exact inverses or the trip is lossy, which
 * is why empty objects and arrays are written out as themselves rather than
 * silently dropped — every other implementation loses them, and they come
 * back as a missing field three systems later.
 *
 * The one thing that cannot be made safe is a key with the separator inside
 * it: `{"a.b": 1}` and `{"a": {"b": 1}}` flatten to the same thing. Rather
 * than pick a winner, those are reported so the separator can be changed.
 */

export const ARRAY_STYLES = [
  { id: "brackets", label: "a.b[0]", hint: "Indices in brackets. Reads well, and is what JSONPath uses." },
  { id: "dots", label: "a.b.0", hint: "Indices as plain keys. What most form encoders and .env files expect." },
];

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isEmpty = (value) =>
  (Array.isArray(value) && value.length === 0) || (isObject(value) && Object.keys(value).length === 0);

/**
 * One level of keys.
 *
 * Returns `{ entries, collisions }`. Entries keep the order of the document,
 * so a flattened file reads in the same order as the one it came from.
 */
export const flattenJson = (value, { delimiter = ".", arrays = "brackets" } = {}) => {
  const entries = [];
  const collisions = [];
  const seen = new Set();

  const add = (key, leaf) => {
    if (seen.has(key)) collisions.push(key);
    seen.add(key);
    entries.push({ key, value: leaf });
  };

  const walk = (current, prefix) => {
    if (isEmpty(current)) {
      // An empty container is a fact about the document, not an absence.
      add(prefix, current);
      return;
    }
    if (Array.isArray(current)) {
      current.forEach((item, index) => {
        walk(item, prefix === "" ? String(index) : arrays === "dots" ? `${prefix}${delimiter}${index}` : `${prefix}[${index}]`);
      });
      return;
    }
    if (isObject(current)) {
      Object.keys(current).forEach((key) => {
        if (key.includes(delimiter)) collisions.push(prefix === "" ? key : `${prefix}${delimiter}${key}`);
        walk(current[key], prefix === "" ? key : `${prefix}${delimiter}${key}`);
      });
      return;
    }
    add(prefix, current);
  };

  walk(value, "");
  return { entries, collisions: [...new Set(collisions)] };
};

/** Split a flattened key back into the steps that made it. */
export const splitKey = (key, { delimiter = ".", arrays = "brackets" } = {}) => {
  const steps = [];
  String(key)
    .split(delimiter)
    .forEach((part) => {
      if (arrays === "brackets") {
        const [head, ...indices] = part.split("[");
        if (head !== "") steps.push({ name: head, index: false });
        indices.forEach((chunk) => steps.push({ name: Number(chunk.replace("]", "")), index: true }));
        return;
      }
      // Without brackets, a number can only be read as a position — which is
      // the ambiguity that comes with choosing that style.
      steps.push(/^\d+$/.test(part) ? { name: Number(part), index: true } : { name: part, index: false });
    });
  return steps;
};

/**
 * Back to a nested document.
 *
 * Returns `{ value, problems }`. A problem is a key that contradicts another
 * — asking for `a.b` when `a` has already been set to a number — and the
 * later key wins, because that is what every merge does.
 */
export const unflattenJson = (flat, { delimiter = ".", arrays = "brackets" } = {}) => {
  const problems = [];
  const pairs = Array.isArray(flat) ? flat : Object.entries(flat || {}).map(([key, value]) => ({ key, value }));
  if (!pairs.length) return { value: {}, problems };

  let root = null;

  pairs.forEach(({ key, value }) => {
    const steps = splitKey(key, { delimiter, arrays });
    if (!steps.length) return;
    if (root === null) root = steps[0].index ? [] : {};

    let current = root;
    for (let i = 0; i < steps.length - 1; i += 1) {
      const step = steps[i];
      const next = steps[i + 1];
      const want = next.index ? [] : {};
      const held = current[step.name];
      if (held === undefined || held === null || typeof held !== "object") {
        if (held !== undefined) problems.push(key);
        current[step.name] = want;
      }
      current = current[step.name];
    }
    const last = steps[steps.length - 1];
    if (current[last.name] !== undefined) problems.push(key);
    current[last.name] = value;
  });

  // Arrays built by index can be left with holes; they read better as nulls.
  const fill = (node) => {
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i += 1) {
        if (node[i] === undefined) node[i] = null;
        else fill(node[i]);
      }
      return;
    }
    if (isObject(node)) Object.values(node).forEach(fill);
  };
  fill(root);

  return { value: root ?? {}, problems: [...new Set(problems)] };
};

/** One cell, quoted only when it has to be. */
const cell = (value) => {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/**
 * A list of records as CSV.
 *
 * Each record is flattened, and the columns are every key any record had, in
 * the order they were first seen — so a field only some records carry still
 * gets a column instead of shifting everything after it.
 */
export const toCsv = (value, options = {}) => {
  const rows = Array.isArray(value) ? value : [value];
  const flattened = rows.map((row) => {
    const { entries } = flattenJson(row, options);
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

  const lines = [columns.map(cell).join(",")];
  flattened.forEach((row) => {
    lines.push(columns.map((column) => cell(row.get(column))).join(","));
  });
  return lines.join("\n");
};

/** Flattened entries as `key=value` lines, the shape a .env file wants. */
export const toEnvLines = (entries, { upper = true } = {}) =>
  entries
    .map(({ key, value }) => {
      const name = (upper ? key.toUpperCase() : key).replace(/[^A-Za-z0-9_]/g, "_");
      const text = typeof value === "object" && value !== null ? JSON.stringify(value) : String(value ?? "");
      return `${name}=${/[\s"'#]/.test(text) ? JSON.stringify(text) : text}`;
    })
    .join("\n");
