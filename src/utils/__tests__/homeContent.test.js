import { describe, it, expect } from "vitest";
import {
  HOME_TITLE,
  HOME_DESCRIPTION,
  HOME_HEADLINE,
  HOME_LEDE,
  HOME_SECTIONS,
  HOME_FORMATS,
  appJsonLd,
  faqJsonLd,
} from "../../content/home.js";
import { FAQS } from "../../content/faqs.js";

/**
 * The landing copy is rendered twice: by the components in the browser, and
 * by `scripts/seo.mjs` into static HTML for crawlers. These guard the second
 * reader — a title that a result will truncate, an empty answer, or a
 * malformed FAQPage is invisible in development and expensive in a search
 * result.
 */
describe("the landing copy", () => {
  it("keeps the title and description inside what a result will show", () => {
    expect(HOME_TITLE.length).toBeGreaterThan(20);
    expect(HOME_TITLE.length).toBeLessThanOrEqual(60);
    expect(HOME_TITLE).toContain("Vizroute");
    expect(HOME_DESCRIPTION.length).toBeGreaterThan(80);
    expect(HOME_DESCRIPTION.length).toBeLessThanOrEqual(165);
  });

  it("says something in every slot", () => {
    expect(HOME_HEADLINE.trim()).not.toBe("");
    expect(HOME_LEDE.length).toBeGreaterThan(80);
    expect(HOME_SECTIONS.length).toBeGreaterThan(3);
    HOME_SECTIONS.forEach((section) => {
      expect(section.heading.trim()).not.toBe("");
      expect(section.body.length).toBeGreaterThan(40);
    });
  });

  it("names each section and format once", () => {
    const headings = HOME_SECTIONS.map((section) => section.heading);
    expect(new Set(headings).size).toBe(headings.length);
    expect(new Set(HOME_FORMATS).size).toBe(HOME_FORMATS.length);
    expect(HOME_FORMATS).toContain("OpenAPI 3.1");
    expect(HOME_FORMATS).toContain("WSDL");
  });
});

describe("the structured data", () => {
  it("describes the product, free and browser-based", () => {
    const json = appJsonLd("https://example.test");
    expect(json["@type"]).toBe("SoftwareApplication");
    expect(json.url).toBe("https://example.test");
    expect(json.offers.price).toBe("0");
    expect(json.featureList).toEqual(HOME_SECTIONS.map((section) => section.heading));
  });

  it("turns every question into a FAQPage entry", () => {
    const json = faqJsonLd(FAQS);
    expect(json["@type"]).toBe("FAQPage");
    expect(json.mainEntity).toHaveLength(FAQS.length);
    json.mainEntity.forEach((entry, i) => {
      expect(entry["@type"]).toBe("Question");
      expect(entry.name).toBe(FAQS[i].q);
      expect(entry.acceptedAnswer.text).toBe(FAQS[i].a);
      expect(entry.acceptedAnswer.text.length).toBeGreaterThan(40);
    });
  });

  it("survives JSON.stringify without a tag that could close the script", () => {
    const serialised = JSON.stringify([appJsonLd("https://example.test"), faqJsonLd(FAQS)]);
    expect(serialised).not.toContain("</script");
    expect(() => JSON.parse(serialised)).not.toThrow();
  });

  it("asks a question only once", () => {
    const questions = FAQS.map((faq) => faq.q);
    expect(new Set(questions).size).toBe(questions.length);
    FAQS.forEach((faq) => expect(faq.q.endsWith("?")).toBe(true));
  });
});
