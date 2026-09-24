/**
 * What changed between two JSON documents.
 *
 * Text diffs are the wrong tool for JSON. They report a change when a key
 * moves, when the indentation changes, when a trailing comma appears — none
 * of which change the document at all. This compares the structures, so key
 * order never matters and the answer is a list of places rather than a list
 * of lines.
 *
 * Arrays are the hard part, because an array means three different things
 * depending on who wrote it, so the caller says which:
 *
 *  – **By position** — the first element is compared to the first. Right for
 *    a fixed-shape tuple; noisy for a list where one item was inserted at
 *    the top, which shifts everything after it.
 *  – **By key** — elements are matched by an id field. Right for a list of
 *    records, and the only strategy that can tell "this one changed" from
 *    "this one was removed and another added".
 *  – **As a set** — order is ignored entirely and only membership is
 *    reported. Right for tags, scopes and enum values.
 *
 * It works on the syntax trees from `parseJson`, not on plain values, so two
 * ids beyond the precision of a double still compare as the different
 * numbers they are.
 */
import { minifyJson } from "./json.js";

export const ARRAY_STRATEGIES = [
  { id: "index", label: "By position", hint: "Element 1 against element 1. Right for fixed-shape tuples." },
  { id: "key", label: "By key", hint: "Match records by an id field, so an insertion does not shift everything." },
  { id: "set", label: "As a set", hint: "Order ignored — only what was added or removed. Right for tags and scopes." },
];

/** What a change is called, in the order the list shows them. */
export const CHANGE_KINDS = ["added", "removed", "changed", "moved"];

const typeOf = (node) => {
  if (!node) return "nothing";
  if (node.kind === "object") return "object";
  if (node.kind === "array") return "array";
  return node.kind;
};

/**
 * Two numbers are the same when they were written the same way, or when they
 * are the same number and small enough that the two spellings can only be
 * formatting — 1 and 1.0. Beyond the range a double holds exactly, the text
 * is the only thing that can tell two ids apart, so the text decides.
 */
const sameNumber = (a, b) =>
  a.out === b.out || (a.value === b.value && (Number.isSafeInteger(a.value) || !Number.isInteger(a.value)));

const sameScalar = (a, b) => {
  if (a.kind !== b.kind) return false;
  if (a.kind === "number") return sameNumber(a, b);
  return a.value === b.value;
};

