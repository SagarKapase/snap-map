import { describe, it, expect } from "vitest";
import { parseJson } from "../../tools/json";
import { flattenJson, unflattenJson, splitKey, toCsv, toEnvLines, ARRAY_STYLES } from "../../tools/flatten";
import { profileJson, breakdownOf, utf8Length, asPercent } from "../../tools/jsonSize";
import { parseNdjson, commonKeys, filterRecords, toJsonArray, fromJsonArray, describeNdjson } from "../../tools/ndjson";

const ast = (text) => parseJson(text).ast;
const flat = (value, options) => Object.fromEntries(flattenJson(value, options).entries.map((e) => [e.key, e.value]));

describe("flattening", () => {
  it("writes a nested document as one level of keys", () => {
    expect(flat({ a: { b: { c: 1 } }, d: 2 })).toEqual({ "a.b.c": 1, d: 2 });
  });

  it("writes array positions in brackets, or as keys", () => {
    expect(flat({ a: [1, 2] })).toEqual({ "a[0]": 1, "a[1]": 2 });
    expect(flat({ a: [1, 2] }, { arrays: "dots" })).toEqual({ "a.0": 1, "a.1": 2 });
  });

  it("keeps an empty object or array, instead of losing it", () => {
    // Every implementation that drops these turns up as a missing field
    // three systems downstream.
    expect(flat({ a: {}, b: [], c: 1 })).toEqual({ a: {}, b: [], c: 1 });
  });

  it("takes any separator", () => {
    expect(flat({ a: { b: 1 } }, { delimiter: "/" })).toEqual({ "a/b": 1 });
    expect(flat({ a: { b: 1 } }, { delimiter: "__" })).toEqual({ a__b: 1 });
  });

  it("reports a key that already contains the separator, rather than guessing", () => {
    const result = flattenJson({ "a.b": 1, a: { b: 2 } });
    expect(result.collisions.length).toBeGreaterThan(0);
  });

  it("keeps the order of the document", () => {
    const keys = flattenJson({ z: 1, a: { y: 2, b: 3 } }).entries.map((e) => e.key);
    expect(keys).toEqual(["z", "a.y", "a.b"]);
  });

  it("flattens a bare value and an empty document", () => {
    expect(flattenJson(5).entries).toEqual([{ key: "", value: 5 }]);
    expect(flat({})).toEqual({ "": {} });
  });
});

describe("unflattening", () => {
  it("is the exact reverse of flattening", () => {
    const documents = [
      { a: { b: { c: 1 } }, d: 2 },
      { list: [1, 2, 3] },
      { mixed: [{ a: 1 }, { b: [2, 3] }] },
      { empty: {}, none: [], zero: 0, no: false, nothing: null },
      { deep: { a: [{ b: [{ c: "x" }] }] } },
    ];
    for (const style of ARRAY_STYLES.map((s) => s.id)) {
      documents.forEach((document) => {
        const { entries } = flattenJson(document, { arrays: style });
        expect(unflattenJson(entries, { arrays: style }).value).toEqual(document);
      });
    }
  });

  it("builds a list when the first step is a position", () => {
    expect(unflattenJson({ "[0]": "a", "[1]": "b" }).value).toEqual(["a", "b"]);
  });

  it("fills a gap with null rather than leaving a hole", () => {
    expect(unflattenJson({ "a[0]": 1, "a[2]": 3 }).value).toEqual({ a: [1, null, 3] });
  });

  it("reports a key that contradicts one already set", () => {
    const result = unflattenJson({ a: 1, "a.b": 2 });
    expect(result.problems).toContain("a.b");
    expect(result.value).toEqual({ a: { b: 2 } });
  });

  it("copes with nothing", () => {
    expect(unflattenJson({}).value).toEqual({});
    expect(unflattenJson(null).value).toEqual({});
  });

  it("reads a key back into its steps", () => {
    expect(splitKey("a.b[0].c")).toEqual([
      { name: "a", index: false },
      { name: "b", index: false },
      { name: 0, index: true },
      { name: "c", index: false },
    ]);
  });
});

