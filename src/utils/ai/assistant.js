import { chat } from "./client";
import {
  buildSpecIndex,
  describeEndpoint,
  describeSchema,
  endpointSummary,
  scrub,
  searchEndpoints,
} from "./context";
import { displayPath, toJsonText } from "../format";

/**
 * "Ask the map": a tool-using assistant over the loaded specification.
 *
 * The model is handed the one-line-per-endpoint index and a small set of
 * tools. Reading tools return what the spec already says; the two UI tools
 * act on the workspace — highlight endpoints on the map, filter it — so an
 * answer can point at the graph instead of describing it.
 */

const MAX_TOOL_ROUNDS = 8;
const MAX_TOOL_RESULT_CHARS = 9000;

export const SUGGESTIONS = [
  "What does this API do, in a few sentences?",
  "Which endpoints need authentication, and which don't?",
  "Show me every endpoint that deletes something",
  "How would I create a resource and then fetch it back?",
  "What is missing or inconsistent in this spec?",
];

export const TOOLS = [
  {
    type: "function",
    function: {
      name: "search_endpoints",
      description:
        "Find endpoints by words in their path, name or description. Use this before answering about endpoints not visible in the index, or to collect ids for show_on_map.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Words to look for, e.g. 'customer invoice' or 'webhook'" },
          method: { type: "string", description: "Optional HTTP method filter: GET, POST, PUT, PATCH or DELETE" },
          limit: { type: "integer", description: "Maximum results, default 20" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_endpoint",
      description:
        "Everything the spec declares about one endpoint: parameters, auth, request body schema, responses, examples and scripts. Pass the id from the index (e.g. node-12).",
      parameters: {
        type: "object",
        properties: { id: { type: "string", description: "Endpoint id such as node-12" } },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_schema",
      description: "A named schema from components/schemas or definitions, with its $refs inlined.",
      parameters: {
        type: "object",
        properties: { name: { type: "string", description: "Schema name, e.g. Customer" } },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_audit_findings",
      description:
        "Results of Vizroute's static audit of the spec: structure, documentation, responses, security and consistency problems, each with a severity.",
      parameters: {
        type: "object",
        properties: {
          severity: { type: "string", description: "error, warning or info. Omit for all." },
          category: { type: "string", description: "Structure, Documentation, Responses, Security or Consistency. Omit for all." },
          limit: { type: "integer", description: "Maximum findings, default 40" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "show_on_map",
      description:
        "Highlight endpoints on the user's map and select the first one. Call this whenever the user asks to see, show, find or point out endpoints, and after you have collected the ids.",
      parameters: {
        type: "object",
        properties: {
          ids: { type: "array", items: { type: "string" }, description: "Endpoint ids such as node-12" },
          reason: { type: "string", description: "One short phrase describing what these are, shown as a label" },
        },
        required: ["ids"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "filter_map",
      description:
        "Apply the map's own search box and method filter, so the user sees only matching endpoints. Use a short keyword, not a sentence.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Text for the search box; empty string clears it" },
          method: { type: "string", description: "GET, POST, PUT, PATCH, DELETE or 'all'" },
        },
      },
    },
  },
];

const SYSTEM_RULES = `You are the assistant inside Vizroute, a tool that draws an API specification as an interactive map. The user has a spec loaded; its index is below, one line per endpoint in the form "[[node-id]] METHOD /path — summary".

How to work:
- Answer from the specification. If the index or a tool result does not say something, say that the spec does not say it. Never invent endpoints, fields or behaviour.
- The index is a summary. Call get_endpoint before describing parameters, bodies, responses or auth of a specific endpoint; call get_schema for schema fields; call get_audit_findings when asked about quality, security or problems.
- Whenever you mention an endpoint, write its id in double brackets exactly as in the index, e.g. "[[node-12]]" — the UI renders that as a clickable chip with the method and path, so do not repeat the method and path next to it.
- When the user asks to see, show, find or point out endpoints, collect the ids and call show_on_map. When they want only a subset visible, call filter_map.
- Be concise and concrete. Use short markdown: bold for emphasis, bullet lists, and fenced code blocks for JSON, URLs or code. No headings larger than ###. No preamble, no closing summary.`;

export const buildSystemPrompt = ({ nodes, spec, format }) => {
  const index = buildSpecIndex({ nodes, spec, format });
  return {
    text: `${SYSTEM_RULES}\n\n${index.text}`,
    index,
  };
};

// ─── Tool execution ──────────────────────────

const clipResult = (text) =>
  text.length > MAX_TOOL_RESULT_CHARS
    ? `${text.slice(0, MAX_TOOL_RESULT_CHARS)}\n… (truncated)`
    : text;

/**
 * Build the function that answers tool calls for one workspace.
 *
 * `actions` are what the UI lets the assistant do: `showNodes(ids, reason)`
 * and `filterMap({ query, method })`. Both are optional; without them the
 * UI tools report that nothing was shown.
 */
export const createToolRunner = ({ nodes = [], spec = null, audit = null, actions = {} }) => {
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const groupOf = (node) => {
    const parts = [];
    let cursor = byId.get(node?.parentId);
    while (cursor && cursor.type === "folder") {
      parts.unshift(cursor.name);
      cursor = byId.get(cursor.parentId);
    }
    return parts.join(" / ");
  };

  const resolveIds = (ids) =>
    (Array.isArray(ids) ? ids : [])
      .map((id) => String(id).replace(/^\[\[|\]\]$/g, "").trim())
      .map((id) => byId.get(id))
      .filter((n) => n && n.type === "request");

  return (name, args = {}) => {
    switch (name) {
      case "search_endpoints": {
        const hits = searchEndpoints(nodes, {
          query: args.query,
          method: args.method,
          limit: Math.min(Number(args.limit) || 20, 60),
        });
        if (!hits.length) return `No endpoints match "${args.query}".`;
        return clipResult(toJsonText(hits.map((n) => endpointSummary(n, byId))));
      }
      case "get_endpoint": {
        const node = resolveIds([args.id])[0];
        if (!node) return `No endpoint with id ${args.id}. Ids look like node-12 and come from the index or search_endpoints.`;
        return clipResult(describeEndpoint(node, spec, { group: groupOf(node) }));
      }
      case "get_schema": {
        const found = describeSchema(spec, args.name);
        if (!found) {
          const names = Object.keys(spec?.components?.schemas || spec?.definitions || {});
          return names.length
            ? `No schema named "${args.name}". Available: ${names.slice(0, 60).join(", ")}${names.length > 60 ? ", …" : ""}`
            : "This specification declares no reusable schemas.";
        }
        return clipResult(`${found.name}:\n${found.text}`);
      }
      case "get_audit_findings": {
        if (!audit) return "No audit is available.";
        const severity = String(args.severity || "").toLowerCase();
        const category = String(args.category || "").toLowerCase();
        const limit = Math.min(Number(args.limit) || 40, 120);
        const matching = audit.findings.filter(
          (f) =>
            (!severity || f.severity === severity) &&
            (!category || String(f.category).toLowerCase() === category),
        );
        const lines = matching.slice(0, limit).map((f) => {
          const node = f.nodeId ? byId.get(f.nodeId) : null;
          const where = node ? ` [[${node.id}]]` : "";
          return `- (${f.severity}) ${f.category}: ${f.title}${f.detail ? ` — ${f.detail}` : ""}${where}`;
        });
        const head = `Score ${audit.score}/100 (${audit.grade}). ${audit.counts.error} errors, ${audit.counts.warning} warnings, ${audit.counts.info} notes. Showing ${lines.length} of ${matching.length}.`;
        return clipResult(scrub([head, ...lines].join("\n")));
      }
      case "show_on_map": {
        const targets = resolveIds(args.ids);
        if (!targets.length) return "None of those ids exist; nothing was shown.";
        actions.showNodes?.(targets.map((n) => n.id), String(args.reason || ""));
        return `Highlighted ${targets.length} endpoint${targets.length === 1 ? "" : "s"} on the map: ${targets
          .slice(0, 12)
          .map((n) => `${n.method} ${displayPath(n)}`)
          .join(", ")}${targets.length > 12 ? ", …" : ""}.`;
      }
      case "filter_map": {
        actions.filterMap?.({ query: args.query, method: args.method });
        return `Map filtered${args.query ? ` to "${args.query}"` : ""}${args.method && args.method !== "all" ? ` and ${String(args.method).toUpperCase()} only` : ""}.`;
      }
      default:
        return `Unknown tool ${name}.`;
    }
  };
};

/** One-line description of a tool call, for the "steps" the panel shows. */
export const describeStep = (name, args = {}) => {
  switch (name) {
    case "search_endpoints":
      return `Searched for "${args.query}"${args.method ? ` (${String(args.method).toUpperCase()})` : ""}`;
    case "get_endpoint":
      return `Read ${args.id}`;
    case "get_schema":
      return `Read schema ${args.name}`;
    case "get_audit_findings":
      return `Read audit findings${args.severity ? ` (${args.severity})` : ""}`;
    case "show_on_map":
      return `Highlighted ${Array.isArray(args.ids) ? args.ids.length : 0} on the map`;
    case "filter_map":
      return `Filtered the map${args.query ? ` to "${args.query}"` : ""}`;
    default:
      return name;
  }
};

// ─── Agent loop ──────────────────────────────

/**
 * Answer one user message.
 *
 * `history` is the visible conversation so far — user and assistant text
 * only. Tool exchanges are kept within a single turn and dropped afterwards,
 * so the context stays the size of the conversation rather than the size
 * of everything the model ever looked up.
 */
export const runAssistant = async ({
  system,
  history = [],
  userText,
  runTool,
  tools = TOOLS,
  describe = describeStep,
  signal,
  onToken,
  onStep,
}) => {
  const messages = [
    { role: "system", content: system },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userText },
  ];

  const steps = [];
  let lastUsage = null;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await chat({
      messages,
      tools,
      signal,
      maxTokens: 3000,
      onToken: (delta, full) => onToken?.(full),
    });
    lastUsage = res.usage || lastUsage;

    if (!res.toolCalls.length) {
      return { content: res.content, steps, usage: lastUsage };
    }

    messages.push({
      role: "assistant",
      content: res.content || null,
      tool_calls: res.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: tc.rawArguments || JSON.stringify(tc.args) },
      })),
    });

    for (const tc of res.toolCalls) {
      const step = { name: tc.name, args: tc.args, label: describe(tc.name, tc.args) };
      steps.push(step);
      onStep?.(step);
      let result;
      try {
        result = runTool(tc.name, tc.args);
      } catch (err) {
        result = `Tool failed: ${err?.message || err}`;
      }
      messages.push({ role: "tool", tool_call_id: tc.id, content: String(result ?? "") });
    }
  }

  // The model kept asking for tools; ask it to answer with what it has.
  messages.push({ role: "user", content: "Answer now with what you have found; do not call any more tools." });
  const final = await chat({ messages, signal, maxTokens: 3000, onToken: (delta, full) => onToken?.(full) });
  return { content: final.content, steps, usage: final.usage || lastUsage };
};