/** A short, readable rendering of a value, for the change list. */
export const preview = (node, max = 72) => {
  if (!node) return "";
  const text = minifyJson(node);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

/** Keys sorted and spaces removed, so two equal values have one spelling. */
const canonical = (node) => {
  if (!node) return "";
  if (node.kind === "object") {
    return `{${[...node.members]
      .sort((a, b) => (a.key.value < b.key.value ? -1 : a.key.value > b.key.value ? 1 : 0))
      .map((m) => `${JSON.stringify(m.key.value)}:${canonical(m.value)}`)
      .join(",")}}`;
  }
  if (node.kind === "array") return `[${node.items.map(canonical).join(",")}]`;
  return node.out;
};

/** The value of `field` on an object node, as a string, or null. */
const keyOf = (node, field) => {
  if (!node || node.kind !== "object") return null;
  const member = node.members.find((m) => m.key.value === field);
  if (!member) return null;
  const value = member.value;
  if (value.kind === "object" || value.kind === "array") return null;
  return String(value.value);
};

const join = (path, step) => `${path}${step}`;

/**
 * Compare two documents.
 *
 * Returns `{ changes, summary, identical }`. Every change carries the path
 * it happened at, what was there, what is there now, and the types of both,
 * because "number became string" is usually the whole story.
 */
export const diffJson = (left, right, { arrays = "index", keyField = "id" } = {}) => {
  const changes = [];

  const record = (op, path, from, to) => {
    changes.push({
      op,
      path,
      from: preview(from),
      to: preview(to),
      fromType: typeOf(from),
      toType: typeOf(to),
    });
  };

  const walkObjects = (a, b, path) => {
    const inB = new Map(b.members.map((m) => [m.key.value, m.value]));
    const seen = new Set();

    a.members.forEach((member) => {
      const key = member.key.value;
      if (seen.has(key)) return; // a duplicate key; the last one won on both sides
      seen.add(key);
      const here = join(path, `.${key}`);
      if (!inB.has(key)) {
        record("removed", here, member.value, null);
        return;
      }
      walk(member.value, inB.get(key), here);
    });

    b.members.forEach((member) => {
      const key = member.key.value;
      if (seen.has(key)) return;
      seen.add(key);
      record("added", join(path, `.${key}`), null, member.value);
    });
  };

  const walkByIndex = (a, b, path) => {
    const shared = Math.min(a.items.length, b.items.length);
    for (let i = 0; i < shared; i += 1) walk(a.items[i], b.items[i], join(path, `[${i}]`));
    for (let i = shared; i < a.items.length; i += 1) record("removed", join(path, `[${i}]`), a.items[i], null);
    for (let i = shared; i < b.items.length; i += 1) record("added", join(path, `[${i}]`), null, b.items[i]);
  };

  const walkByKey = (a, b, path) => {
    const keyed = (items) => {
      const map = new Map();
      const loose = [];
      items.forEach((item, index) => {
        const id = keyOf(item, keyField);
        if (id === null || map.has(id)) loose.push({ item, index });
        else map.set(id, { item, index });
      });
      return { map, loose };
    };

    const from = keyed(a.items);
    const to = keyed(b.items);

    from.map.forEach((entry, id) => {
      const other = to.map.get(id);
      const here = join(path, `[${keyField}=${id}]`);
      if (!other) {
        record("removed", here, entry.item, null);
        return;
      }
      walk(entry.item, other.item, here);
      // Worth saying: a record that only moved has not changed, but its
      // position may be what somebody is looking for.
      if (entry.index !== other.index) {
        changes.push({
          op: "moved",
          path: here,
          from: `position ${entry.index}`,
          to: `position ${other.index}`,
          fromType: "array",
          toType: "array",
        });
      }
    });

    to.map.forEach((entry, id) => {
      if (!from.map.has(id)) record("added", join(path, `[${keyField}=${id}]`), null, entry.item);
    });

    // Anything without the key falls back to position, so nothing is dropped.
    const loose = { a: from.loose, b: to.loose };
    const shared = Math.min(loose.a.length, loose.b.length);
    for (let i = 0; i < shared; i += 1) walk(loose.a[i].item, loose.b[i].item, join(path, `[${loose.a[i].index}]`));
    for (let i = shared; i < loose.a.length; i += 1) record("removed", join(path, `[${loose.a[i].index}]`), loose.a[i].item, null);
    for (let i = shared; i < loose.b.length; i += 1) record("added", join(path, `[${loose.b[i].index}]`), null, loose.b[i].item);
  };

  const walkAsSet = (a, b, path) => {
    const count = (items) => {
      const map = new Map();
      items.forEach((item) => {
        const text = canonical(item);
        const entry = map.get(text) || { node: item, n: 0 };
        entry.n += 1;
        map.set(text, entry);
      });
      return map;
    };

    const from = count(a.items);
    const to = count(b.items);

    from.forEach((entry, text) => {
      const other = to.get(text);
      const missing = entry.n - (other?.n || 0);
      for (let i = 0; i < missing; i += 1) record("removed", path, entry.node, null);
    });
    to.forEach((entry, text) => {
      const other = from.get(text);
      const extra = entry.n - (other?.n || 0);
      for (let i = 0; i < extra; i += 1) record("added", path, null, entry.node);
    });
  };

  function walk(a, b, path) {
    // Two documents that could not be read are not different from each other.
    if (!a && !b) return;
    const ta = typeOf(a);
    const tb = typeOf(b);

    if (ta !== tb) {
      record("changed", path, a, b);
      return;
    }
    if (ta === "object") {
      walkObjects(a, b, path);
      return;
    }
    if (ta === "array") {
      if (arrays === "key") walkByKey(a, b, path);
      else if (arrays === "set") walkAsSet(a, b, path);
      else walkByIndex(a, b, path);
      return;
    }
    if (!sameScalar(a, b)) record("changed", path, a, b);
  }

  walk(left, right, "$");

  const summary = { added: 0, removed: 0, changed: 0, moved: 0 };
  changes.forEach((change) => {
    summary[change.op] += 1;
  });

  return {
    changes: changes.sort((x, y) => (x.path < y.path ? -1 : x.path > y.path ? 1 : 0)),
    summary,
    identical: changes.length === 0,
  };
};

/** The summary as a sentence, for the page to show above the list. */
export const describeDiff = ({ summary, identical }) => {
  if (identical) return "No difference. The two documents say the same thing.";
  const parts = CHANGE_KINDS.filter((kind) => summary[kind]).map((kind) => `${summary[kind]} ${kind}`);
  return parts.join(", ");
};
