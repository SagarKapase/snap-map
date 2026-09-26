import { describe, it, expect } from "vitest";
import { findRecords, toTable, cellText, cellKind, MAX_ROWS } from "../../tools/tabular";

describe("finding the records in a document", () => {
  it("takes a bare list of records", () => {
    const rows = [{ id: 1 }, { id: 2 }];
    expect(findRecords(rows)).toMatchObject({ rows, at: "$" });
  });

  it("looks one envelope deep, which is where an API usually puts them", () => {
    for (const key of ["data", "results", "items", "anythingReally"]) {
      const found = findRecords({ page: 1, [key]: [{ id: 1 }] });
      expect(found.rows).toEqual([{ id: 1 }]);
      expect(found.at).toBe(`$.${key}`);
    }
  });

  it("says which one it picked when there is more than one list", () => {
    const found = findRecords({ users: [{ id: 1 }], orders: [{ id: 2 }] });
    expect(found.at).toBe("$.users");
    expect(found.reason).toMatch(/More than one/);
  });

  it("explains itself rather than showing nothing", () => {
    expect(findRecords(5).reason).toMatch(/single value/);
    expect(findRecords({ a: 1 }).reason).toMatch(/No list of records/);
    expect(findRecords([]).reason).toMatch(/empty/);
    expect(findRecords([1, 2, 3]).reason).toMatch(/not of records/);
    expect(findRecords(null).reason).toBeTruthy();
  });

  it("never claims a list of mixed things is a table", () => {
    expect(findRecords([{ a: 1 }, 2]).rows).toBeNull();
    expect(findRecords([{ a: 1 }, [2]]).rows).toBeNull();
  });
});

describe("laying them out", () => {
  it("gives every record the same columns, in the order first seen", () => {
    const table = toTable([{ id: 1, name: "Ada" }, { id: 2, city: "Paris" }]);
    expect(table.columns).toEqual(["id", "name", "city"]);
    expect(table.rows[0]).toEqual([1, "Ada", undefined]);
    expect(table.rows[1]).toEqual([2, undefined, "Paris"]);
  });

  it("flattens a nested record into columns", () => {
    const table = toTable([{ user: { name: "Ada" }, tags: ["a", "b"] }]);
    expect(table.columns).toEqual(["user.name", "tags[0]", "tags[1]"]);
  });

  it("draws part of a very long list rather than all of it", () => {
    const many = Array.from({ length: MAX_ROWS + 120 }, (_, i) => ({ id: i }));
    const table = toTable(many);
    expect(table.rows).toHaveLength(MAX_ROWS);
    expect(table.total).toBe(MAX_ROWS + 120);
    expect(table.truncated).toBe(true);
  });

  it("does not claim to be truncated when it is not", () => {
    expect(toTable([{ a: 1 }]).truncated).toBe(false);
  });
});

describe("one cell", () => {
  it("says what it holds", () => {
    expect(cellText(undefined)).toBe("");
    expect(cellText(null)).toBe("null");
    expect(cellText(12)).toBe("12");
    expect(cellText(false)).toBe("false");
    expect(cellText("x")).toBe("x");
    // An empty container survived flattening, so it is shown as itself.
    expect(cellText({})).toBe("{}");
    expect(cellText([])).toBe("[]");
  });

  it("names its kind, so the table can colour it like the code view", () => {
    expect(cellKind(undefined)).toBe("missing");
    expect(cellKind(null)).toBe("null");
    expect(cellKind(1)).toBe("number");
    expect(cellKind(true)).toBe("boolean");
    expect(cellKind("a")).toBe("string");
    expect(cellKind({})).toBe("empty");
  });
});
