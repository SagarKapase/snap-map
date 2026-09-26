export default {
  slug: "json-flatten",
  title: "JSON flatten and unflatten",
  seoTitle: "JSON Flatten & Unflatten — dotted keys, and back",
  description:
    "Turn nested JSON into one level of dotted keys and back again, losslessly. Export as CSV or environment lines. Runs in your browser, nothing uploaded.",
  card: "Dotted keys and back, losslessly. CSV and .env export.",
  tone: "green",
  category: "json",
  icon: "list-tree",
  keywords: [
    "json flatten",
    "flatten json online",
    "unflatten json",
    "json to csv",
    "nested json to flat",
    "json dot notation",
  ],
  intro: [
    "Flattening is how JSON gets into a spreadsheet, a form post, a config file or a database column, and unflattening is how it gets back out. Paste a document to go one way, paste dotted keys to go the other, and export the result as CSV or as environment lines.",
    "The two directions here are exact inverses, which sounds obvious and usually is not. Most implementations quietly drop empty objects and empty arrays, because there is no leaf inside them to write down — and that missing field turns up as a bug three systems downstream. An empty container is a fact about the document, so it is written out as itself and comes back as itself.",
    "The one thing that cannot be made safe is a key with the separator already inside it: {\"a.b\": 1} and {\"a\": {\"b\": 1}} flatten to exactly the same thing, and no amount of cleverness can tell them apart afterwards. Rather than pick a winner silently, those keys are listed so you can choose a different separator — slashes and double underscores both work.",
  ],
  faqs: [
    {
      q: "Can I get the original document back?",
      a: "Yes, that is the point. Flatten, then unflatten, and you have exactly what you started with — including empty objects, empty arrays, nulls and false, all of which are easy to lose on the way through.",
    },
    {
      q: "Should array indices be in brackets or dots?",
      a: "Brackets, a.b[0], read better and are what JSONPath uses. Dots, a.b.0, are what most form encoders and environment files expect. The trade-off with dots is that a numeric key can no longer be told from a position.",
    },
    {
      q: "What happens to a key that contains a dot?",
      a: "It is reported as a collision rather than guessed at, because after flattening there is genuinely no way to tell it from a nested key. Change the separator to something that does not appear in your keys and the ambiguity goes away.",
    },
    {
      q: "How does the CSV handle records with different fields?",
      a: "Every key any record has becomes a column, in the order the keys were first seen, and a record missing one gets an empty cell. Values containing commas, quotes or newlines are quoted properly, so the file opens correctly in a spreadsheet.",
    },
    {
      q: "Is anything uploaded?",
      a: "No. All of it happens in this tab, which matters because the JSON people want as a spreadsheet is usually an export with real records in it.",
    },
  ],
  hook: {
    to: "/workspace",
    label: "Open it as a map",
    when: "The document is an OpenAPI, Swagger or Postman file.",
  },
  related: ["json-formatter", "ndjson-viewer", "json-size-profiler"],
  network: false,
};
