import { describe, it, expect } from "vitest";
import { queryJson, suggestPaths, describeMatches } from "../../tools/jsonPath";

// The document from the JSONPath proposal, which nearly every implementation
// is tested against, so the answers here can be checked against any other.
const store = {
  store: {
    book: [
      { category: "reference", author: "Nigel Rees", title: "Sayings of the Century", price: 8.95 },
      { category: "fiction", author: "Evelyn Waugh", title: "Sword of Honour", price: 12.99 },
      { category: "fiction", author: "Herman Melville", title: "Moby Dick", isbn: "0-553-21311-3", price: 8.99 },
      { category: "fiction", author: "J. R. R. Tolkien", title: "The Lord of the Rings", isbn: "0-395-19395-8", price: 22.99 },
    ],
    bicycle: { color: "red", price: 19.95 },
  },
  expensive: 10,
};

const values = (query, doc = store) => queryJson(doc, query).matches.map((m) => m.value);
const paths = (query, doc = store) => queryJson(doc, query).matches.map((m) => m.path);

describe("naming a place in the document", () => {
  it("takes the whole document", () => {
    expect(values("$")).toEqual([store]);
    expect(paths("$")).toEqual(["$"]);
  });

  it("walks down by name, with a dot or in brackets", () => {
    expect(values("$.store.bicycle.color")).toEqual(["red"]);
    expect(values("$['store']['bicycle']['color']")).toEqual(["red"]);
    expect(values("$.expensive")).toEqual([10]);
  });

  it("takes a key that could not be written after a dot", () => {
    expect(values("$['odd key']", { "odd key": 1 })).toEqual([1]);
    // …and hands the path back in a form that can be pasted straight back in.
    expect(paths("$..*", { "odd key": 1 })).toEqual(["$['odd key']"]);
  });

  it("counts array elements, including from the end", () => {
    expect(values("$.store.book[0].title")).toEqual(["Sayings of the Century"]);
    expect(values("$.store.book[-1].title")).toEqual(["The Lord of the Rings"]);
    expect(values("$.store.book[99]")).toEqual([]);
  });

  it("finds nothing rather than failing when the key is not there", () => {
    const result = queryJson(store, "$.store.nothing.here");
    expect(result.ok).toBe(true);
    expect(result.matches).toEqual([]);
  });
});

describe("taking more than one thing", () => {
  it("takes every child", () => {
    expect(values("$.store.book[*].price")).toEqual([8.95, 12.99, 8.99, 22.99]);
    expect(values("$.store.bicycle.*")).toEqual(["red", 19.95]);
  });

  it("looks for a key at any depth", () => {
    expect(values("$..price")).toEqual([8.95, 12.99, 8.99, 22.99, 19.95]);
    expect(values("$..isbn")).toEqual(["0-553-21311-3", "0-395-19395-8"]);
  });

  it("slices, with a step and from the end", () => {
    expect(values("$.store.book[1:3].title")).toEqual(["Sword of Honour", "Moby Dick"]);
    expect(values("$.store.book[:2].price")).toEqual([8.95, 12.99]);
    expect(values("$.store.book[2:].price")).toEqual([8.99, 22.99]);
    expect(values("$.store.book[::2].price")).toEqual([8.95, 8.99]);
    expect(values("$.store.book[-2:].price")).toEqual([8.99, 22.99]);
  });

  it("takes a union of names or of positions", () => {
    expect(values("$.store.book[0,2].title")).toEqual(["Sayings of the Century", "Moby Dick"]);
    expect(values("$.store.bicycle['color','price']")).toEqual(["red", 19.95]);
  });

  it("says where each result came from", () => {
    expect(paths("$..isbn")).toEqual(["$.store.book[2].isbn", "$.store.book[3].isbn"]);
  });
});

