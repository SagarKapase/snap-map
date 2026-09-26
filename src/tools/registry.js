/**
 * Every Explore Tool, as data.
 *
 * This file is imported by the app *and* by `scripts/seo.mjs` running under
 * Node, which is what makes each tool a page a search engine can read. That
 * dual life is the whole constraint: no JSX, no `import.meta.glob`, no icon
 * components, nothing from a bundler. Metadata is plain objects with static
 * imports, and the icon travels as a name that the index page looks up.
 *
 * Adding a tool is three steps: write `src/tools/<slug>/meta.js`, import it
 * here, and add its loader to `src/pages/ToolPage.jsx`.
 */
import jsonFormatter from "./json-formatter/meta.js";
import jsonDiff from "./json-diff/meta.js";
import jsonPathTester from "./jsonpath-tester/meta.js";
import jsonFlatten from "./json-flatten/meta.js";
import jsonSizeProfiler from "./json-size-profiler/meta.js";
import ndjsonViewer from "./ndjson-viewer/meta.js";

/** The groups the index page sorts by, in the order they are shown. */
export const TOOL_CATEGORIES = [
  { id: "json", label: "JSON", blurb: "Read, compare, query and reshape JSON." },
  { id: "auth", label: "Auth & CORS", blurb: "Tokens, signatures and the requests a browser will not send." },
  { id: "http", label: "HTTP", blurb: "Status codes, headers, caching and retries, explained." },
  { id: "spec", label: "API specs", blurb: "OpenAPI, Postman, cURL and HAR — validate, convert, compare." },
  { id: "xml", label: "XML & SOAP", blurb: "XML, XSD and WSDL, read properly." },
  { id: "encode", label: "Encoding & time", blurb: "Base64, URLs, timestamps and identifiers." },
  { id: "format", label: "Formats", blurb: "Conversions between the formats APIs are written in." },
];

export const TOOLS = [jsonFormatter, jsonDiff, jsonPathTester, jsonFlatten, jsonSizeProfiler, ndjsonViewer];

/**
 * Tools with a plan but no page yet, in the order docs/explore-tools.md builds
 * them. They live here rather than in the index page so there is one list of
 * what this area is, and so nothing can accidentally give one of them a route:
 * a planned tool has no slug, because it has nowhere to go.
 *
 * A name moves out of this list and into a `meta.js` as it is built.
 */
export const PLANNED = [
  { name: "JWT decoder & verifier", category: "auth" },
  { name: "CORS preflight simulator", category: "auth" },
  { name: "HMAC signature calculator", category: "auth" },
  { name: "PKCE generator", category: "auth" },
  { name: "HTTP status reference", category: "http" },
  { name: "HTTP header analyser", category: "http" },
  { name: "Cache-Control explainer", category: "http" },
  { name: "OpenAPI validator", category: "spec" },
  { name: "cURL to code", category: "spec" },
  { name: "OpenAPI ↔ Postman", category: "spec" },
  { name: "JSON to TypeScript", category: "json" },
  { name: "JSON to JSON Schema", category: "json" },
  { name: "XML & XPath", category: "xml" },
  { name: "WSDL viewer", category: "xml" },
  { name: "Base64 encoder / decoder", category: "encode" },
  { name: "Timestamp converter", category: "encode" },
];

export const toolBySlug = (slug) => TOOLS.find((tool) => tool.slug === slug) || null;

export const toolsInCategory = (id) => TOOLS.filter((tool) => tool.category === id);

/** Only the groups that have something in them, so the index has no empty shelves. */
export const populatedCategories = () =>
  TOOL_CATEGORIES.filter((category) => toolsInCategory(category.id).length > 0);

/**
 * The tools named in a tool's `related` list, skipping any that are not
 * built yet — the lists are written ahead of the build order on purpose,
 * so a later phase wires itself up by simply existing.
 */
export const relatedTools = (tool) => (tool?.related || []).map(toolBySlug).filter(Boolean);

/**
 * Find a tool by what somebody typed. Every word has to appear somewhere in
 * its name, its summary or the queries it is written for — but in any order,
 * because "json beautify" and "beautify json" are the same question.
 */
export const searchTools = (query, tools = TOOLS) => {
  const terms = String(query || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (!terms.length) return null;
  return tools.filter((tool) => {
    const haystack = [tool.title, tool.description, ...(tool.keywords || [])].join(" ").toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
};

/**
 * Planned tools matching what somebody typed. The same words, over the same
 * fields, as the search over built tools — so a search for "jwt" that finds
 * nothing can still answer honestly that it is on the way.
 */
export const searchPlanned = (query, planned = PLANNED) => {
  const terms = String(query || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (!terms.length) return planned;
  return planned.filter((entry) => {
    const haystack = `${entry.name} ${entry.category}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
};

/** What a page and a search result call this tool. */
export const toolTitle = (tool) => tool.seoTitle || `${tool.title} — Vizroute`;

/** The tool's first paragraph, for the index card and the meta description. */
export const toolSummary = (tool) => tool.intro?.[0] || tool.description;
