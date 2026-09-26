/**
 * JSONPath, over plain JavaScript values.
 *
 * The point of a JSONPath tester is not to evaluate the expression — it is to
 * show *where* each result came from, because half the time the expression is
 * nearly right and the person needs to see which branch it walked down. So
 * every match is returned with the concrete path that produced it, spelled
 * the way you could paste it back in as a query of its own.
 *
 * What is supported:
 *
 *   $              the document
 *   .key  ['key']  a named child ($['a b'] for a key with a space in it)
 *   [0] [-1]       an element, counted from the end when negative
 *   [*]  .*        every child
 *   ..key          that key at any depth
 *   [1:4] [::2]    a slice, with an optional step
 *   [0,2] ['a','b'] a union of several
 *   [?(@.n > 2)]   the children where a test holds
 *
 * Filters take @ for the current item, paths off it, numbers, strings, true,
 * false and null, the six comparisons, && and ||, and parentheses. A bare
 * path in a filter — [?(@.name)] — tests that it exists and is not null or
 * false, which is what people expect it to mean.
 *
 * There is no jq here, and no JMESPath. Both are separate languages rather
 * than dialects of this one, and pretending otherwise would waste somebody's
 * evening.
 */

/** Thrown for a query that cannot be read; the message is shown to a person. */
export class PathError extends Error {
  constructor(message, at = 0) {
    super(message);
    this.name = "PathError";
    this.at = at;
  }
}

const IDENT = /[A-Za-z_$][A-Za-z0-9_$-]*/y;

// ─── Reading the query ───────────────────────

