export default {
  slug: "json-diff",
  title: "JSON diff",
  seoTitle: "JSON Diff — compare two documents, not two files",
  description:
    "Compare two JSON documents structurally. Key order and formatting are ignored, arrays can be matched by position, by id or as a set. Nothing is uploaded.",
  card: "Compare two documents structurally, key order ignored.",
  tone: "blue",
  category: "json",
  icon: "git-compare",
  keywords: [
    "json diff",
    "compare json",
    "json compare online",
    "json difference",
    "diff two json files",
    "json comparison tool",
  ],
  intro: [
    "Paste two documents and see what actually changed. A text diff is the wrong tool for JSON: reformat a file and every line is different, move a key and two lines are different, and neither has changed the document at all. This compares the structures, so the answer is a list of places rather than a list of lines.",
    "Arrays are where JSON diffs usually go wrong, because an array means three different things depending on who wrote it. A tuple should be compared position by position. A list of records should be matched by id, or inserting one row at the top reports every row after it as changed. A set of tags or scopes has no order at all, and only membership matters. You choose which, and the same two documents can be read all three ways.",
    "Every change is reported with the path it happened at, what was there, what is there now, and both types — because \"the id became a string\" is usually the entire story, and it is the one thing a line-by-line diff will never tell you.",
  ],
  faqs: [
    {
      q: "Does the order of keys matter?",
      a: "No. Two documents with the same keys in a different order are the same document, and this reports no difference between them. The same goes for indentation, line endings and where the spaces are.",
    },
    {
      q: "Why did inserting one item report the whole array as changed?",
      a: "Because it is being compared by position, so everything after the insertion lines up against its neighbour. Switch the array strategy to match by key and the same comparison reports one addition instead.",
    },
    {
      q: "What does matching by key do?",
      a: "It pairs array elements by a field — id by default, though you can name any field. Records are then matched wherever they moved to, so you see that one was edited rather than that one was removed and a different one added.",
    },
    {
      q: "Is 1 the same as 1.0?",
      a: "Yes, those are the same number written two ways and no difference is reported. Two identifiers longer than a double can hold exactly are still told apart, though, because there the text is the only thing that can separate them.",
    },
    {
      q: "Can it diff two OpenAPI specifications?",
      a: "It will compare them as documents, which is often enough. For a diff that understands operations, parameters and which changes would break the clients already calling you, open both in the API Map instead.",
    },
  ],
  hook: {
    to: "/workspace",
    label: "Diff them as APIs",
    when: "Both documents are OpenAPI, Swagger or Postman files.",
  },
  related: ["json-formatter", "jsonpath-tester", "json-size-profiler"],
  network: false,
};
