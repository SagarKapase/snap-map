/**
 * The questions a developer asks before dropping a file into something they
 * have never used.
 *
 * Every answer is true of the code as it stands. This list is rendered on
 * the landing page *and* emitted as FAQPage structured data by
 * scripts/seo.mjs, so a wrong answer here becomes a wrong answer in a
 * search result — which is why it lives in one place.
 */
export const FAQS = [
  {
    q: "Is my specification uploaded anywhere?",
    a: "No. The file is read in your browser and stays there: parsing, the map, the audit and the diff all run in the tab. The only requests that leave are the ones you send yourself from the playground — those go to your API, not to us.",
  },
  {
    q: "Do I need an account?",
    a: "Not for the API Map. Open a file and everything is available: map, inspector, playground, audit, coverage, diff, docs and export. An account is only needed for Contract Graph, which keeps an estate of services across visits, and for the Postman companion.",
  },
  {
    q: "Which formats can it read?",
    a: "OpenAPI 2.0, 3.0 and 3.1, Swagger, Postman collections v1 and v2, cURL commands, HAR recordings from a browser's network tab, plain JSON or YAML endpoint lists, and a remote URL it fetches for you. WSDL is read too, as a proposed REST design.",
  },
  {
    q: "Can I send real requests from the map?",
    a: "Yes. The playground sends the request you are looking at, with path and query parameters, headers, auth and environment variables filled in from the specification, and copies it as cURL. Responses come back in the same panel.",
  },
  {
    q: "What happens to the specifications I save?",
    a: "Saved collections and estates live in this browser's own storage — localStorage for the small records, IndexedDB for the documents. Clearing site data removes them, and nothing is synced unless you connect Postman yourself.",
  },
  {
    q: "Is it free?",
    a: "The API Map is free and needs no account. Contract Graph needs an account, which is free to create. There is no paid tier to buy today, and nothing asks for a card.",
  },
];
