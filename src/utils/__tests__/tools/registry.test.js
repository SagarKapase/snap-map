import { describe, it, expect } from "vitest";
import {
  TOOLS,
  TOOL_CATEGORIES,
  toolBySlug,
  toolsInCategory,
  populatedCategories,
  relatedTools,
  toolTitle,
  toolSummary,
  searchTools,
} from "../../../tools/registry";

/**
 * The registry is the one file that both the app and the build script read,
 * and every one of these tools is a page meant to be found. These are the
 * rules that keep a search result readable and a page worth ranking — they
 * are cheap to break by hand and expensive to notice later.
 */
describe("every tool in the registry", () => {
  it.each(TOOLS.map((tool) => [tool.slug, tool]))("%s is addressable", (slug, tool) => {
    expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(toolBySlug(slug)).toBe(tool);
  });

  it("has no two tools at the same address", () => {
    const slugs = TOOLS.map((tool) => tool.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it.each(TOOLS.map((tool) => [tool.slug, tool]))("%s fits in a search result", (slug, tool) => {
    // Google shows roughly 60 characters of title and 160 of description;
    // past that the sentence is cut off mid-word in the one place it counts.
    expect(tool.seoTitle.length).toBeGreaterThan(20);
    expect(tool.seoTitle.length).toBeLessThanOrEqual(60);
    expect(tool.description.length).toBeGreaterThan(80);
    expect(tool.description.length).toBeLessThanOrEqual(160);
    expect(tool.title.length).toBeGreaterThan(5);
  });

  it.each(TOOLS.map((tool) => [tool.slug, tool]))("%s has something to read", (slug, tool) => {
    // A heading and a textarea is thin content, and thin content does not
    // rank. A tool that cannot justify 200 words does not get a page.
    expect(tool.intro.length).toBeGreaterThanOrEqual(2);
    const words = tool.intro.join(" ").split(/\s+/).length;
    expect(words).toBeGreaterThanOrEqual(120);
    expect(tool.faqs.length).toBeGreaterThanOrEqual(3);
    tool.faqs.forEach((faq) => {
      expect(faq.q.endsWith("?")).toBe(true);
      expect(faq.a.length).toBeGreaterThan(60);
    });
  });

  it.each(TOOLS.map((tool) => [tool.slug, tool]))("%s belongs to a real group", (slug, tool) => {
    expect(TOOL_CATEGORIES.map((c) => c.id)).toContain(tool.category);
    expect(tool.keywords.length).toBeGreaterThanOrEqual(3);
    expect(typeof tool.icon).toBe("string");
    // Whether it can reach the network is a claim the page makes to the
    // visitor, so it is stated rather than assumed.
    expect(typeof tool.network).toBe("boolean");
  });

  it("asks no question twice on the same page", () => {
    TOOLS.forEach((tool) => {
      const questions = tool.faqs.map((faq) => faq.q);
      expect(new Set(questions).size).toBe(questions.length);
    });
  });
});

describe("grouping", () => {
  it("lists only the groups that have tools in them", () => {
    const shown = populatedCategories().map((c) => c.id);
    expect(shown.length).toBeGreaterThan(0);
    shown.forEach((id) => expect(toolsInCategory(id).length).toBeGreaterThan(0));
    expect(shown.length).toBeLessThanOrEqual(TOOL_CATEGORIES.length);
  });

  it("names every group once", () => {
    const ids = TOOL_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("cross-links", () => {
  it("ignores a related tool that is not built yet", () => {
    // The lists are written ahead of the build order on purpose, so a later
    // phase wires itself up by existing rather than by editing every file.
    const tool = toolBySlug("json-formatter");
    expect(tool.related.length).toBeGreaterThan(0);
    relatedTools(tool).forEach((other) => expect(TOOLS).toContain(other));
  });

  it("never links a tool to itself", () => {
    TOOLS.forEach((tool) => expect(tool.related).not.toContain(tool.slug));
  });

  it("copes with nothing at all", () => {
    expect(relatedTools(null)).toEqual([]);
    expect(relatedTools({})).toEqual([]);
    expect(toolBySlug("no-such-tool")).toBeNull();
    expect(toolBySlug("")).toBeNull();
  });
});

describe("what a page calls itself", () => {
  it("prefers the search title, and falls back to the plain one", () => {
    const tool = toolBySlug("json-formatter");
    expect(toolTitle(tool)).toBe(tool.seoTitle);
    expect(toolTitle({ title: "Thing" })).toBe("Thing — Vizroute");
  });

  it("summarises from the first paragraph", () => {
    const tool = toolBySlug("json-formatter");
    expect(toolSummary(tool)).toBe(tool.intro[0]);
    expect(toolSummary({ description: "Only this." })).toBe("Only this.");
  });
});

describe("finding a tool", () => {
  it("matches the name, the summary and the queries it is written for", () => {
    expect(searchTools("formatter").map((t) => t.slug)).toContain("json-formatter");
    expect(searchTools("minify").map((t) => t.slug)).toContain("json-formatter");
    // A word only in the keyword list still finds it, which is the point of
    // keeping that list — it is what people type, not what the page says.
    expect(searchTools("beautify").map((t) => t.slug)).toContain("json-formatter");
  });

  it("does not care what order the words come in", () => {
    expect(searchTools("json beautify")).toEqual(searchTools("beautify json"));
    expect(searchTools("json beautify").length).toBe(1);
  });

  it("wants every word, not just one of them", () => {
    expect(searchTools("json formatter")).toHaveLength(1);
    expect(searchTools("json protobuf")).toHaveLength(0);
  });

  it("ignores case and stray spaces", () => {
    expect(searchTools("  JSON   Formatter ")).toHaveLength(1);
  });

  it("answers null for an empty search, so the groups show instead", () => {
    expect(searchTools("")).toBeNull();
    expect(searchTools("   ")).toBeNull();
    expect(searchTools(null)).toBeNull();
  });
});
