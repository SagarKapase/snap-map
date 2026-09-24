export default {
  slug: "json-size-profiler",
  title: "JSON size profiler",
  seoTitle: "JSON Size Profiler — find what your payload weighs",
  description:
    "See which keys and arrays account for the bytes in a JSON payload, how much the field names alone cost, and what it weighs gzipped.",
  category: "json",
  icon: "scale",
  keywords: [
    "json size",
    "json payload size",
    "reduce json size",
    "json gzip size",
    "api response size",
    "json analyzer",
  ],
  intro: [
    "\"The response is 400 KB\" is not something you can act on. \"Three quarters of it is one array of audit records nobody reads, and the field names alone are 40 KB\" is. Paste a payload and this costs every part of it, in the bytes it would actually take on the wire, and lists the heaviest paths with their share of the total.",
    "Field names are counted separately from values, because in a long list of small records they really can outweigh the data — and the fix for that is a different fix. If a quarter of your payload is the word createdTimestamp repeated nine thousand times, no amount of trimming the values will help, and that is worth knowing before you start.",
    "The gzipped figure is measured rather than estimated: browsers have a real gzip in them now, so the number shown is what the compressor produces, not a rule of thumb. It is usually the number that matters, since almost nothing is served uncompressed — and it is also why a payload full of repeated keys often costs far less than its raw size suggests.",
  ],
  faqs: [
    {
      q: "Which bytes are being counted?",
      a: "The minified document, in UTF-8. That is what goes over the wire, and it is why the total here can be much smaller than the file you pasted if that file was indented.",
    },
    {
      q: "Is the gzip figure a guess?",
      a: "No. It is produced by the browser's own compressor, so it is the real compressed length. If your browser does not offer that API the figure is left out rather than estimated.",
    },
    {
      q: "What does the key share tell me?",
      a: "How much of the payload is field names rather than data. A high share on a list of records means the shape is the cost, and shortening names or moving to a columnar response will do more than trimming values.",
    },
    {
      q: "Why is a nested path bigger than the sum of its children?",
      a: "Because a container costs its own punctuation too — braces, brackets, colons and the commas between members. Those are counted in the structure figure, and on documents made of many small objects they add up.",
    },
    {
      q: "Does the payload leave my browser?",
      a: "No. It is parsed, costed and compressed in this tab. Nothing is sent anywhere, which matters given that the payloads worth profiling are production responses.",
    },
  ],
  hook: {
    to: "/workspace",
    label: "Audit the whole API",
    when: "The document is an OpenAPI, Swagger or Postman file.",
  },
  related: ["json-formatter", "json-flatten", "json-diff"],
  network: false,
};
