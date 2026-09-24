import { describe, it, expect } from "vitest";
import { parseMarkdown, parseInline, renderHtml, toPlainText, slugify, escapeHtml } from "../markdown";
import { parseFrontMatter, parsePost, sortPosts, POSTS, getPost, formatDate, ALL_TAGS } from "../blog";
import { absoluteUrl, pageTitle, articleJsonLd, blogJsonLd, SITE_URL } from "../seo";

describe("markdown", () => {
  it("reads the blocks a post is made of", () => {
    const blocks = parseMarkdown(`# Title

An opening line
that wrapped.

## A section

- one
- two with \`code\`

1. first
2. second

> Worth pulling out.

\`\`\`json
{ "a": 1 }

{ "b": 2 }
\`\`\`

---

| Format | Read |
|---|---|
| OpenAPI | 2.0, 3.1 |
| Postman | v1, v2 |
`);
    expect(blocks.map((b) => b.type)).toEqual([
      "heading", "paragraph", "heading", "list", "list", "quote", "code", "rule", "table",
    ]);
    expect(blocks[0]).toMatchObject({ level: 1, text: "Title", id: "title" });
    expect(blocks[1].inline[0].value).toBe("An opening line that wrapped.");
    expect(blocks[3]).toMatchObject({ ordered: false });
    expect(blocks[3].items).toHaveLength(2);
    expect(blocks[3].items[1].map((n) => n.type)).toEqual(["text", "code"]);
    expect(blocks[4]).toMatchObject({ ordered: true });
    // A blank line inside a fence stays inside it.
    expect(blocks[6].value).toBe('{ "a": 1 }\n\n{ "b": 2 }');
    expect(blocks[6].language).toBe("json");
    expect(blocks[8].header.map((cell) => cell[0].value)).toEqual(["Format", "Read"]);
    expect(blocks[8].rows).toHaveLength(2);
  });

  it("reads inline marks, links and images", () => {
    const nodes = parseInline("A **bold** word, *some* emphasis, `code`, [a link](/workspace), [out](https://example.com) and ![alt](/logo.jpg).");
    expect(nodes.filter((n) => n.type === "strong")[0].value).toBe("bold");
    expect(nodes.filter((n) => n.type === "em")[0].value).toBe("some");
    expect(nodes.filter((n) => n.type === "code")[0].value).toBe("code");
    expect(nodes.filter((n) => n.type === "link").map((n) => n.href)).toEqual(["/workspace", "https://example.com"]);
    expect(nodes.filter((n) => n.type === "image")[0]).toMatchObject({ src: "/logo.jpg", alt: "alt" });
  });

  it("renders HTML that escapes everything a post could inject", () => {
    const html = renderHtml(parseMarkdown(`## <script>alert(1)</script>

A paragraph with <b>tags</b> & an "amp".

\`\`\`html
<img src=x onerror=alert(1)>
\`\`\`

[click](javascript:alert(1))
`));
    expect(html).not.toMatch(/<script>alert/);
    expect(html).not.toMatch(/<b>tags<\/b>/);
    expect(html).not.toMatch(/<img src=x/);
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
    // A link the page would refuse to follow keeps its words and loses the link.
    expect(html).not.toContain("javascript:");
    expect(html).toContain("click");
    expect(escapeHtml(`<&">'`)).toBe("&lt;&amp;&quot;&gt;&#39;");
  });

  it("renders headings with ids, lists, quotes and tables", () => {
    const html = renderHtml(parseMarkdown("## A Heading, Here!\n\n- x\n\n> q\n\n| a |\n|---|\n| b |"));
    expect(html).toContain('<h2 id="a-heading-here">A Heading, Here!</h2>');
    expect(html).toContain("<ul><li>x</li></ul>");
    expect(html).toContain("<blockquote>q</blockquote>");
    expect(html).toContain("<th>a</th>");
    expect(slugify("Ünïcode — and punctuation!")).toBe("ünïcode-and-punctuation");
    expect(toPlainText(parseMarkdown("# H\n\nOne. \n\nTwo."))).toBe("One. Two.");
  });

  it("survives an empty or odd document", () => {
    expect(parseMarkdown("")).toEqual([]);
    expect(parseMarkdown("   \n\n  ")).toEqual([]);
    expect(renderHtml(parseMarkdown("```\nunclosed"))).toBe("<pre><code>unclosed</code></pre>");
    expect(parseInline("")).toEqual([]);
  });
});