describe("as a spreadsheet", () => {
  it("gives every record the same columns", () => {
    const csv = toCsv([{ id: 1, name: "Ada" }, { id: 2, city: "Paris" }]);
    expect(csv.split("\n")).toEqual(["id,name,city", "1,Ada,", "2,,Paris"]);
  });

  it("quotes a value with a comma, a quote or a newline in it", () => {
    // The newline stays inside the quotes, which is what makes the row still
    // one row — so this cannot be checked by splitting on newlines.
    const csv = toCsv([{ a: "x,y", b: 'say "hi"', c: "one\ntwo" }]);
    expect(csv).toBe('a,b,c\n"x,y","say ""hi""","one\ntwo"');
  });

  it("flattens nested records into columns", () => {
    expect(toCsv([{ user: { name: "Ada" }, tags: ["a", "b"] }]).split("\n")[0]).toBe("user.name,tags[0],tags[1]");
  });

  it("takes a single record as one row", () => {
    expect(toCsv({ a: 1 }).split("\n")).toEqual(["a", "1"]);
  });

  it("writes environment lines", () => {
    const { entries } = flattenJson({ db: { host: "localhost", port: 5432 }, note: "has spaces" });
    expect(toEnvLines(entries)).toBe('DB_HOST=localhost\nDB_PORT=5432\nNOTE="has spaces"');
  });
});

describe("costing a payload", () => {
  it("counts bytes, not characters", () => {
    expect(utf8Length("abc")).toBe(3);
    expect(utf8Length("é")).toBe(2);
    expect(utf8Length("→")).toBe(3);
    expect(utf8Length("😀")).toBe(4);
  });

  it("agrees with the minified document it is costing", () => {
    for (const text of ['{"a":1}', '{"a":[1,2,3],"b":{"c":"x"}}', "[]", "{}", '{"é":"→"}', "[1,2,3]"]) {
      expect(profileJson(ast(text)).bytes).toBe(utf8Length(text));
    }
  });

  it("separates what the key names cost from what the data costs", () => {
    const profile = profileJson(ast('{"a":1,"bb":2}'));
    expect(profile.keyBytes).toBe(3 + 4); // "a" and "bb", with their quotes
    expect(profile.valueBytes).toBe(2);
    expect(profile.keyBytes + profile.valueBytes + profile.structureBytes).toBe(profile.bytes);
  });

  it("names the heaviest parts, with their share", () => {
    const document = { small: 1, big: { items: Array.from({ length: 200 }, (_, i) => `item ${i}`) } };
    const profile = profileJson(ast(JSON.stringify(document)));
    expect(profile.heaviest[0].path).toBe("$.big");
    expect(profile.heaviest[0].share).toBeGreaterThan(0.9);
    expect(profile.heaviest.some((entry) => entry.path === "$.big.items")).toBe(true);
  });

  it("says when the field names are the problem", () => {
    const records = Array.from({ length: 50 }, () => ({ aVeryLongFieldNameIndeed: 1, anotherOne: 2 }));
    expect(profileJson(ast(JSON.stringify(records))).keyShare).toBeGreaterThan(0.5);
  });

  it("breaks one level down, biggest first", () => {
    const rows = breakdownOf(ast('{"tiny":1,"huge":"' + "x".repeat(400) + '"}'));
    expect(rows[0].label).toBe("huge");
    expect(rows[0].share).toBeGreaterThan(0.9);
    expect(breakdownOf(ast("1"))).toEqual([]);
    expect(breakdownOf(null)).toEqual([]);
  });

  it("reads nothing as nothing", () => {
    expect(profileJson(null)).toBeNull();
  });

  it("writes a share the way a person would say it", () => {
    expect(asPercent(0.5)).toBe("50%");
    expect(asPercent(0.034)).toBe("3.4%");
    expect(asPercent(0.0004)).toBe("<1%");
    expect(asPercent(0)).toBe("0%");
  });
});

