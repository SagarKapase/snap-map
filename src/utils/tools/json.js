/**
 * Reading JSON the way a person needs it read.
 *
 * `JSON.parse` answers two questions — did it work, and what is the value —
 * and neither is the one somebody has when they paste a broken file. They
 * want to know *where* it broke and *what* to change. So this reads the text
 * itself and keeps three things the built-in parser throws away:
 *
 *  – **Where.** Every error and every note carries a line and a column, so
 *    the page can point at the character rather than say "unexpected token".
 *  – **The original text of every scalar.** `12345678901234567890` is not a
 *    number JavaScript can hold, and a formatter that silently returns
 *    `12345678901234568000` has corrupted the document it was asked to tidy.
 *    Scalars are re-emitted exactly as they were written whenever they were
 *    written validly.
 *  – **Duplicate keys.** `{"id": 1, "id": 2}` is accepted by every parser
 *    and quietly loses the first value. It is worth saying out loud.
 *
 * In tolerant mode it also accepts what people actually paste — comments,
 * trailing commas, single quotes, unquoted keys, `NaN` — and reports each
 * one as a repair rather than a failure, so the page can say what it fixed.
 */

/** How deep a document may nest before we stop, rather than overflow the stack. */
const MAX_DEPTH = 512;

const IDENT_START = /[A-Za-z_$]/;
const IDENT_PART = /[A-Za-z0-9_$]/;

/** Offsets to line and column, without rescanning the text for every lookup. */
const lineIndex = (text) => {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) if (text[i] === "\n") starts.push(i + 1);
  return starts;
};

const placeOf = (starts, offset) => {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (starts[mid] <= offset) low = mid;
    else high = mid - 1;
  }
  return { line: low + 1, column: offset - starts[low] + 1, offset };
};

/** Thrown internally to unwind to the top; never escapes this module. */
class JsonStop extends Error {}

/**
 * Read JSON text.
 *
 * Returns `{ ok, ast, value, errors, repairs, duplicates, stats }`. `ok` is
 * false only when the text could not be read at all — repairs and duplicate
 * keys are notes, not failures.
 */