describe("posts", () => {
  const raw = `---
title: A Post
description: What it is about.
date: 2026-02-01
author: Someone
tags: OpenAPI, How to
---

# A Post

${"word ".repeat(400)}

## Section one

Text.

### Deeper

More.
`;

  it("reads front matter, reading time and headings", () => {
    const post = parsePost(raw, "a-post");
    expect(post).toMatchObject({
      slug: "a-post",
      title: "A Post",
      description: "What it is about.",
      date: "2026-02-01",
      author: "Someone",
      draft: false,
    });
    expect(post.tags).toEqual(["OpenAPI", "How to"]);
    expect(post.readingMinutes).toBe(2); // 400 words at 200 a minute
    // The H1 is the page heading, so the body does not repeat it.
    expect(post.blocks.some((b) => b.type === "heading" && b.level === 1)).toBe(false);
    expect(post.headings.map((h) => h.text)).toEqual(["Section one", "Deeper"]);
  });

  it("falls back to the first heading and the opening text", () => {
    const post = parsePost("# Only a heading\n\nThe opening line.", "x");
    expect(post.title).toBe("Only a heading");
    expect(post.description).toBe("The opening line.");
    expect(post.readingMinutes).toBe(1);
    expect(parseFrontMatter("no front matter").data).toEqual({});
    expect(parsePost("", "empty").title).toBe("empty");
  });

  it("keeps drafts off the site and sorts newest first", () => {
    expect(parsePost("---\ndraft: true\n---\n# D", "d").draft).toBe(true);
    const sorted = sortPosts([
      { title: "B", date: "2026-01-01" },
      { title: "C", date: "" },
      { title: "A", date: "2026-05-01" },
    ]);
    expect(sorted.map((p) => p.title)).toEqual(["A", "B", "C"]);
  });

  it("publishes the posts in src/content/blog, and no drafts", () => {
    expect(POSTS.length).toBeGreaterThan(0);
    expect(POSTS.every((post) => !post.draft)).toBe(true);
    expect(POSTS.some((post) => post.slug === "_template")).toBe(false);
    const post = getPost("how-vizroute-reads-an-openapi-file");
    expect(post).toBeTruthy();
    expect(post.title).toMatch(/OpenAPI/);
    expect(post.description.length).toBeGreaterThan(60);
    expect(post.blocks.length).toBeGreaterThan(5);
    expect(getPost("nothing-here")).toBeNull();
    expect(ALL_TAGS.length).toBeGreaterThan(0);
  });

  it("formats a date, and leaves a bad one alone", () => {
    expect(formatDate("2026-09-23")).toBe("23 September 2026");
    expect(formatDate("")).toBe("");
    expect(formatDate("soon")).toBe("soon");
  });
});

describe("seo", () => {
  it("builds absolute URLs and titles", () => {
    expect(absoluteUrl("/blog")).toBe(`${SITE_URL}/blog`);
    expect(absoluteUrl("blog")).toBe(`${SITE_URL}/blog`);
    expect(absoluteUrl("https://other.example/x")).toBe("https://other.example/x");
    expect(pageTitle("Blog")).toBe("Blog — Vizroute");
    expect(pageTitle()).toMatch(/^Vizroute — /);
  });

  it("describes a post the way a search result reads it", () => {
    const post = getPost("how-vizroute-reads-an-openapi-file");
    const json = articleJsonLd(post);
    expect(json["@type"]).toBe("BlogPosting");
    expect(json.headline).toBe(post.title);
    expect(json.url).toBe(`${SITE_URL}/blog/${post.slug}`);
    expect(json.datePublished).toBe(post.date);
    expect(json.publisher.name).toBe("Vizroute");
    expect(blogJsonLd(POSTS).blogPost).toHaveLength(POSTS.length);
  });
});