describe("filters", () => {
  it("compares a field to a number", () => {
    expect(values("$.store.book[?(@.price > 10)].title")).toEqual(["Sword of Honour", "The Lord of the Rings"]);
    expect(values("$.store.book[?(@.price <= 8.99)].title")).toEqual(["Sayings of the Century", "Moby Dick"]);
  });

  it("compares a field to a string", () => {
    expect(values("$.store.book[?(@.category == 'reference')].title")).toEqual(["Sayings of the Century"]);
    expect(values("$.store.book[?(@.category != 'fiction')]").length).toBe(1);
  });

  it("takes a bare path as 'this exists'", () => {
    expect(values("$.store.book[?(@.isbn)].title")).toEqual(["Moby Dick", "The Lord of the Rings"]);
    // Not merely present — present and meaning something.
    expect(values("$[?(@.a)]", [{ a: null }, { a: false }, { a: 0 }, { a: 1 }])).toEqual([{ a: 0 }, { a: 1 }]);
  });

  it("joins tests with and, or, not and parentheses", () => {
    expect(values("$.store.book[?(@.category == 'fiction' && @.price < 10)].title")).toEqual(["Moby Dick"]);
    expect(values("$.store.book[?(@.price < 9 || @.price > 20)].title")).toEqual([
      "Sayings of the Century",
      "Moby Dick",
      "The Lord of the Rings",
    ]);
    expect(values("$.store.book[?(!@.isbn)].title")).toEqual(["Sayings of the Century", "Sword of Honour"]);
    expect(values("$.store.book[?((@.price < 9 || @.price > 20) && @.category == 'fiction')].title")).toEqual([
      "Moby Dick",
      "The Lord of the Rings",
    ]);
  });

  it("can compare against a value from the root", () => {
    expect(values("$.store.book[?(@.price > $.expensive)].title")).toEqual([
      "Sword of Honour",
      "The Lord of the Rings",
    ]);
  });

  it("filters at any depth, and on the whole item", () => {
    expect(values("$..book[?(@.price > 20)].title")).toEqual(["The Lord of the Rings"]);
    expect(values("$[?(@ > 2)]", [1, 2, 3, 4])).toEqual([3, 4]);
  });

  it("simply does not match an item the test cannot be run on", () => {
    const result = queryJson([1, "two", { price: 5 }, null], "$[?(@.price > 1)]");
    expect(result.ok).toBe(true);
    expect(result.matches.map((m) => m.value)).toEqual([{ price: 5 }]);
  });
});

describe("a query that cannot be read", () => {
  const error = (query) => queryJson(store, query).error;

  it("says a path has to start at the document", () => {
    expect(error("store.book")).toMatch(/starts with \$/);
    expect(error("")).toMatch(/Type a path/);
  });

  it("says which bracket or quote was left open", () => {
    expect(error("$.store[0")).toMatch(/never closed/);
    expect(error("$['a")).toMatch(/never closed/);
  });

  it("says when a step is missing", () => {
    expect(error("$.")).toMatch(/which key/);
    expect(error("$..")).toMatch(/which key/);
    expect(error("$[]")).toMatch(/empty/);
  });

  it("names the character it could not use", () => {
    expect(error("$%foo")).toMatch(/cannot go here/);
  });

  it("reports rather than throws, whatever it is given", () => {
    for (const bad of ["$[?(", "$[?()]", "$[?(@ =)]", "$..[", "$['", "$[1:2:3:4]", "@@@"]) {
      expect(() => queryJson(store, bad)).not.toThrow();
    }
  });
});

describe("suggestions", () => {
  it("reads real paths off the document", () => {
    const found = suggestPaths(store);
    expect(found).toContain("$.store");
    expect(found).toContain("$.store.book");
    expect(found).toContain("$.expensive");
    // Every suggestion has to be a query that works.
    found.slice(0, 20).forEach((path) => expect(queryJson(store, path).matches.length).toBeGreaterThan(0));
  });

  it("shows one element of a list rather than all thousand", () => {
    const many = { items: Array.from({ length: 1000 }, (_, i) => ({ id: i })) };
    const found = suggestPaths(many);
    expect(found.filter((p) => p.startsWith("$.items[")).length).toBeLessThan(40);
    expect(found).toContain("$.items[0].id");
  });

  it("stops rather than walking a deep document forever", () => {
    let deep = { end: 1 };
    for (let i = 0; i < 200; i += 1) deep = { down: deep };
    expect(suggestPaths(deep).length).toBeLessThanOrEqual(40);
  });
});

describe("the summary", () => {
  it("counts in words", () => {
    expect(describeMatches([])).toBe("Nothing matched.");
    expect(describeMatches([1])).toBe("1 match");
    expect(describeMatches([1, 2])).toBe("2 matches");
  });
});

describe("size", () => {
  it("stays quick over a large document", () => {
    const big = { items: Array.from({ length: 20000 }, (_, i) => ({ id: i, keep: i % 100 === 0 })) };
    const started = Date.now();
    const result = queryJson(big, "$.items[?(@.keep == true)].id");
    expect(result.matches).toHaveLength(200);
    expect(Date.now() - started).toBeLessThan(3000);
  });
});
