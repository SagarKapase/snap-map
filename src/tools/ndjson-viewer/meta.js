export default {
  slug: "ndjson-viewer",
  title: "NDJSON viewer",
  seoTitle: "NDJSON Viewer — read JSON Lines, one record at a time",
  description:
    "Read a JSON Lines file record by record. One bad line does not stop the rest, and you can filter with a word or a JSONPath. Nothing is uploaded.",
  category: "json",
  icon: "rows",
  keywords: [
    "ndjson viewer",
    "json lines viewer",
    "jsonl viewer",
    "ndjson to json",
    "read ndjson online",
    "json lines parser",
  ],
  intro: [
    "JSON Lines is what logs, exports and streaming APIs are written in: one complete document per line, no wrapping array, no commas between. Paste or drop a file and each line is read on its own, kept with its line number.",
    "That is the whole reason it needs a viewer rather than a formatter. A JSON Lines file is not valid or invalid — line 8,412 is broken and the other fifty thousand are fine, and the only thing you want to know is which one and why. Here one bad line is reported where it is and stops nothing, so an export with a single truncated record is still readable.",
    "Filtering takes either a plain word, which searches the text of each line, or a JSONPath, which is run over the file as though it were one array — so a filter you would write against a JSON array means the same thing here. There is also a field summary showing which keys the records share and which are missing from some of them, which is usually how you find the batch that went wrong.",
  ],
  faqs: [
    {
      q: "What is NDJSON, and is it the same as JSONL?",
      a: "The same thing under two names — newline-delimited JSON, also written .jsonl or .ndjson. Each line is one complete JSON document, there is no array around them, and there are no commas at the ends of lines.",
    },
    {
      q: "What happens to a line that will not parse?",
      a: "It is reported with its line number and what went wrong, and every other line is still read. That is the point of reading a file like this line by line rather than all at once.",
    },
    {
      q: "How do I filter the records?",
      a: "Type a word to search the raw text of each line, or start with a dollar to write a JSONPath. The path runs over the file as if it were one array, so [?(@.status == 500)] after the dollar and brackets keeps only the records where that holds.",
    },
    {
      q: "Can I turn it into a normal JSON array?",
      a: "Yes, in both directions — records to one array, or an array back to one document per line. The conversion skips lines that could not be read, and says how many those were.",
    },
    {
      q: "How large a file can it take?",
      a: "It reads several thousand records at a time and tells you when it has stopped early rather than locking the tab. For a very large export, filter first: the filter runs over everything that was read in one pass.",
    },
  ],
  hook: {
    to: "/workspace",
    label: "Open it as a map",
    when: "A record is an OpenAPI, Swagger or Postman document.",
  },
  related: ["json-formatter", "jsonpath-tester", "json-flatten"],
  network: false,
};
