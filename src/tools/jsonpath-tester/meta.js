export default {
  slug: "jsonpath-tester",
  title: "JSONPath tester",
  seoTitle: "JSONPath Tester — run a path, see where it matched",
  description:
    "Write a JSONPath and watch it match, with the exact path of every result. Filters, slices, unions and recursive descent, all in your browser.",
  category: "json",
  icon: "search-code",
  keywords: [
    "jsonpath tester",
    "jsonpath online",
    "jsonpath evaluator",
    "test jsonpath",
    "jsonpath expression",
    "json query",
  ],
  intro: [
    "Paste a document, write a path, and see what it selects as you type. Every result comes back with the concrete path it was found at — not just the value — because when an expression is nearly right the useful information is which branch it walked down and where it stopped.",
    "Those result paths are themselves valid queries, so you can click one to narrow to it and work outwards from something that already matches. The suggestions above the box are read off your own document for the same reason: the fastest way to a working expression is usually to start from one that works and edit it.",
    "Everything the syntax has room for is here: named children with a dot or in brackets, positions counted from either end, wildcards, recursive descent with two dots, slices with a step, unions, and filters with the six comparisons, and, or, not and parentheses. A filter can compare a field against a literal or against a value taken from the root of the document.",
  ],
  faqs: [
    {
      q: "What does $ mean?",
      a: "The document itself, and every path starts there. $.items[0].name reads as: the document, its items field, the first element, that element's name.",
    },
    {
      q: "How do I write a filter?",
      a: "Inside brackets, as [?(...)] — for example $.books[?(@.price > 10)]. The @ means the item being tested. A bare path such as [?(@.isbn)] tests that the field is there and is not null or false.",
    },
    {
      q: "Why did my filter match nothing?",
      a: "A filter tests the children of whatever is to its left, so it belongs after the array: $.books[?(@.price > 10)], not $[?(@.books)]. If the items are not objects, compare @ itself — $[?(@ > 2)] over a list of numbers.",
    },
    {
      q: "Does it support jq or JMESPath?",
      a: "No. Both are separate query languages rather than dialects of JSONPath, with their own syntax and their own semantics, and a tool that pretended otherwise would only waste your evening. This is JSONPath.",
    },
    {
      q: "Is my document sent anywhere?",
      a: "No. It is parsed and queried by JavaScript in this tab, which matters because the documents people need to query are usually real responses with real data in them.",
    },
  ],
  hook: {
    to: "/workspace",
    label: "Query a live response",
    when: "The document is an OpenAPI, Swagger or Postman file.",
  },
  related: ["json-formatter", "json-diff", "ndjson-viewer"],
  network: false,
};
