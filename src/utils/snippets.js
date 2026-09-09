/**
 * Ready-to-paste client snippets for a parsed endpoint.
 *
 * Everything is derived from what the spec already declares — the method, the
 * resolved URL, the headers and the request body example. No values are made up.
 */

/** A quote cannot be backslash-escaped inside POSIX single quotes. */
const shellQuote = (value) => `'${String(value).replace(/'/g, "'\\''")}'`;

const BODY_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const bodyText = (body) => {
  if (body == null) return "";
  if (typeof body === "string") return body;
  try {
    return JSON.stringify(body, null, 2);
  } catch {
    return "";
  }
};

const headerPairs = (node, hasBody) => {
  const declared = (node?.headers || []).filter(
    (h) => h && h.key && String(h.key).trim(),
  );
  // A snippet that posts JSON without a content type just fails, so add the
  // client default when the spec does not declare one.
  const hasContentType = declared.some(
    (h) => h.key.trim().toLowerCase() === "content-type",
  );
  return hasBody && !hasContentType
    ? [...declared, { key: "Content-Type", value: "application/json" }]
    : declared;
};

export const buildSnippets = (node) => {
  if (!node) return [];

  const method = (node.method || "GET").toUpperCase();
  const url = String(node.path || "");
  const body = BODY_METHODS.has(method) ? bodyText(node.body) : "";
  const headers = headerPairs(node, Boolean(body));

  // ── cURL ──
  const curlLines = [`curl -X ${method} ${shellQuote(url)}`];
  headers.forEach((h) =>
    curlLines.push(`  -H ${shellQuote(`${h.key}: ${h.value}`)}`),
  );
  if (body) curlLines.push(`  --data-raw ${shellQuote(body)}`);
  const curl = curlLines.join(" \\\n");

  // ── fetch ──
  const fetchInit = [`  method: ${JSON.stringify(method)},`];
  if (headers.length) {
    fetchInit.push("  headers: {");
    headers.forEach((h) =>
      fetchInit.push(`    ${JSON.stringify(h.key)}: ${JSON.stringify(h.value)},`),
    );
    fetchInit.push("  },");
  }
  if (body) fetchInit.push(`  body: JSON.stringify(${body.replace(/\n/g, "\n  ")}),`);
  const fetchSnippet = [
    `const response = await fetch(${JSON.stringify(url)}, {`,
    ...fetchInit,
    "});",
    "",
    "const data = await response.json();",
  ].join("\n");

  // ── axios ──
  const axiosConfig = [`  method: ${JSON.stringify(method.toLowerCase())},`, `  url: ${JSON.stringify(url)},`];
  if (headers.length) {
    axiosConfig.push("  headers: {");
    headers.forEach((h) =>
      axiosConfig.push(`    ${JSON.stringify(h.key)}: ${JSON.stringify(h.value)},`),
    );
    axiosConfig.push("  },");
  }
  if (body) axiosConfig.push(`  data: ${body.replace(/\n/g, "\n  ")},`);
  const axios = [
    'import axios from "axios";',
    "",
    "const { data } = await axios({",
    ...axiosConfig,
    "});",
  ].join("\n");

  // ── Python (requests) ──
  const pythonLines = ["import requests"];
  if (body) pythonLines.push("import json");
  pythonLines.push("", `url = ${JSON.stringify(url)}`);
  if (headers.length) {
    pythonLines.push("headers = {");
    headers.forEach((h) =>
      pythonLines.push(`    ${JSON.stringify(h.key)}: ${JSON.stringify(h.value)},`),
    );
    pythonLines.push("}");
  }
  // json.loads keeps true/false/null valid without hand-translating to Python
  if (body) pythonLines.push(`payload = json.loads("""${body}""")`);
  const pyArgs = [
    "url",
    ...(headers.length ? ["headers=headers"] : []),
    ...(body ? ["json=payload"] : []),
  ].join(", ");
  pythonLines.push("", `response = requests.${method.toLowerCase()}(${pyArgs})`);
  pythonLines.push("response.raise_for_status()", "print(response.json())");
  const python = pythonLines.join("\n");

  // ── Go (net/http) ──
  const goLines = [
    "package main",
    "",
    "import (",
    '\t"fmt"',
    '\t"io"',
    '\t"net/http"',
  ];
  if (body) goLines.push('\t"strings"');
  goLines.push(")", "", "func main() {");
  if (body) {
    goLines.push(`\tbody := strings.NewReader(\`${body}\`)`);
    goLines.push(`\treq, err := http.NewRequest(${JSON.stringify(method)}, ${JSON.stringify(url)}, body)`);
  } else {
    goLines.push(`\treq, err := http.NewRequest(${JSON.stringify(method)}, ${JSON.stringify(url)}, nil)`);
  }
  goLines.push("\tif err != nil {", "\t\tpanic(err)", "\t}");
  headers.forEach((h) =>
    goLines.push(`\treq.Header.Set(${JSON.stringify(h.key)}, ${JSON.stringify(h.value)})`),
  );
  goLines.push(
    "",
    "\tres, err := http.DefaultClient.Do(req)",
    "\tif err != nil {",
    "\t\tpanic(err)",
    "\t}",
    "\tdefer res.Body.Close()",
    "",
    "\tout, _ := io.ReadAll(res.Body)",
    "\tfmt.Println(string(out))",
    "}",
  );
  const go = goLines.join("\n");

  return [
    { id: "curl", label: "cURL", language: "bash", code: curl },
    { id: "fetch", label: "fetch", language: "javascript", code: fetchSnippet },
    { id: "axios", label: "axios", language: "javascript", code: axios },
    { id: "python", label: "Python", language: "python", code: python },
    { id: "go", label: "Go", language: "go", code: go },
  ];
};
