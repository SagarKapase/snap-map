/**
 * The landing page's own words, in one place.
 *
 * The page renders in the browser, but `scripts/seo.mjs` writes a static
 * copy of `/` for crawlers that do not run JavaScript. Both read this file,
 * so the words a search engine indexes are the words a visitor sees — there
 * is no second version of the pitch to fall out of date.
 */
export const HOME_TITLE = "Vizroute — Turn any API spec into an interactive map";

export const HOME_DESCRIPTION =
  "Drop in an OpenAPI, Swagger, Postman, cURL, HAR or WSDL file and get a map you can read, send requests from, audit and diff. No account, parsed in your browser.";

export const HOME_HEADLINE = "Understand any API in a minute, not an afternoon.";

export const HOME_LEDE =
  "Drop in an OpenAPI, Swagger or Postman file — or a cURL command, a HAR recording, plain JSON — and read the shape of the API on a map. Then send a real request, audit it, diff it against the last version, and hand it on as docs, an image or a link.";

/** The sections of the page, as a crawler should see them. */
export const HOME_SECTIONS = [
  {
    heading: "Understand an API at a glance.",
    body: "A specification is a list. An API is a structure. Vizroute reads the tags, paths and operations you already wrote and draws the services, resources and operations underneath them.",
  },
  {
    heading: "Everything that comes with the map.",
    body: "Twenty-one tools, all in the same tab, all on the specification you just opened: playground, environments, mock data, load and health checks, audit, coverage, diff, breaking changes, docs, export, share links and embeds.",
  },
  {
    heading: "One API, or all of them.",
    body: "The API Map opens one specification and needs no account. Contract Graph keeps a whole estate — shared entities, duplicate endpoints, one concept under several names, and which service a change would reach.",
  },
  {
    heading: "From specification to map in seconds.",
    body: "Open a file, read the map, send a request, and pass it on. Nothing is installed and nothing is uploaded.",
  },
  {
    heading: "Built for the moments you meet an API.",
    body: "A new codebase, a partner's API, a review before release, or a handover to someone who was not in the room.",
  },
];

/** The formats the parser accepts — the strip on the page, plus WSDL,
 * which is read as a proposed REST design rather than shown in the loop. */
export const HOME_FORMATS = [
  "OpenAPI 3.1",
  "OpenAPI 3.0",
  "Swagger 2.0",
  "Postman v2",
  "Postman v1",
  "cURL",
  "HAR",
  "JSON",
  "YAML",
  "Remote URL",
  "WSDL",
];

/** schema.org for the product itself. */
export const appJsonLd = (site) => ({
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Vizroute",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Any modern browser",
  url: site,
  description:
    "Read any API specification as a map: OpenAPI, Swagger, Postman, cURL, HAR or WSDL. Parsed in your browser, with a playground, audit, coverage, diff and docs.",
  featureList: HOME_SECTIONS.map((section) => section.heading),
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  publisher: { "@type": "Organization", name: "Vizroute", url: site },
});

/** schema.org for the questions, built from the list the page renders. */
export const faqJsonLd = (faqs) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((faq) => ({
    "@type": "Question",
    name: faq.q,
    acceptedAnswer: { "@type": "Answer", text: faq.a },
  })),
});
