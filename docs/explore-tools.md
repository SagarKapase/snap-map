# Explore Tools — build plan

A new area of the site: **Explore Tools**, reached from a nav item of that
name, holding the forty-five small utilities from section 3 of
`docs/API-Tooling-Opportunity-Map.docx` ("Small utilities that pull
developers in").

This document is the plan. It is meant to be worked through in order, one
tool at a time, and ticked off.

---

## 1. Why this exists

The opportunity map is blunt about it:

> Each is a page that ranks for a query developers type daily. The hook
> column is how the page hands someone to the main product without a pop-up.

So these are not features of the workspace. They are **entry pages**. A
developer types "jwt decoder" or "cors preflight" into a search engine at
11pm because something is broken, lands on our page, fixes their problem in
ten seconds, and sees — once, quietly, in context — that the thing they
pasted can also be opened as a map.

That purpose dictates three rules that hold for every phase:

1. **Every tool is its own URL and its own static page.** A tool that only
   exists behind JavaScript inside a tab does not rank, and ranking is the
   entire point. `/tools/jwt-decoder`, not `/tools#jwt`.
2. **Nothing is uploaded.** Same promise as the rest of the product, and it
   is a competitive advantage on exactly these queries — people paste access
   tokens and customer payloads into these boxes. Two tools need the network
   (JWKS fetch, latency checker) and both must say so on the page.
3. **Every tool hands back to the product, in context, or not at all.** The
   doc's hook column is the specification. No modals, no interstitials: a
   line that appears *because of what was pasted*. `detectFormat()` from
   `src/utils/parsers.js` already tells us when a pasted blob is an OpenAPI
   document, a Postman collection or a HAR file, so the hook can be earned
   rather than announced.

### The traffic order the doc gives

> Priority order for traffic: JSON formatter, JWT decoder, JSON diff, JSON to
> types, cURL converter, OpenAPI validator, CORS simulator, HTTP status
> reference. **The auth and CORS pages convert best because the visitor is
> stuck, not curious.**

The phases below follow that order, with one deliberate deviation noted in
Phase 5.

---

## 2. Naming: two different things called "tools"

The workspace already advertises **twenty-one tools** (`FeatureShowcase.jsx`,
`CommandPalette.jsx`) — playground, audit, diff, mock, docs, export and the
rest. Those operate *on a specification you have opened*.

The forty-five here operate on **whatever you paste, with no file and no
account**. They are a different promise and must read as one.

- Workspace tools stay "tools" — "twenty-one tools, all in the same tab".
- This area is **Explore Tools** everywhere in the UI, `/tools` in the URL,
  and "free developer tools" in page titles.
- The landing page's "Everything that comes with the map" section is *not*
  where these go. Explore Tools gets its own nav item and its own mention.

Where they overlap (OpenAPI diff exists in both), the standalone page says so
and links across: *"Diffing two whole specs? Open them on a map instead."*

---

## 3. Architecture

### Routes

```
/tools                     the index: all 45, searchable, grouped
/tools/<slug>              one tool per page
```

Both are prerendered to static HTML by `scripts/seo.mjs`, the same way blog
posts and `/` already are. That step is what makes them findable.

### Where the code lives

```
src/tools/registry.js          every tool's metadata — plain data, no JSX
src/tools/<slug>/meta.js       one tool's metadata
src/tools/<slug>/Tool.jsx      its UI
src/utils/tools/<name>.js      its pure logic
src/utils/__tests__/tools/     its tests
src/pages/ToolsIndexPage.jsx   /tools
src/pages/ToolPage.jsx         /tools/:slug — resolves the slug, lazy-loads
```

**The registry must be importable from Node**, because `scripts/seo.mjs`
reads it to prerender each page. That means: no `import.meta.glob`, no JSX,
no `lucide-react` imports in `registry.js` or any `meta.js`. This repo has
already been bitten by exactly this once — `blog.js` had to be split into a
pure `blogPost.js` so the SEO script could import it. Same discipline here,
from the first commit.

Icons therefore travel as a **string name** in metadata, resolved to a
component by a map in the index page.

### Bundle discipline

Forty-five tools must not land in the main chunk. The registry holds metadata
only; each `Tool.jsx` is behind `React.lazy()`, keyed by slug. The index page
ships metadata and no tool logic. Budget: `/tools` adds **< 15 KB gzip** to
the main bundle, each tool chunk **< 40 KB gzip**.

### The tool contract

Every `meta.js` exports one object:

```js
export default {
  slug: "jwt-decoder",
  title: "JWT decoder and verifier",
  // <60 chars — this is the <title> and the search result
  seoTitle: "JWT Decoder & Verifier — decode and check any token",
  // <160 chars — the search snippet
  description: "Decode a JSON Web Token, check its signature against a key or JWKS URL, and read every claim with expiry in your own time zone. Nothing leaves your browser.",
  category: "auth",          // json | auth | http | spec | xml | encode | format
  keywords: ["jwt decoder", "decode jwt", "jwt verify", "jws"],
  icon: "key-round",         // a name, not a component
  // The substance a crawler and a person both read. Thin pages do not rank.
  intro: "…two or three paragraphs…",
  faqs: [{ q: "…", a: "…" }],
  // The doc's hook column, shown only when it applies.
  hook: { when: "token-has-scope-claim", to: "/workspace", label: "…" },
  related: ["jwt-generator", "pkce-generator", "oauth-flow-picker"],
  network: false,            // true if the tool can make an outbound request
};
```

`intro` and `faqs` are not decoration. A page that is a heading and a
textarea is thin content, and thin content does not rank in 2026 — it is the
single biggest risk to this whole plan (see §6).

### The shared shell

`ToolShell` gives every tool the same frame so a new one is a day's work, not
a week's: title, intro, the tool itself, the contextual hook slot, the FAQ
block, related tools, and a "not what you wanted?" row back to `/tools`. It
also owns `useDocumentHead` and the JSON-LD (`SoftwareApplication` +
`FAQPage`), so no tool page can forget its own metadata.

Shared input parts, built once in Phase 1 and reused by all forty-five:
`PasteArea` (paste, drop, sample, clear, byte count), `CopyButton`,
`ResultPanel`, `ErrorLine` (line/column-precise), `SampleMenu`.

---

## 4. The phases

Each phase is shippable on its own. Within a phase the tools are listed in
build order — **one at a time, finished and tested before the next**.

Every tool, in every phase, is done when: the pure logic has unit tests
including hostile input; the page renders at 1440 and 390; the prerendered
HTML contains the intro and FAQ text; lint, tests and build are clean.

---

### Phase 1 — The chassis, and one tool

**Goal:** the whole machine, proved end to end by the highest-traffic tool on
the list.

- [x] `/tools` route, `/tools/:slug` route, lazy loading, 404 → `/tools`
- [x] `src/tools/registry.js` + the meta contract above
- [x] `ToolShell` and the shared input parts
- [x] **Explore Tools** in `LandingNav.jsx` (desktop links and mobile sheet)
- [x] **Explore Tools** in `src/components/shell/products.js` — it appears in
      the app sidebar next to Home, API Map and Contract Graph
- [x] `/tools` index: search by name and keyword, grouped by category, each
      card showing what the tool does in one line
- [x] `scripts/seo.mjs`: prerender `/tools` and every `/tools/<slug>`, add
      them to `sitemap.xml`, JSON-LD per page
- [x] **Tool 1 — JSON formatter / validator.** Pretty-print, minify, sort
      keys, JSON5 tolerance, and *line-precise* error messages — the thing
      every other formatter does badly. Hook: `detectFormat()` says the blob
      is OpenAPI/Postman/HAR → "open it as a map".

**New logic:** a tolerant JSON parser that reports `{ line, column, message }`
and recovers enough to point at trailing commas, single quotes and unquoted
keys. This is the one genuinely fiddly piece in Phase 1 and it gets reused by
a dozen later tools, so it is worth doing properly: `src/utils/tools/json.js`.

**Done.** `/tools/json-formatter` prerenders to 442 words of static HTML with
its intro, its questions and SoftwareApplication + FAQPage data; the parser
has 34 tests including hostile input; the registry has 18; and the whole area
adds nothing to the main bundle — every part of it is a lazy chunk (registry
2.0 KB gzip, index page 1.9 KB, tool 5.8 KB).

---

### Phase 2 — JSON, the everyday five

**Goal:** volume on the highest-frequency queries, all reusing Phase 1's
parser.

- [x] **JSON diff** — structural, key order ignored, array strategies
      (index / key / set). Hook: "Diff two API versions instead."
- [x] **JSONPath / JMESPath tester** — live query, result highlighting, path
      autocomplete from the document. Hook: query a playground response.
- [x] **JSON flatten / unflatten** — dotted keys ↔ nested, CSV export.
- [x] **JSON size profiler** — which keys and arrays account for the bytes,
      with a gzip estimate. Hook: payload audit for an API.
- [x] **NDJSON / JSON Lines viewer** — stream a large file, filter, sample.

**Note:** jq and JMESPath are both dropped from the JSONPath tool, and the
page says so. Each is a separate language rather than a dialect of this one.

**Done.** Five pages, 398–466 words of prerendered copy each. The diff works
on syntax trees rather than values, so two ids beyond the precision of a
double still compare as the different numbers they are, and a type change is
reported as one — "number → string" is usually the whole story. The NDJSON
filter runs a path over the file as though it were one array, which is one
pass instead of one query per line. The size profiler measures gzip with the
browser's own compressor rather than estimating it.

---

### Phase 3 — Auth and CORS

**Goal:** the pages the doc says convert best, because the visitor is stuck.
This is the most valuable phase in the plan.

- [ ] **JWT decoder + verifier** — decode, verify HS/RS/ES against a pasted
      key or a JWKS URL, explain every registered claim, show `exp`/`iat`/
      `nbf` in local time with "expired 3 minutes ago". WebCrypto only.
- [ ] **CORS preflight simulator** — origin, method, headers in; would the
      browser allow it, and *which header is missing*. Implements the actual
      Fetch spec preflight algorithm, not a checklist.
- [ ] **HMAC / webhook signature calculator** — Stripe, GitHub and Shopify
      signature schemes from a raw body, compute and verify.
- [ ] **PKCE generator** — verifier and S256 challenge pairs.
- [ ] **JWT generator** — sign test tokens (HS256/384/512, RS256, ES256).
- [ ] **OAuth scope & flow picker** — which grant for which client type, and
      the exact parameters to send.

**Honesty required, on the page:** the JWKS fetch is the first outbound
request any tool makes, and many JWKS endpoints have no CORS headers, so it
will sometimes fail through no fault of the token. The page must say that
before it happens, and `explainFetchFailure()` in `src/utils/playground.js`
already knows how to word it.

---

### Phase 4 — HTTP reference

**Goal:** long-tail queries, mostly data rather than logic, and the cheapest
traffic per hour of work in the plan.

- [ ] **HTTP status code reference** — meaning, when to use it, retry
      semantics, framework idioms. One page, deep-linkable per code
      (`/tools/http-status-codes#429`).
- [ ] **HTTP header analyser** — paste raw headers → explanation, caching
      outcome, security grade, deprecation warnings.
- [ ] **Cache-Control explainer** — "cached by the browser 5 min, by a CDN
      1 h, revalidated with ETag", in a sentence.
- [ ] **Rate-limit header decoder** — `RateLimit-*`, `X-RateLimit-*`,
      `Retry-After`; computes when to retry, in local time.
- [ ] **Retry policy advisor** — which statuses and methods are safe to
      retry, with backoff code in the visitor's language.

**Risk:** these are the pages most at risk of being thin. Each needs real
written substance, not a lookup table with a search box. Budget writing time,
not just build time.

---

### Phase 5 — Spec tools that already exist

**Goal:** eight tools for almost no new logic. This is the best
work-to-output ratio in the plan, which is why it comes before JSON→types
despite the doc ranking JSON→types higher for traffic — **swap the two if
volume matters more than breadth.**

Every one of these is already implemented for the workspace; the work is a
standalone page, a paste box and the hook.

| Tool | Reuses |
| --- | --- |
| [ ] OpenAPI validator & linter | `auditSpec`, `AUDIT_CATEGORIES` (`audit.js`), `proposeFixes` (`fixes.js`) |
| [ ] cURL → code (12 languages) | `buildSnippets` (`snippets.js`), `toCurl` (`playground.js`) |
| [ ] OpenAPI diff | `computeDiff` (`diff.js`) |
| [ ] OpenAPI ↔ Postman converter | `convertSpec`, `EXPORT_TARGETS` (`convert.js`) |
| [ ] OpenAPI 2 → 3 → 3.1 converter | `parseOpenApi` (`parsers.js`) + `convertSpec` |
| [ ] cURL / HAR → OpenAPI | `parseCurl`, `curlToCollection`, `harToCollection` (`importers.js`) |
| [ ] HAR viewer | `harToCollection` + new timeline and redaction UI |
| [ ] OpenAPI stats | `countSchemas`, `methodBreakdown` (`analysis.js`) |

**The one caveat:** `convert.js` is 1,781 lines and written for the
workspace's in-memory shape (`{ spec, nodes, origin, variables }`). Each page
needs a thin adapter from "pasted text" to that shape — `parseSpecText()` in
`readSpec.js` mostly does it already. Budget half a day for the adapter, not
for the converters.

**HAR viewer needs redaction before anything else.** A HAR file contains
cookies and auth headers. The viewer must redact by default and make
un-redacting explicit.

---

### Phase 6 — Schema and code generation

**Goal:** the highest-effort, highest-traffic group. `quicktype` is a whole
business; we are matching a slice of it.

- [ ] **JSON → JSON Schema** — infer, with required-field detection across
      *multiple* samples (the part most inferrers get wrong).
- [ ] **JSON → types** — TypeScript, Go, Python, C#, Java, Kotlin. Naming
      options, nullability, date handling. One emitter at a time; ship
      TypeScript and Go first and add languages as separate commits.
- [ ] **JSON Schema → sample** — realistic examples honouring `format` and
      `enum`. Reuses `skeletonFromSchema`/`seedBody` (`playground.js`).
- [ ] **Mock data generator** — locale-aware, deterministic with a seed.
- [ ] **JSON Patch & Merge Patch builder** — RFC 6902 and 7396, generate,
      apply, verify. Reuses Phase 2's diff.
- [ ] **JSON canonicaliser** — RFC 8785 JCS: sorted keys, normalised
      numbers, stable output for hashing and signing. Hook: the Phase 3
      signature tool.

**This phase is two to three times the size of any other.** Six emitters in
"JSON → types" alone. Treat each language as its own deliverable.

---

### Phase 7 — XML and SOAP

**Goal:** four tools from the SOAP work already in the tree — and note that
`VITE_SOAP_WORKBENCH` being off does **not** block these. The parsers are
plain modules; only the workbench page is behind the flag.

- [ ] **XML formatter, validator, XPath tester** — namespaces handled
      properly. Reuses `parseXml`, `descendants`, `resolveQName`
      (`src/utils/soap/xml.js`).
- [ ] **WSDL viewer** — operations, messages, types, endpoints as a readable
      page. Reuses `parseWsdl`, `summarizeService` (`soap/wsdl.js`).
- [ ] **SOAP envelope builder** — build a request from a WSDL operation, copy
      as cURL. Reuses `buildEnvelope`, `curlFor` (`soap/parity.js`).
- [ ] **XSD → JSON Schema** — with the ambiguities listed rather than hidden.
      Reuses `createSchemaBuilder` (`soap/jsonSchema.js`).

Low competition, high intent: nobody enjoys these queries, which is exactly
why the pages are valuable.

---

### Phase 8 — Encoders and everyday

**Goal:** small, fast, and the ones a developer bookmarks.

- [ ] **Base64 / URL / HTML encoders** — including base64url and binary-safe
      handling (the bug in most web encoders).
- [ ] **Timestamp converter** — epoch, ISO 8601, RFC 7231, time zones.
- [ ] **URL parser / builder** — components, encoding, query editing,
      template placeholders. Reuses `parseQuery`/`joinQuery`/`serializeQuery`.
- [ ] **UUID / ULID generator** — with guidance on idempotency-key header
      naming and storage windows.
- [ ] **Webhook payload library** — real example payloads for Stripe, GitHub,
      Shopify, Twilio and Slack, with schemas. *Check each provider's terms
      before shipping their payloads.*
- [ ] **API response latency checker** — time a public endpoint from the
      browser using the Resource Timing breakdown. Outbound request: say so.

---

### Phase 9 — Formats and frontier

**Goal:** the four that need a new parser each. Lowest ratio of traffic to
effort; do them last, or not at all.

- [ ] **YAML ↔ JSON ↔ TOML ↔ XML** — lossless where possible, warnings where
      not. YAML and XML readers exist; TOML is new.
- [ ] **GraphQL SDL viewer / query formatter** — needs a GraphQL parser.
- [ ] **GraphQL → REST-like outline** — depends on the above.
- [ ] **Protobuf ↔ JSON Schema** — needs a `.proto` parser. The largest
      single piece of new parsing in the plan.

**Recommendation: stop after Phase 8 and reassess.** By then there will be
real numbers on which pages bring people in, and those numbers should decide
whether Phase 9 happens at all.

---

## 5. What gets reused

Roughly a third of the forty-five are already written and need a page rather
than an implementation:

| Existing module | Feeds |
| --- | --- |
| `utils/parsers.js` | format detection for every hook; OpenAPI/Postman reading |
| `utils/convert.js` | OpenAPI↔Postman, version conversion |
| `utils/audit.js` + `fixes.js` | OpenAPI validator and linter |
| `utils/diff.js` | OpenAPI diff, JSON Patch builder |
| `utils/importers.js` | cURL→OpenAPI, HAR→OpenAPI, HAR viewer |
| `utils/snippets.js` | cURL → twelve languages |
| `utils/playground.js` | JSON Schema→sample, mock data, URL builder, fetch-failure wording |
| `utils/analysis.js` | OpenAPI stats |
| `utils/validateSchema.js` | JSON Schema validation |
| `utils/soap/*` | all four Phase 7 tools |
| `utils/markdown.js`, `utils/seo.js`, `scripts/seo.mjs` | prerendering and structured data |
| `utils/motion.js`, `landing.css` | the index page's reveals |

---

## 6. Risks, stated plainly

**Thin content is the plan's biggest threat.** Forty-five near-identical
pages of "heading + textarea" is the exact shape search engines demoted in
2024–25. Mitigation: `intro` and `faqs` are required fields in the tool
contract, the prerender writes them, and a tool without them does not ship.
If we cannot write 200 useful words about a tool, that tool does not deserve
a page.

**Sitemap and crawl budget.** Forty-five new URLs on a site whose sitemap
currently lists three. They go in the sitemap in phase order, not all at once, so a phase
can be judged before the next is indexed.

**The hook can become a pop-up by accident.** Every hook is conditional on
what was pasted and appears inline, once. If it ever appears on page load, it
has become an advert and it must be pulled.

**Clipboard safety.** People will paste production tokens and customer data.
Nothing may be persisted, logged, or put in the URL. `localStorage` is for
preferences only — never for content. This needs a test per tool, not a
promise.

**Two tools touch the network** (JWKS fetch, latency checker) and one more
could be mistaken for it (the HAR viewer reads files that *contain*
requests). Each says so above the fold.

**Maintenance.** Forty-five pages is forty-five things that can rot. The
shared shell, the shared inputs and the registry exist to keep the per-tool
surface small; anything that starts being copied between tools moves into the
shell.

---

## 7. Order of work, at a glance

| Phase | Tools | New logic | Why here |
| --- | --- | --- | --- |
| 1 | 1 | tolerant JSON parser | proves the chassis on the #1 query |
| 2 | 5 | diff, JSONPath, NDJSON | volume, all on Phase 1's parser |
| 3 | 6 | WebCrypto, CORS algorithm | converts best — visitor is stuck |
| 4 | 5 | mostly written content | cheapest traffic per hour |
| 5 | 8 | almost none | eight pages from existing code |
| 6 | 6 | six type emitters | biggest phase, biggest payoff |
| 7 | 4 | none — SOAP modules exist | low competition, high intent |
| 8 | 6 | small and self-contained | the bookmarkable ones |
| 9 | 4 | TOML, GraphQL, protobuf parsers | reassess before starting |

**45 tools. Phases 1–8 cover 41 of them.**

---

## 8. First commit — done

Phase 1, in this order:

1. `src/tools/registry.js` and one `meta.js`, with a test that every entry
   has a unique slug, a title under 60 characters and a description under
   160 — the constraint that keeps the search results readable.
2. Routes and lazy loading.
3. `ToolShell` and the shared inputs.
4. The nav item, both places.
5. `src/utils/tools/json.js` with its tests — the parser first, the UI after.
6. `/tools/json-formatter`.
7. The `scripts/seo.mjs` extension, verified by reading the prerendered HTML
   for the intro text.
8. The `/tools` index.
