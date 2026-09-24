import { describe, it, expect } from "vitest";
import { parseJson } from "../../tools/json";
import { diffJson, describeDiff, preview, ARRAY_STRATEGIES } from "../../tools/jsonDiff";

const ast = (text) => parseJson(text).ast;
const diff = (a, b, options) => diffJson(ast(a), ast(b), options);
const paths = (result) => result.changes.map((c) => `${c.op} ${c.path}`);

describe("objects", () => {
  it("finds nothing between a document and itself", () => {
    const result = diff('{"a":1,"b":[1,2],"c":{"d":null}}', '{"a":1,"b":[1,2],"c":{"d":null}}');
    expect(result.identical).toBe(true);
    expect(describeDiff(result)).toMatch(/No difference/);
  });

  it("ignores the order the keys were written in", () => {
    // The whole reason not to use a text diff on JSON.
    expect(diff('{"a":1,"b":2}', '{"b":2,"a":1}').identical).toBe(true);
  });

  it("ignores whitespace and how it was laid out", () => {
    expect(diff('{"a":[1,2]}', '{\n  "a": [\n    1,\n    2\n  ]\n}').identical).toBe(true);
  });

  it("names what was added, removed and changed, and where", () => {
    const result = diff('{"keep":1,"drop":2,"edit":3}', '{"keep":1,"edit":4,"new":5}');
    expect(paths(result).sort()).toEqual(["added $.new", "changed $.edit", "removed $.drop"]);
    const edit = result.changes.find((c) => c.path === "$.edit");
    expect(edit.from).toBe("3");
    expect(edit.to).toBe("4");
  });

  it("goes as deep as the documents do", () => {
    const result = diff('{"a":{"b":{"c":1}}}', '{"a":{"b":{"c":2}}}');
    expect(paths(result)).toEqual(["changed $.a.b.c"]);
  });

  it("says when a value changed type, because that is usually the story", () => {
    const result = diff('{"id":1}', '{"id":"1"}');
    expect(result.changes[0]).toMatchObject({ op: "changed", fromType: "number", toType: "string" });
  });

  it("treats a whole container replaced as one change, not a hundred", () => {
    const result = diff('{"a":{"x":1}}', '{"a":[1,2,3]}');
    expect(paths(result)).toEqual(["changed $.a"]);
    expect(result.changes[0].toType).toBe("array");
  });
});

describe("numbers", () => {
  it("calls 1 and 1.0 the same number", () => {
    expect(diff('{"a":1}', '{"a":1.0}').identical).toBe(true);
    expect(diff('{"a":1e3}', '{"a":1000}').identical).toBe(true);
  });

  it("can still tell two ids apart beyond what a double holds", () => {
    // Both of these parse to the same double. Only the text can separate
    // them, so the text is what decides.
    const result = diff('{"id":12345678901234567890}', '{"id":12345678901234567891}');
    expect(result.identical).toBe(false);
    expect(result.changes[0].op).toBe("changed");
  });
});

describe("arrays by position", () => {
  it("compares element to element", () => {
    expect(paths(diff("[1,2,3]", "[1,9,3]"))).toEqual(["changed $[1]"]);
  });

  it("reports what the two lengths differ by", () => {
    expect(paths(diff("[1,2]", "[1,2,3]"))).toEqual(["added $[2]"]);
    expect(paths(diff("[1,2,3]", "[1,2]"))).toEqual(["removed $[2]"]);
  });

  it("is noisy when something is inserted at the front — which is why there are other strategies", () => {
    const result = diff('[{"id":1},{"id":2}]', '[{"id":0},{"id":1},{"id":2}]');
    expect(result.changes.length).toBeGreaterThan(1);
  });
});

