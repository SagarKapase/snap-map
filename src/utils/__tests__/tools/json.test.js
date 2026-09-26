import { describe, it, expect } from "vitest";
import { parseJson, formatJson, minifyJson, toValue, describeStats, formatBytes } from "../../tools/json";

const read = (text, options) => parseJson(text, options);

describe("reading valid JSON", () => {
  it("agrees with JSON.parse on the value", () => {
    const text = '{"a":1,"b":[true,null,"x"],"c":{"d":1.5e3}}';
    const result = read(text);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.value).toEqual(JSON.parse(text));
  });

  it("reads every kind of scalar", () => {
    const result = read('[0,-1,1.5,1e3,1E-3,"",  "a\\nb", true, false, null]');
    expect(result.value).toEqual([0, -1, 1.5, 1000, 0.001, "", "a\nb", true, false, null]);
  });

  it("counts what it read", () => {
    const { stats } = read('{"a":[1,2],"b":{"c":"x"},"d":true,"e":null}');
    expect(stats.objects).toBe(2);
    expect(stats.arrays).toBe(1);
    expect(stats.numbers).toBe(2);
    expect(stats.strings).toBe(1);
    expect(stats.booleans).toBe(1);
    expect(stats.nulls).toBe(1);
  });

  it("drops a byte-order mark instead of choking on it", () => {
    const result = read('\uFEFF{"a":1}');
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({ a: 1 });
  });

  it("hands back a plain JavaScript value on request", () => {
    const { ast } = read('{"a":[1,{"b":null}],"c":true}');
    expect(toValue(ast)).toEqual({ a: [1, { b: null }], c: true });
    expect(toValue(null)).toBeUndefined();
  });

  it("reads a bare value, not only an object", () => {
    expect(read("42").value).toBe(42);
    expect(read('"hello"').value).toBe("hello");
    expect(read("null").value).toBeNull();
    expect(read("[]").value).toEqual([]);
  });
});

describe("saying where it went wrong", () => {
  const firstError = (text, options) => read(text, options).errors[0];

  it("points at the line and column, not just the character", () => {
    const error = firstError('{\n  "a": 1,\n  "b": ,\n}', { tolerant: false });
    expect(error.line).toBe(3);
    expect(error.column).toBe(8);
  });

  it("names a string that is never closed, at its opening quote", () => {
    const error = firstError('{\n  "a": "unfinished\n}');
    expect(error.message).toMatch(/never closed/);
    expect(error.line).toBe(2);
    // The opening quote, not wherever the reader gave up.
    expect(error.column).toBe(8);
  });

  it("names an object and an array that are never closed", () => {
    expect(firstError('{"a": 1').message).toMatch(/object is never closed/);
    expect(firstError('[1, 2').message).toMatch(/array is never closed/);
  });

  it("refuses a second value after the first", () => {
    expect(firstError('{"a":1} {"b":2}').message).toMatch(/after the value ends/);
  });

  it("says so when there is nothing to read", () => {
    expect(firstError("").message).toMatch(/nothing to read/);
    expect(firstError("   \n  ").message).toMatch(/nothing to read/);
  });

  it("explains a bad escape rather than pointing at the next character", () => {
    const error = firstError('{"a": "\\q"}');
    expect(error.message).toMatch(/not an escape/);
  });

  it("wants four hex digits after \\u", () => {
    expect(firstError('"\\u12"').message).toMatch(/four hexadecimal/);
  });

  it("stops rather than overflowing on something absurdly deep", () => {
    const deep = `${"[".repeat(2000)}1${"]".repeat(2000)}`;
    const result = read(deep);
    expect(result.ok).toBe(false);
    expect(result.errors[0].message).toMatch(/nests more than/);
  });

  it("never throws, whatever it is handed", () => {
    for (const hostile of ["{", "}", "[", "]", ",", ":", '{"', "\\", "{}{", "[[[", '{"a"', '{"a":', "tru", "nul", "-", "0x", "\u0000", "𝒥𝒮𝒪𝒩"]) {
      expect(() => read(hostile)).not.toThrow();
      expect(() => read(hostile, { tolerant: false })).not.toThrow();
    }
  });
});