const tokenize = (query) => {
  const steps = [];
  let i = 0;
  const text = String(query || "").trim();

  if (!text) throw new PathError("Type a path, starting with $.");
  if (text[0] !== "$") throw new PathError("A path starts with $, the whole document.", 0);
  i = 1;

  const readQuoted = () => {
    const quote = text[i];
    i += 1;
    let out = "";
    while (i < text.length && text[i] !== quote) {
      if (text[i] === "\\") i += 1;
      out += text[i];
      i += 1;
    }
    if (text[i] !== quote) throw new PathError("This quote is never closed.", i);
    i += 1;
    return out;
  };

  /** Everything up to the matching close bracket, so a filter can be re-read whole. */
  const readUntilClose = () => {
    const start = i;
    let depth = 1;
    while (i < text.length) {
      const c = text[i];
      if (c === "'" || c === '"') {
        readQuoted();
        continue;
      }
      if (c === "[" || c === "(") depth += 1;
      if (c === ")") depth -= 1;
      if (c === "]") {
        depth -= 1;
        if (depth === 0) return text.slice(start, i);
      }
      i += 1;
    }
    throw new PathError("This bracket is never closed.", start);
  };

  while (i < text.length) {
    const c = text[i];

    if (c === ".") {
      if (text[i + 1] === ".") {
        i += 2;
        // `..*` is every descendant, so the star is part of this step.
        if (text[i] === "*") {
          i += 1;
          steps.push({ kind: "descend", name: null });
          continue;
        }
        // `..[` is every descendant, then whatever the bracket says.
        if (text[i] === "[") {
          steps.push({ kind: "descend", name: null });
          continue;
        }
        IDENT.lastIndex = i;
        const match = IDENT.exec(text);
        if (!match) throw new PathError("Say which key to look for after ..", i);
        i = IDENT.lastIndex;
        steps.push({ kind: "descend", name: match[0] });
        continue;
      }
      i += 1;
      if (text[i] === "*") {
        i += 1;
        steps.push({ kind: "wildcard" });
        continue;
      }
      IDENT.lastIndex = i;
      const match = IDENT.exec(text);
      if (!match) throw new PathError("Say which key comes after the dot.", i);
      i = IDENT.lastIndex;
      steps.push({ kind: "key", name: match[0] });
      continue;
    }

    if (c === "[") {
      i += 1;
      const inner = readUntilClose();
      i += 1; // the ]
      const body = inner.trim();

      if (body === "*") {
        steps.push({ kind: "wildcard" });
        continue;
      }
      if (body.startsWith("?")) {
        const expression = body.replace(/^\?\s*/, "").replace(/^\((.*)\)$/s, "$1");
        steps.push({ kind: "filter", test: parseFilter(expression) });
        continue;
      }
      if (body.includes(":")) {
        const [from, to, step] = body.split(":").map((part) => part.trim());
        steps.push({
          kind: "slice",
          from: from === "" ? null : Number(from),
          to: to === "" ? null : Number(to),
          step: step === undefined || step === "" ? 1 : Number(step),
        });
        continue;
      }
      if (body.includes(",")) {
        const parts = body.split(",").map((part) => part.trim());
        steps.push({
          kind: "union",
          names: parts.map((part) =>
            /^['"]/.test(part) ? part.slice(1, -1) : /^-?\d+$/.test(part) ? Number(part) : part,
          ),
        });
        continue;
      }
      if (/^['"]/.test(body)) {
        steps.push({ kind: "key", name: body.slice(1, -1) });
        continue;
      }
      if (/^-?\d+$/.test(body)) {
        steps.push({ kind: "index", at: Number(body) });
        continue;
      }
      if (!body) throw new PathError("This bracket is empty.", i);
      steps.push({ kind: "key", name: body });
      continue;
    }

    if (c === "*") {
      i += 1;
      steps.push({ kind: "wildcard" });
      continue;
    }

    throw new PathError(`"${c}" cannot go here.`, i);
  }

  return steps;
};

// ─── Filters ─────────────────────────────────

const COMPARE = ["<=", ">=", "==", "!=", "<", ">"];

/** A filter as a tree of tests, evaluated against one item at a time. */
const parseFilter = (source) => {
  const text = String(source || "").trim();
  if (!text) throw new PathError("This filter is empty.");

  /** Split on an operator that is not inside brackets, quotes or parentheses. */
  const splitTop = (input, operator) => {
    const parts = [];
    let depth = 0;
    let quote = "";
    let last = 0;
    for (let i = 0; i < input.length; i += 1) {
      const c = input[i];
      if (quote) {
        if (c === "\\") i += 1;
        else if (c === quote) quote = "";
        continue;
      }
      if (c === "'" || c === '"') {
        quote = c;
        continue;
      }
      if (c === "(" || c === "[") depth += 1;
      if (c === ")" || c === "]") depth -= 1;
      if (depth === 0 && input.startsWith(operator, i)) {
        parts.push(input.slice(last, i));
        i += operator.length - 1;
        last = i + 1;
      }
    }
    parts.push(input.slice(last));
    return parts;
  };

  const build = (input) => {
    const body = input.trim();
    if (!body) throw new PathError("Something is missing from this filter.");

    const ors = splitTop(body, "||");
    if (ors.length > 1) {
      const sides = ors.map(build);
      return (item, root) => sides.some((side) => side(item, root));
    }

    const ands = splitTop(body, "&&");
    if (ands.length > 1) {
      const sides = ands.map(build);
      return (item, root) => sides.every((side) => side(item, root));
    }

    if (body.startsWith("(") && body.endsWith(")")) return build(body.slice(1, -1));

    if (body.startsWith("!")) {
      const inner = build(body.slice(1));
      return (item, root) => !inner(item, root);
    }

    for (const operator of COMPARE) {
      const sides = splitTop(body, operator);
      if (sides.length === 2) {
        const left = term(sides[0]);
        const right = term(sides[1]);
        return (item, root) => compare(operator, left(item, root), right(item, root));
      }
    }

    // A bare path: true when it is there and not null or false.
    const value = term(body);
    return (item, root) => {
      const found = value(item, root);
      return found !== undefined && found !== null && found !== false;
    };
  };

  /** One side of a comparison: a literal, or a path off @ or $. */
  const term = (input) => {
    const body = input.trim();
    if (!body) throw new PathError("Something is missing from this filter.");
    if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(body)) {
      const number = Number(body);
      return () => number;
    }
    if (/^['"]/.test(body)) {
      const string = body.slice(1, -1);
      return () => string;
    }
    if (body === "true") return () => true;
    if (body === "false") return () => false;
    if (body === "null") return () => null;

    if (body === "@") return (item) => item;
    if (body.startsWith("@")) {
      const steps = tokenize(`$${body.slice(1)}`);
      return (item) => first(steps, item);
    }
    if (body.startsWith("$")) {
      const steps = tokenize(body);
      return (item, root) => first(steps, root);
    }
    throw new PathError(`"${body}" is not something a filter can read.`);
  };

  return build(text);
};

const compare = (operator, a, b) => {
  switch (operator) {
    case "==": return a === b || (a === null && b === null);
    case "!=": return a !== b;
    case "<": return a < b;
    case "<=": return a <= b;
    case ">": return a > b;
    case ">=": return a >= b;
    default: return false;
  }
};

// ─── Walking the document ────────────────────

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

/** A key as it would be written in a path: .name, or ['odd key'] when it must be. */
const keyStep = (key) => (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? `.${key}` : `['${String(key).replace(/'/g, "\\'")}']`);

const childrenOf = (value, path) => {
  if (Array.isArray(value)) return value.map((item, index) => ({ value: item, path: `${path}[${index}]` }));
  if (isObject(value)) return Object.keys(value).map((key) => ({ value: value[key], path: `${path}${keyStep(key)}` }));
  return [];
};

const applyStep = (step, found, root) => {
  const out = [];

  found.forEach(({ value, path }) => {
    switch (step.kind) {
      case "key": {
        if (isObject(value) && Object.prototype.hasOwnProperty.call(value, step.name)) {
          out.push({ value: value[step.name], path: `${path}${keyStep(step.name)}` });
        }
        break;
      }
      case "index": {
        if (!Array.isArray(value)) break;
        const at = step.at < 0 ? value.length + step.at : step.at;
        if (at >= 0 && at < value.length) out.push({ value: value[at], path: `${path}[${at}]` });
        break;
      }
      case "wildcard": {
        out.push(...childrenOf(value, path));
        break;
      }
      case "slice": {
        if (!Array.isArray(value)) break;
        const size = value.length;
        const step_ = Number.isFinite(step.step) && step.step !== 0 ? step.step : 1;
        const clamp = (n, fallback) => {
          if (n === null || !Number.isFinite(n)) return fallback;
          return n < 0 ? Math.max(0, size + n) : Math.min(n, size);
        };
        if (step_ > 0) {
          for (let i = clamp(step.from, 0); i < clamp(step.to, size); i += step_) {
            out.push({ value: value[i], path: `${path}[${i}]` });
          }
        } else {
          for (let i = clamp(step.from, size - 1); i > clamp(step.to, -1); i += step_) {
            if (i >= 0 && i < size) out.push({ value: value[i], path: `${path}[${i}]` });
          }
        }
        break;
      }
      case "union": {
        step.names.forEach((name) => {
          if (typeof name === "number" && Array.isArray(value)) {
            const at = name < 0 ? value.length + name : name;
            if (at >= 0 && at < value.length) out.push({ value: value[at], path: `${path}[${at}]` });
          } else if (isObject(value) && Object.prototype.hasOwnProperty.call(value, name)) {
            out.push({ value: value[name], path: `${path}${keyStep(name)}` });
          }
        });
        break;
      }
      case "descend": {
        const visit = (current, at) => {
          if (step.name === null) {
            childrenOf(current, at).forEach((child) => {
              out.push(child);
              visit(child.value, child.path);
            });
            return;
          }
          if (isObject(current) && Object.prototype.hasOwnProperty.call(current, step.name)) {
            out.push({ value: current[step.name], path: `${at}${keyStep(step.name)}` });
          }
          childrenOf(current, at).forEach((child) => visit(child.value, child.path));
        };
        visit(value, path);
        break;
      }
      case "filter": {
        childrenOf(value, path).forEach((child) => {
          let keep = false;
          try {
            keep = Boolean(step.test(child.value, root));
          } catch {
            keep = false; // a test that cannot run on this item simply does not match it
          }
          if (keep) out.push(child);
        });
        break;
      }
      default:
        break;
    }
  });

  return out;
};

const run = (steps, value) => steps.reduce((found, step) => applyStep(step, found, value), [{ value, path: "$" }]);

/** The first value a set of steps finds, for use inside a filter. */
const first = (steps, value) => {
  const found = run(steps, value);
  return found.length ? found[0].value : undefined;
};

/**
 * Run a query. Returns `{ ok, matches, error }`, where each match carries the
 * value and the path it was found at.
 */
export const queryJson = (value, query) => {
  let steps;
  try {
    steps = tokenize(query);
  } catch (e) {
    if (e instanceof PathError) return { ok: false, matches: [], error: e.message, at: e.at };
    throw e;
  }
  try {
    return { ok: true, matches: run(steps, value), error: "" };
  } catch (e) {
    if (e instanceof PathError) return { ok: false, matches: [], error: e.message, at: e.at };
    return { ok: false, matches: [], error: "That path could not be run on this document." };
  }
};

/**
 * Paths worth suggesting, read off the document itself — the quickest way to
 * a working query is usually to start from one that already matches.
 */
export const suggestPaths = (value, { limit = 40, depth = 4 } = {}) => {
  const out = [];
  const visit = (current, path, level) => {
    if (out.length >= limit || level > depth) return;
    childrenOf(current, path).forEach((child) => {
      if (out.length >= limit) return;
      out.push(child.path);
      // One element of an array stands for all of them; suggesting [0], [1],
      // [2]… of a thousand-item list helps nobody.
      if (Array.isArray(current) && child.path.endsWith("[0]") === false) return;
      visit(child.value, child.path, level + 1);
    });
  };
  visit(value, "$", 1);
  return out;
};

/** How many things a query found, as a sentence. */
export const describeMatches = (matches) =>
  matches.length === 0 ? "Nothing matched." : `${matches.length} ${matches.length === 1 ? "match" : "matches"}`;