describe("arrays by key", () => {
  const options = { arrays: "key" };

  it("sees an insertion as one addition, not a shift of everything", () => {
    const result = diff('[{"id":1},{"id":2}]', '[{"id":0},{"id":1},{"id":2}]', options);
    expect(result.changes.filter((c) => c.op === "added")).toHaveLength(1);
    expect(result.changes.some((c) => c.op === "changed")).toBe(false);
  });

  it("matches records wherever they moved to", () => {
    const result = diff('[{"id":"a","v":1},{"id":"b","v":2}]', '[{"id":"b","v":2},{"id":"a","v":9}]', options);
    expect(result.changes.filter((c) => c.op === "changed").map((c) => c.path)).toEqual(['$[id=a].v']);
  });

  it("says when a record only moved", () => {
    const result = diff('[{"id":"a"},{"id":"b"}]', '[{"id":"b"},{"id":"a"}]', options);
    expect(result.changes.every((c) => c.op === "moved")).toBe(true);
    expect(result.changes).toHaveLength(2);
    expect(result.changes[0].from).toMatch(/position/);
  });

  it("takes any field as the key", () => {
    const result = diff('[{"name":"a","v":1}]', '[{"name":"a","v":2}]', { arrays: "key", keyField: "name" });
    expect(paths(result)).toEqual(["changed $[name=a].v"]);
  });

  it("falls back to position for records with no key, rather than dropping them", () => {
    const result = diff('[{"id":1},{"x":1}]', '[{"id":1},{"x":2}]', options);
    expect(paths(result)).toEqual(["changed $[1].x"]);
  });
});

describe("arrays as a set", () => {
  const options = { arrays: "set" };

  it("does not care what order things are in", () => {
    expect(diff('["read","write"]', '["write","read"]', options).identical).toBe(true);
  });

  it("reports only what joined and what left", () => {
    const result = diff('["read","write"]', '["read","admin"]', options);
    expect(result.summary).toMatchObject({ added: 1, removed: 1, changed: 0 });
    expect(result.changes.find((c) => c.op === "added").to).toBe('"admin"');
  });

  it("counts duplicates rather than collapsing them", () => {
    const result = diff('["a","a"]', '["a"]', options);
    expect(result.summary.removed).toBe(1);
  });

  it("matches objects however their keys were ordered", () => {
    expect(diff('[{"a":1,"b":2}]', '[{"b":2,"a":1}]', options).identical).toBe(true);
  });
});

describe("what it hands back", () => {
  it("counts each kind of change", () => {
    const result = diff('{"a":1,"b":2}', '{"a":9,"c":3}');
    expect(result.summary).toEqual({ added: 1, removed: 1, changed: 1, moved: 0 });
    expect(describeDiff(result)).toBe("1 added, 1 removed, 1 changed");
  });

  it("lists changes in the order of the document, not the order it found them", () => {
    const result = diff('{"z":1,"a":1}', '{"z":2,"a":2}');
    expect(result.changes.map((c) => c.path)).toEqual(["$.a", "$.z"]);
  });

  it("shortens a long value rather than pasting the whole thing into the list", () => {
    const long = `{"a":"${"x".repeat(500)}"}`;
    const result = diff(long, '{"a":"y"}');
    expect(result.changes[0].from.length).toBeLessThan(80);
    expect(result.changes[0].from.endsWith("…")).toBe(true);
  });

  it("previews nothing as nothing", () => {
    expect(preview(null)).toBe("");
  });

  it("offers three strategies, each with a reason", () => {
    expect(ARRAY_STRATEGIES.map((s) => s.id)).toEqual(["index", "key", "set"]);
    ARRAY_STRATEGIES.forEach((s) => expect(s.hint.length).toBeGreaterThan(20));
  });
});

describe("edges", () => {
  it("copes with empty documents on either side", () => {
    expect(diff("{}", "{}").identical).toBe(true);
    expect(paths(diff("{}", '{"a":1}'))).toEqual(["added $.a"]);
    expect(paths(diff('{"a":1}', "{}"))).toEqual(["removed $.a"]);
    expect(diff("[]", "[]", { arrays: "set" }).identical).toBe(true);
  });

  it("compares bare values, not only objects", () => {
    expect(diff("1", "2").changes[0].path).toBe("$");
    expect(diff('"a"', "null").changes[0]).toMatchObject({ fromType: "string", toType: "null" });
  });

  it("never throws on a document it could not read", () => {
    expect(() => diffJson(null, ast('{"a":1}'))).not.toThrow();
    expect(diffJson(null, null).identical).toBe(true);
    expect(diffJson(ast("{}"), null).changes[0].op).toBe("changed");
  });

  it("stays quick on a large pair", () => {
    const build = (n, shift) =>
      JSON.stringify(Array.from({ length: n }, (_, i) => ({ id: i, name: `item ${i + shift}` })));
    const started = Date.now();
    const result = diff(build(4000, 0), build(4000, 1), { arrays: "key" });
    expect(result.summary.changed).toBe(4000);
    expect(Date.now() - started).toBeLessThan(3000);
  });
});
