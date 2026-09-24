/**
 * The first Explore Tool. Plain data only — `scripts/seo.mjs` imports this
 * file from Node to prerender the page, so nothing here may touch JSX,
 * `import.meta`, or a browser API.
 */
export default {
  slug: "json-formatter",
  title: "JSON formatter and validator",
  seoTitle: "JSON Formatter & Validator — with line-precise errors",
  description:
    "Format, minify and validate JSON in your browser. Line-precise errors, duplicate-key warnings, and big numbers kept exactly as written. Nothing is uploaded.",
  category: "json",
  icon: "braces",
  keywords: [
    "json formatter",
    "json validator",
    "json beautifier",
    "beautify json",
    "json linter",
    "format json online",
    "json pretty print",
    "minify json",
    "json lint",
  ],
  intro: [
    "Paste JSON and get it back readable — indented, minified, or with its keys sorted. It runs in this tab: the text is never sent anywhere, which matters because the JSON people need to format is usually a response that has somebody's data in it.",
    "When it will not parse, the message says which line and which column, and what is actually wrong there — a trailing comma, a single quote, a key without quotes, a string that was never closed. \"Unexpected token } in JSON at position 2471\" is not an answer to anybody's question.",
    "Two things this does that most formatters do not. Big numbers survive: an id like 12345678901234567890 is larger than JavaScript can hold, and a formatter that reads it into a number and writes it back has quietly changed your data — here every value is re-emitted exactly as it was written. And duplicate keys are reported rather than silently collapsed, because {\"id\": 1, \"id\": 2} is valid to every parser and loses the first value without a word.",
  ],
  faqs: [
    {
      q: "Is my JSON uploaded anywhere?",
      a: "No. It is parsed by JavaScript in this tab and never leaves your browser. There is no request to send it in, and no server here that could receive it.",
    },
    {
      q: "Why do other formatters change my large numbers?",
      a: "Most read the document into JavaScript values and write those back out. JavaScript numbers are 64-bit floats, so an integer beyond about 9 quadrillion loses its last digits on the way through. This tool keeps the text of every number exactly as you wrote it, so nothing is rounded.",
    },
    {
      q: "Can it read JSON with comments or trailing commas?",
      a: "Yes. A config file with comments, a trailing comma, single quotes or unquoted keys will be read and tidied, and each thing it had to forgive is listed so you know what changed. Turn on strict mode to have those reported as errors instead.",
    },
    {
      q: "What does it do about duplicate keys?",
      a: "It tells you. The last value wins — that is what JSON.parse does too — but you get the key, the path to it, and both line numbers, which is usually enough to find the bug that produced it.",
    },
    {
      q: "How large a file can it handle?",
      a: "A few megabytes is comfortable. It is a single pass over the text with no regular expressions doing the heavy work, so a large OpenAPI document formats in well under a second.",
    },
  ],
  // The doc's hook column: where this page hands someone on, and when.
  hook: {
    to: "/workspace",
    label: "Open it as a map",
    when: "The pasted document is an OpenAPI, Swagger or Postman file.",
  },
  related: ["json-diff", "json-path", "openapi-validator"],
  network: false,
};
