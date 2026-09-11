/**
 * A small JSON Schema checker, enough for the question actually being asked:
 * does the example a specification ships actually satisfy the schema declared
 * next to it?
 *
 * This is deliberately not a complete validator. It covers the keywords that
 * appear in real OpenAPI documents and stays quiet about the rest, because a
 * false "your example is wrong" is worse than a missed one. Nothing is sent
 * anywhere — it compares two things the document already contains.
 */

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Resolve a local `$ref` against the document it came from. */
const deref = (schema, root, seen = new Set()) => {
  let current = schema;
  let guard = 0;
  while (isObject(current) && typeof current.$ref === "string" && guard < 20) {
    const ref = current.$ref;
    if (!ref.startsWith("#/") || seen.has(ref)) return null;
    seen.add(ref);
    let node = root;
    for (const rawPart of ref.slice(2).split("/")) {
      const part = rawPart.replace(/~1/g, "/").replace(/~0/g, "~");
      if (!isObject(node) && !Array.isArray(node)) return null;
      node = node[part];
      if (node === undefined) return null;
    }
    current = node;
    guard += 1;
  }
  return current;
};

const typeOf = (value) => {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value; // string | boolean | object
};

const typeMatches = (value, declared) => {
  const actual = typeOf(value);
  if (declared === "number") return actual === "number" || actual === "integer";
  if (declared === "integer") return actual === "integer";
  return actual === declared;
};

/**
 * Walk the value against the schema.
 *
 * `path` is a human-readable location such as `data[0].email`, which is what
 * makes a finding actionable.
 */
const walk = (value, schema, root, path, issues, depth) => {
  if (depth > 12 || issues.length >= 25) return;
  const resolved = deref(schema, root);
  if (!isObject(resolved)) return;

  // A composed schema is more than this checker should guess at.
  if (resolved.oneOf || resolved.anyOf || resolved.allOf || resolved.not) return;

  const at = path || "the example";

  // 3.0 wrote `nullable: true`; 3.1 writes the null into the type list.
  const declaredTypes = Array.isArray(resolved.type)
    ? resolved.type
    : resolved.type
      ? [resolved.type]
      : [];
  const nullAllowed = resolved.nullable === true || declaredTypes.includes("null");

  if (value === null && nullAllowed) return;

  if (declaredTypes.length) {
    const ok = declaredTypes.some((t) => typeMatches(value, t));
    if (!ok) {
      issues.push({
        path: at,
        message: `expected ${declaredTypes.join(" or ")}, found ${typeOf(value)}`,
      });
      return; // every deeper check would just repeat this
    }
  }

  if (Array.isArray(resolved.enum) && resolved.enum.length) {
    const match = resolved.enum.some(
      (option) => JSON.stringify(option) === JSON.stringify(value),
    );
    if (!match) {
      issues.push({
        path: at,
        message: `not one of the allowed values (${resolved.enum
          .slice(0, 4)
          .map((v) => JSON.stringify(v))
          .join(", ")}${resolved.enum.length > 4 ? ", …" : ""})`,
      });
    }
  }

  if (resolved.const !== undefined) {
    if (JSON.stringify(resolved.const) !== JSON.stringify(value)) {
      issues.push({ path: at, message: `must be ${JSON.stringify(resolved.const)}` });
    }
  }

  if (typeof value === "string") {
    if (typeof resolved.minLength === "number" && value.length < resolved.minLength) {
      issues.push({ path: at, message: `shorter than minLength ${resolved.minLength}` });
    }
    if (typeof resolved.maxLength === "number" && value.length > resolved.maxLength) {
      issues.push({ path: at, message: `longer than maxLength ${resolved.maxLength}` });
    }
    if (typeof resolved.pattern === "string") {
      try {
        if (!new RegExp(resolved.pattern).test(value)) {
          issues.push({ path: at, message: `does not match pattern ${resolved.pattern}` });
        }
      } catch {
        /* an invalid pattern is the schema's problem, not the example's */
      }
    }
  }

  if (typeof value === "number") {
    if (typeof resolved.minimum === "number" && value < resolved.minimum) {
      issues.push({ path: at, message: `below minimum ${resolved.minimum}` });
    }
    if (typeof resolved.maximum === "number" && value > resolved.maximum) {
      issues.push({ path: at, message: `above maximum ${resolved.maximum}` });
    }
  }

  if (Array.isArray(value)) {
    if (typeof resolved.minItems === "number" && value.length < resolved.minItems) {
      issues.push({ path: at, message: `fewer than minItems ${resolved.minItems}` });
    }
    if (resolved.items) {
      value.slice(0, 20).forEach((item, i) => {
        walk(item, resolved.items, root, `${at === "the example" ? "" : at}[${i}]`, issues, depth + 1);
      });
    }
    return;
  }

  if (isObject(value)) {
    (Array.isArray(resolved.required) ? resolved.required : []).forEach((key) => {
      if (!(key in value)) {
        issues.push({
          path: at === "the example" ? key : `${at}.${key}`,
          message: "required by the schema but missing from the example",
        });
      }
    });

    if (isObject(resolved.properties)) {
      Object.entries(value).forEach(([key, item]) => {
        const property = resolved.properties[key];
        if (!property) {
          if (resolved.additionalProperties === false) {
            issues.push({
              path: at === "the example" ? key : `${at}.${key}`,
              message: "not declared by the schema, which forbids extra properties",
            });
          }
          return;
        }
        walk(item, property, root, at === "the example" ? key : `${at}.${key}`, issues, depth + 1);
      });
    }
  }
};

/**
 * Check one example against one schema.
 *
 * Returns `{ checked, issues }`. `checked` is false when there was nothing
 * to compare — no schema, or one this checker deliberately skips — so callers
 * can tell "passed" apart from "not examined".
 */
export const validateExample = (example, schema, root = null) => {
  if (example === undefined || !isObject(schema)) return { checked: false, issues: [] };
  const resolved = deref(schema, root ?? schema);
  if (!isObject(resolved) || (!resolved.type && !resolved.properties && !resolved.items)) {
    return { checked: false, issues: [] };
  }
  const issues = [];
  walk(example, schema, root ?? schema, "", issues, 0);
  return { checked: true, issues };
};