describe("what it forgives, and says it forgave", () => {
  it("accepts a trailing comma and names it", () => {
    const result = read('{\n  "a": 1,\n}');
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({ a: 1 });
    expect(result.repairs[0].kind).toBe("trailing-comma");
    expect(result.repairs[0].line).toBe(3);
  });

  it("accepts comments", () => {
    const result = read('{\n  // the first\n  "a": 1, /* and this */ "b": 2\n}');
    expect(result.value).toEqual({ a: 1, b: 2 });
    expect(result.repairs.filter((r) => r.kind === "comment")).toHaveLength(2);
  });

  it("accepts single quotes and unquoted keys", () => {
    const result = read("{ name: 'Ada', age: 36 }");
    expect(result.value).toEqual({ name: "Ada", age: 36 });
    expect(result.repairs.map((r) => r.kind).sort()).toEqual(["single-quote", "unquoted-key", "unquoted-key"]);
  });

  it("turns NaN and Infinity into null, and says so", () => {
    const result = read('{"a": NaN, "b": Infinity}');
    expect(result.repairs.every((r) => r.kind === "not-a-number")).toBe(true);
    expect(formatJson(result.ast, { indent: 0 })).toBe('{"a":null,"b":null}');
  });

  it("accepts a hexadecimal or bare-point number and normalises it", () => {
    const result = read("[0x1F, .5, 5.]");
    expect(result.value).toEqual([31, 0.5, 5]);
    expect(minifyJson(result.ast)).toBe("[31,0.5,5]");
  });

  it("calls every one of those an error when told to be strict", () => {
    for (const bad of ['{"a": 1,}', "{a: 1}", "{'a': 1}", '{"a": 1} // note', '{"a": NaN}', "[0x1F]"]) {
      const result = read(bad, { tolerant: false });
      expect(result.ok).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.repairs).toEqual([]);
    }
  });
});

describe("duplicate keys", () => {
  it("reports one, with both lines", () => {
    const result = read('{\n  "id": 1,\n  "name": "a",\n  "id": 2\n}');
    expect(result.ok).toBe(true);
    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0]).toMatchObject({ key: "id", line: 4, firstLine: 2 });
    // Last one wins, the same as every other parser.
    expect(result.value).toEqual({ id: 2, name: "a" });
  });

  it("gives the path to one buried in the document", () => {
    const result = read('{"a":{"b":[{"x":1,"x":2}]}}');
    expect(result.duplicates[0].path).toBe("a.b[0].x");
  });

  it("says nothing about a key that repeats in a different object", () => {
    expect(read('[{"id":1},{"id":2}]').duplicates).toEqual([]);
  });
});

describe("writing it back out", () => {
  const ast = (text) => read(text).ast;

  it("indents with spaces, tabs, or not at all", () => {
    const node = ast('{"a":[1,2]}');
    expect(formatJson(node, { indent: 2 })).toBe('{\n  "a": [\n    1,\n    2\n  ]\n}');
    expect(formatJson(node, { indent: "\t" })).toBe('{\n\t"a": [\n\t\t1,\n\t\t2\n\t]\n}');
    expect(minifyJson(node)).toBe('{"a":[1,2]}');
  });

  it("leaves an empty object and array on one line", () => {
    expect(formatJson(ast('{"a":{},"b":[]}'))).toBe('{\n  "a": {},\n  "b": []\n}');
  });

  it("keeps a number too large for a double exactly as written", () => {
    const text = '{"id":12345678901234567890,"tiny":1e-400,"exact":0.1000000000000000055511151231257827}';
    const out = minifyJson(ast(text));
    expect(out).toBe(text);
    // Which is the whole point: JSON.stringify(JSON.parse(x)) would not.
    expect(JSON.stringify(JSON.parse(text))).not.toBe(text);
  });

  it("keeps the escapes a person wrote", () => {
    const text = '{"a":"\\u00e9\\/b"}';
    expect(minifyJson(ast(text))).toBe(text);
  });

  it("sorts keys when asked, at every level", () => {
    const out = formatJson(ast('{"b":1,"a":{"d":1,"c":2}}'), { indent: 0, sortKeys: true });
    expect(out).toBe('{"a":{"c":2,"d":1},"b":1}');
  });

  it("round-trips a formatted document unchanged", () => {
    const text = '{"a":[1,{"b":"x"}],"c":null}';
    const once = formatJson(ast(text));
    expect(formatJson(ast(once))).toBe(once);
    expect(minifyJson(ast(once))).toBe(text);
  });

  it("writes nothing for nothing", () => {
    expect(formatJson(null)).toBe("");
  });
});

describe("the summary line", () => {
  it("counts in words", () => {
    expect(describeStats(read('{"a":[1,2]}').stats)).toBe("1 object · 1 array · 2 values");
    expect(describeStats(read("{}").stats)).toBe("1 object");
    expect(describeStats(null)).toBe("");
  });

  it("measures bytes, not characters", () => {
    expect(read('"é"').stats.bytes).toBe(4);
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.00 MB");
  });
});

describe("a document the size of a real specification", () => {
  it("reads a large one quickly", () => {
    const paths = {};
    for (let i = 0; i < 2000; i += 1) {
      paths[`/resource/${i}`] = { get: { summary: `Operation ${i}`, tags: ["a"], responses: { 200: { description: "ok" } } } };
    }
    const text = JSON.stringify({ openapi: "3.1.0", paths });
    const started = Date.now();
    const result = parseJson(text);
    expect(result.ok).toBe(true);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(minifyJson(result.ast)).toBe(text);
  });
});