describe("JSON Lines", () => {
  const sample = '{"id":1,"ok":true}\n{"id":2,"ok":false}\n\n{"id":3}';

  it("reads one document per line, and keeps the line numbers", () => {
    const { records, stats } = parseNdjson(sample);
    expect(records.map((r) => r.line)).toEqual([1, 2, 4]);
    expect(stats).toMatchObject({ lines: 3, ok: 3, bad: 0, blank: 1 });
  });

  it("lets one bad line fail without taking the file with it", () => {
    const { records, stats } = parseNdjson('{"a":1}\nnot json at all\n{"b":2}');
    expect(stats).toMatchObject({ ok: 2, bad: 1 });
    expect(records[1].ok).toBe(false);
    expect(records[1].error.message).toBeTruthy();
    expect(records[2].value).toEqual({ b: 2 });
  });

  it("stops at the limit rather than locking the tab", () => {
    const many = Array.from({ length: 200 }, (_, i) => `{"i":${i}}`).join("\n");
    const { records, stats } = parseNdjson(many, { limit: 50 });
    expect(records).toHaveLength(50);
    expect(stats.truncated).toBe(true);
    expect(stats.lines).toBe(200);
  });

  it("says which fields the records share, and which they do not", () => {
    const keys = commonKeys(parseNdjson(sample).records);
    expect(keys[0]).toMatchObject({ key: "id", count: 3, share: 1 });
    expect(keys.find((k) => k.key === "ok")).toMatchObject({ count: 2 });
  });

  it("filters on a plain word", () => {
    const { records } = parseNdjson(sample);
    expect(filterRecords(records, "false").records.map((r) => r.line)).toEqual([2]);
    expect(filterRecords(records, "").records).toHaveLength(3);
    expect(filterRecords(records, "nothing here").records).toEqual([]);
  });

  it("filters on a path, read over the file as if it were one array", () => {
    const { records } = parseNdjson(sample);
    // Which is what somebody who has filtered a JSON array expects it to mean.
    expect(filterRecords(records, "$[?(@.ok == true)]").records.map((r) => r.line)).toEqual([1]);
    expect(filterRecords(records, "$[?(@.id > 1)]").records.map((r) => r.line)).toEqual([2, 4]);
    expect(filterRecords(records, "$..ok").records.map((r) => r.line)).toEqual([1, 2]);
    expect(filterRecords(records, "$").records).toHaveLength(3);
  });

  it("does not match a line it could not read", () => {
    const { records } = parseNdjson('{"a":1}\nbroken{\n{"a":2}');
    expect(filterRecords(records, "$[?(@.a)]").records.map((r) => r.line)).toEqual([1, 3]);
    // …but a plain word still finds it, which is how you go looking for one.
    expect(filterRecords(records, "broken").records.map((r) => r.line)).toEqual([2]);
  });

  it("reports a broken path once, not once per line", () => {
    const { records } = parseNdjson(sample);
    const result = filterRecords(records, "$[");
    expect(result.error).toMatch(/never closed/);
    expect(result.records).toEqual([]);
  });

  it("converts to a JSON array and back", () => {
    const array = toJsonArray(parseNdjson(sample).records);
    expect(JSON.parse(array)).toEqual([{ id: 1, ok: true }, { id: 2, ok: false }, { id: 3 }]);
    const back = fromJsonArray(array);
    expect(back.error).toBe("");
    expect(parseNdjson(back.text).stats.ok).toBe(3);
  });

  it("says why it cannot make lines out of something that is not a list", () => {
    expect(fromJsonArray('{"a":1}').error).toMatch(/made from a list/);
    expect(fromJsonArray("nonsense").error).toBeTruthy();
  });

  it("summarises what it read", () => {
    expect(describeNdjson(parseNdjson(sample))).toBe("3 records · 1 blank line skipped");
    expect(describeNdjson(parseNdjson(""))).toMatch(/Nothing to read/);
    expect(describeNdjson(parseNdjson('{"a":1}\nbad'))).toMatch(/1 could not be read/);
  });

  it("copes with one long line and with no lines", () => {
    expect(parseNdjson("").records).toEqual([]);
    expect(parseNdjson("   \n  \n").stats.lines).toBe(0);
    expect(parseNdjson('{"a":1}').stats.ok).toBe(1);
  });
});