export const parseJson = (input, { tolerant = true } = {}) => {
  // A byte-order mark is invisible and breaks JSON.parse; drop it silently.
  const text = String(input ?? "").replace(/^\uFEFF/, "");
  const starts = lineIndex(text);
  const errors = [];
  const repairs = [];
  const duplicates = [];
  const counts = { objects: 0, arrays: 0, strings: 0, numbers: 0, booleans: 0, nulls: 0 };

  let i = 0;
  let depth = 0;

  const at = (offset) => placeOf(starts, Math.min(offset, text.length));

  const fail = (message, offset = i) => {
    errors.push({ ...at(offset), message });
    throw new JsonStop();
  };

  /** A deviation from JSON: forgiven and noted, or fatal, depending on the mode. */
  const deviate = (kind, message, offset = i) => {
    if (!tolerant) fail(message, offset);
    repairs.push({ ...at(offset), kind, message });
  };

  const skipSpace = () => {
    for (;;) {
      while (i < text.length && (text[i] === " " || text[i] === "\t" || text[i] === "\n" || text[i] === "\r")) i += 1;
      if (text[i] !== "/") return;
      const start = i;
      if (text[i + 1] === "/") {
        deviate("comment", "A line comment — JSON has no comments.", start);
        while (i < text.length && text[i] !== "\n") i += 1;
      } else if (text[i + 1] === "*") {
        deviate("comment", "A block comment — JSON has no comments.", start);
        const end = text.indexOf("*/", i + 2);
        if (end === -1) fail("This comment is never closed.", start);
        i = end + 2;
      } else {
        return;
      }
    }
  };

  const expect = (char, what) => {
    if (text[i] !== char) fail(`Expected ${what} here.`);
    i += 1;
  };

  // ── Strings ──

  const readEscape = () => {
    const c = text[i];
    i += 1;
    switch (c) {
      case '"': return '"';
      case "'": return "'";
      case "\\": return "\\";
      case "/": return "/";
      case "b": return "\b";
      case "f": return "\f";
      case "n": return "\n";
      case "r": return "\r";
      case "t": return "\t";
      case "u": {
        const hex = text.slice(i, i + 4);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail("A \\u escape needs four hexadecimal digits.", i - 2);
        i += 4;
        return String.fromCharCode(parseInt(hex, 16));
      }
      default:
        fail(`\\${c} is not an escape JSON knows.`, i - 2);
        return "";
    }
  };

  const readString = () => {
    const start = i;
    const quote = text[i];
    if (quote === "'") deviate("single-quote", "A single-quoted string — JSON strings use double quotes.", start);
    i += 1;
    let value = "";
    // Noted as we go: a string holding a raw control character cannot be
    // handed back as written, because as written it is not valid JSON.
    let verbatim = quote === '"';
    for (;;) {
      if (i >= text.length) fail("This string is never closed.", start);
      const c = text[i];
      if (c === quote) {
        i += 1;
        // Re-emitted as written when it was written validly, so escapes a
        // person chose on purpose survive being formatted.
        const out = verbatim ? text.slice(start, i) : JSON.stringify(value);
        return { kind: "string", value, out, start };
      }
      if (c === "\\") {
        i += 1;
        value += readEscape();
        continue;
      }
      if (c === "\n") fail("This string is never closed.", start);
      if (c < " ") {
        deviate("control-character", "A raw control character inside a string.", i);
        verbatim = false;
      }
      value += c;
      i += 1;
    }
  };

  // ── Numbers ──

  const STRICT_NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/;
  const LOOSE_NUMBER = /^[+-]?(?:0[xX][0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/;

  const readNumber = () => {
    const start = i;
    const rest = text.slice(i);

    for (const [word, value] of [["NaN", NaN], ["Infinity", Infinity], ["-Infinity", -Infinity]]) {
      if (rest.startsWith(word)) {
        deviate("not-a-number", `${word} is not a value JSON can hold; it becomes null.`, start);
        i += word.length;
        return { kind: "number", value, out: "null", start };
      }
    }

    // Both are tried and the longer wins: 0x1F and 01 both begin with a
    // perfectly valid "0", so matching strictly first would read the zero
    // and then complain about the rest of the number.
    const strictText = (STRICT_NUMBER.exec(rest) || [""])[0];
    const looseText = (LOOSE_NUMBER.exec(rest) || [""])[0];
    const raw = looseText.length > strictText.length ? looseText : strictText;
    if (!raw) fail("This is not a value JSON knows.", start);
    i += raw.length;

    if (raw === strictText) {
      // The literal is kept, so a number too large for a double survives.
      return { kind: "number", value: Number(raw), out: raw, start };
    }
    deviate("number-format", `${raw} is not how JSON writes a number.`, start);
    const value = Number(raw);
    if (!Number.isFinite(value)) fail("This number cannot be read.", start);
    return { kind: "number", value, out: String(value), start };
  };

  // ── Containers ──

  const readKey = () => {
    if (text[i] === '"' || text[i] === "'") return readString();
    if (IDENT_START.test(text[i] || "")) {
      const start = i;
      while (i < text.length && IDENT_PART.test(text[i])) i += 1;
      const name = text.slice(start, i);
      deviate("unquoted-key", `The key ${name} is not quoted.`, start);
      return { kind: "string", value: name, out: JSON.stringify(name), start };
    }
    return fail("Expected a key in double quotes here.");
  };

  const readObject = (path) => {
    const start = i;
    counts.objects += 1;
    i += 1;
    const members = [];
    const seen = new Map();
    skipSpace();
    if (text[i] === "}") {
      i += 1;
      return { kind: "object", members, start };
    }
    for (;;) {
      skipSpace();
      if (text[i] === "}") {
        deviate("trailing-comma", "A comma before the closing brace.", i);
        i += 1;
        return { kind: "object", members, start };
      }
      const key = readKey();
      if (seen.has(key.value)) {
        duplicates.push({
          ...at(key.start),
          key: key.value,
          path: path ? `${path}.${key.value}` : key.value,
          firstLine: seen.get(key.value),
        });
      } else {
        seen.set(key.value, at(key.start).line);
      }
      skipSpace();
      expect(":", "a colon after the key");
      skipSpace();
      const value = readValue(path ? `${path}.${key.value}` : key.value);
      members.push({ key, value });
      skipSpace();
      if (text[i] === ",") {
        i += 1;
        continue;
      }
      if (text[i] === "}") {
        i += 1;
        return { kind: "object", members, start };
      }
      if (i >= text.length) fail("This object is never closed.", start);
      fail("Expected a comma or a closing brace here.");
    }
  };

  const readArray = (path) => {
    const start = i;
    counts.arrays += 1;
    i += 1;
    const items = [];
    skipSpace();
    if (text[i] === "]") {
      i += 1;
      return { kind: "array", items, start };
    }
    for (;;) {
      skipSpace();
      if (text[i] === "]") {
        deviate("trailing-comma", "A comma before the closing bracket.", i);
        i += 1;
        return { kind: "array", items, start };
      }
      items.push(readValue(`${path}[${items.length}]`));
      skipSpace();
      if (text[i] === ",") {
        i += 1;
        continue;
      }
      if (text[i] === "]") {
        i += 1;
        return { kind: "array", items, start };
      }
      if (i >= text.length) fail("This array is never closed.", start);
      fail("Expected a comma or a closing bracket here.");
    }
  };

  function readValue(path = "") {
    skipSpace();
    if (i >= text.length) fail("The document ends before its value.");
    depth += 1;
    if (depth > MAX_DEPTH) fail(`This nests more than ${MAX_DEPTH} levels deep.`);
    try {
      const c = text[i];
      if (c === "{") return readObject(path);
      if (c === "[") return readArray(path);
      if (c === '"' || c === "'") {
        counts.strings += 1;
        return readString();
      }
      if (text.startsWith("true", i)) {
        counts.booleans += 1;
        i += 4;
        return { kind: "boolean", value: true, out: "true", start: i - 4 };
      }
      if (text.startsWith("false", i)) {
        counts.booleans += 1;
        i += 5;
        return { kind: "boolean", value: false, out: "false", start: i - 5 };
      }
      if (text.startsWith("null", i)) {
        counts.nulls += 1;
        i += 4;
        return { kind: "null", value: null, out: "null", start: i - 4 };
      }
      counts.numbers += 1;
      return readNumber();
    } finally {
      depth -= 1;
    }
  }

  const empty = { ok: false, ast: null, value: undefined, errors, repairs, duplicates, stats: null };

  if (!text.trim()) {
    errors.push({ line: 1, column: 1, offset: 0, message: "There is nothing to read." });
    return empty;
  }

  let ast = null;
  try {
    ast = readValue();
    skipSpace();
    if (i < text.length) fail("There is more here after the value ends.");
  } catch (e) {
    if (!(e instanceof JsonStop)) throw e;
    return empty;
  }

  return {
    ok: true,
    ast,
    value: toValue(ast),
    errors,
    repairs,
    duplicates,
    stats: { ...counts, bytes: new TextEncoder().encode(text).length, lines: starts.length },
  };
};

/** The plain JavaScript value, for the tools that want one. */
export const toValue = (node) => {
  if (!node) return undefined;
  if (node.kind === "object") {
    const out = {};
    // Last one wins, which is what every JSON parser does with a duplicate.
    node.members.forEach((m) => {
      out[m.key.value] = toValue(m.value);
    });
    return out;
  }
  if (node.kind === "array") return node.items.map(toValue);
  return node.value;
};

const compareKeys = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Write the document back out.
 *
 * `indent` is a number of spaces, or "\t" for tabs, or 0 to put it all on one
 * line. Scalars go back exactly as they arrived wherever they were written
 * validly, so nothing is rounded, re-escaped or reordered by accident.
 */
export const formatJson = (node, { indent = 2, sortKeys = false } = {}) => {
  const pad = typeof indent === "string" ? indent : " ".repeat(Math.max(0, indent));
  const dense = pad === "";
  const gap = dense ? "" : " ";
  const newline = dense ? "" : "\n";

  const write = (current, level) => {
    const here = dense ? "" : pad.repeat(level);
    const inner = dense ? "" : pad.repeat(level + 1);

    if (current.kind === "object") {
      if (!current.members.length) return "{}";
      const members = sortKeys
        ? [...current.members].sort((a, b) => compareKeys(a.key.value, b.key.value))
        : current.members;
      const body = members
        .map((m) => `${inner}${m.key.out}:${gap}${write(m.value, level + 1)}`)
        .join(`,${newline}`);
      return `{${newline}${body}${newline}${here}}`;
    }

    if (current.kind === "array") {
      if (!current.items.length) return "[]";
      const body = current.items.map((item) => `${inner}${write(item, level + 1)}`).join(`,${newline}`);
      return `[${newline}${body}${newline}${here}]`;
    }

    return current.out;
  };

  return node ? write(node, 0) : "";
};

/** The same document with every space removed. */
export const minifyJson = (node) => formatJson(node, { indent: 0 });

/** A one-line summary of what was read, for the page to show. */
export const describeStats = (stats) => {
  if (!stats) return "";
  const parts = [];
  if (stats.objects) parts.push(`${stats.objects} object${stats.objects === 1 ? "" : "s"}`);
  if (stats.arrays) parts.push(`${stats.arrays} array${stats.arrays === 1 ? "" : "s"}`);
  const scalars = stats.strings + stats.numbers + stats.booleans + stats.nulls;
  if (scalars) parts.push(`${scalars} value${scalars === 1 ? "" : "s"}`);
  return parts.join(" · ");
};

/** Bytes as something a person reads. */
export const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};
