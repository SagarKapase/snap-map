import { estimateTokens, scrub } from "./context";
import { impactOf } from "../contractGraph";
import { toJsonText } from "../format";

/**
 * "Ask the estate": the assistant over a Contract Graph.
 *
 * The model gets one line per service and a small set of tools that read
 * what the graph engine already computed — shared entities, duplicated
 * endpoints, concepts, findings, dependencies — plus two that act on the
 * page: highlight services on the map, open a tab. Nothing is answered from
 * memory; every claim traces back to a tool result the user can open.
 */

const MAX_TOOL_RESULT_CHARS = 9000;

export const GRAPH_SUGGESTIONS = [
  "Summarise this estate: what does each service own?",
  "Which services would be affected if Customers changed?",
  "Where is the same concept named differently across services?",
  "Which endpoints are duplicated between services, and which copy should go?",
  "What are the most serious findings, and what should we fix first?",
];

export const GRAPH_TOOLS = [
  {
    type: "function",
    function: {
      name: "get_service",
      description: "Everything the graph knows about one service: servers, operations, entities with their fields, and its relationships with other services. Pass the id from the index, e.g. svc_ab12.",
      parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_entity",
      description: "An entity exposed by more than one service: each service's shape side by side and where they disagree. Pass the entity name, e.g. Address.",
      parameters: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
    },
  },
  {
    type: "function",
    function: {
      name: "list_duplicates",
      description: "Endpoints that duplicate or nearly duplicate each other across services, with the evidence and a score.",
      parameters: { type: "object", properties: { limit: { type: "integer", description: "Default 30" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "list_concepts",
      description: "Fields that mean the same thing across services. By default only concepts with more than one name; pass all=true for every shared field. Pass name to read one concept in full.",
      parameters: {
        type: "object",
        properties: { name: { type: "string" }, all: { type: "boolean" }, limit: { type: "integer", description: "Default 40" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_findings",
      description: "The graph's findings across the estate: inconsistent entities, duplicated endpoints, naming, security, structure. Each has a severity.",
      parameters: {
        type: "object",
        properties: {
          severity: { type: "string", description: "high, medium or info. Omit for all." },
          category: { type: "string", description: "consistency, duplication, naming, security or structure. Omit for all." },
          limit: { type: "integer", description: "Default 40" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "impact_of",
      description: "Which services depend on this one — through calls and entity references — and so may break when it changes.",
      parameters: { type: "object", properties: { id: { type: "string", description: "Service id" } }, required: ["id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "highlight_services",
      description: "Highlight services on the user's map and select the first. Call this whenever the user asks to see, show or point out services.",
      parameters: {
        type: "object",
        properties: {
          ids: { type: "array", items: { type: "string" } },
          reason: { type: "string", description: "One short phrase shown as a label" },
        },
        required: ["ids"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "open_tab",
      description: "Switch the page to a tab: map, entities, duplicates, concepts or findings. Use it when the answer is best read there.",
      parameters: { type: "object", properties: { tab: { type: "string" } }, required: ["tab"] },
    },
  },
];

const SYSTEM_RULES = `You are the assistant inside Vizroute's Contract Graph, a map of many API contracts (OpenAPI, Postman collections, WSDL) loaded as services. Below is the index: one line per service in the form "[[svc-id]] Name — details", then the estate's totals.

How to work:
- Answer from the graph. If the index or a tool result does not say something, say the graph does not show it. Never invent services, endpoints, fields or relationships.
- The index is a summary. Call get_service before describing a service's operations or entities; get_entity for how an entity differs between services; list_duplicates, list_concepts and list_findings for those questions; impact_of for "what breaks if".
- A "consumer" service is a collection of requests (it calls others and owns nothing).
- Whenever you mention a service, write its id in double brackets exactly as in the index, e.g. "[[svc_ab12]]" — the UI renders that as a clickable chip with the service name, so do not repeat the name next to it.
- When the user asks to see, show or point out services, call highlight_services with their ids. When an answer is a list the page already has (entities, duplicates, concepts, findings), call open_tab as well.
- Evidence matters: relationships and concepts carry the rule and confidence they were built from; mention them when they qualify a claim (for example "matched by path shape, 60% confidence").
- Be concise and concrete. Use short markdown: bold for emphasis, bullet lists, fenced code blocks for JSON or paths. No headings larger than ###. No preamble, no closing summary.`;

/** The one-line-per-service index the model starts from. */
export const buildGraphIndex = (graph) => {
  const lines = graph.services.map((s) => {
    const entities = s.entities.slice(0, 8).map((e) => e.name).join(", ");
    const more = s.entities.length > 8 ? `, +${s.entities.length - 8}` : "";
    const server = s.servers[0] ? ` · ${s.servers[0]}` : "";
    return `[[${s.id}]] ${s.name} — ${s.isCollection ? "consumer collection" : s.formatLabel}, ${s.operations.length} operations${entities ? `, entities: ${entities}${more}` : ""}${server}`;
  });
  const st = graph.stats;
  const totals = `Totals: ${st.services} services, ${st.operations} operations, ${st.entities} entities, ${st.sharedEntities} shared (${st.inconsistentEntities} with differing shapes), ${st.duplicates} duplicated endpoints, ${st.edges} relationships, ${st.concepts} shared concepts, ${st.findings} findings.`;
  const text = [...lines, "", totals].join("\n");
  return { text, tokens: estimateTokens(text), services: graph.services.length };
};

export const buildGraphSystemPrompt = (graph) => {
  const index = buildGraphIndex(graph);
  return { text: `${SYSTEM_RULES}\n\n${index.text}`, index };
};

const clip = (text) => (text.length > MAX_TOOL_RESULT_CHARS ? `${text.slice(0, MAX_TOOL_RESULT_CHARS)}\n… (truncated)` : text);

const cleanId = (id) => String(id || "").replace(/^\[\[|\]\]$/g, "").trim();

/**
 * Answers tool calls for one graph. `actions` are what the page lets the
 * assistant do: `highlightServices(ids, reason)` and `openTab(tab)`.
 */
export const createGraphToolRunner = ({ graph, actions = {} }) => {
  const byId = new Map(graph.services.map((s) => [s.id, s]));
  const nameOf = (id) => byId.get(id)?.name || id;
  const edgeLine = (e) => `${e.kind} → [[${e.to}]] (${Math.round(e.confidence * 100)}%): ${e.evidence.slice(0, 3).join("; ")}${e.evidence.length > 3 ? `; +${e.evidence.length - 3} more` : ""}`;

  return (name, args = {}) => {
    switch (name) {
      case "get_service": {
        const s = byId.get(cleanId(args.id));
        if (!s) return `No service with id ${args.id}. Ids come from the index and look like svc_ab12.`;
        const out = {
          id: s.id,
          name: s.name,
          format: s.formatLabel,
          consumer: s.isCollection,
          servers: s.servers,
          operations: s.operations.map((o) => `${o.method} ${o.path}${o.auth.length ? "" : " (no auth)"}`),
          entities: s.entities.map((e) => ({ name: e.name, inferred: e.inferred, fields: e.fields.map((f) => `${f.name}:${f.type}${f.required ? "*" : ""}`) })),
          outgoing: graph.edges.filter((e) => e.from === s.id).map(edgeLine),
          incoming: graph.edges.filter((e) => e.to === s.id).map((e) => `[[${e.from}]] ${e.kind} this (${Math.round(e.confidence * 100)}%)`),
        };
        return clip(scrub(toJsonText(out)));
      }
      case "get_entity": {
        const wanted = String(args.name || "").toLowerCase();
        const entity = graph.entities.find((e) => e.name.toLowerCase() === wanted || e.key === wanted);
        if (!entity) {
          const names = graph.entities.map((e) => e.name);
          return names.length ? `No shared entity named "${args.name}". Shared entities: ${names.join(", ")}.` : "No entity is exposed by more than one service.";
        }
        const out = {
          name: entity.name,
          services: entity.services.map((id) => `[[${id}]]`),
          consistent: entity.consistent,
          shapes: entity.occurrences.map((o) => ({ service: `[[${o.serviceId}]] ${nameOf(o.serviceId)}`, as: o.name, inferred: o.inferred, fields: o.fields.map((f) => `${f.name}:${f.type}${f.required ? "*" : ""}`) })),
          differences: entity.comparisons.map((c) => ({
            between: [`[[${c.left.serviceId}]]`, `[[${c.right.serviceId}]]`],
            onlyInFirst: c.onlyLeft,
            onlyInSecond: c.onlyRight,
            typeConflicts: c.typeConflicts,
          })),
        };
        return clip(toJsonText(out));
      }
      case "list_duplicates": {
        const limit = Math.min(Number(args.limit) || 30, 100);
        if (!graph.duplicateEndpoints.length) return "No endpoint is duplicated across services.";
        const lines = graph.duplicateEndpoints.slice(0, limit).map((d) =>
          `- ${d.kind} (${Math.round(d.score * 100)}%) ${d.method} ${d.shape}: [[${d.operations[0].serviceId}]] ${d.operations[0].path} and [[${d.operations[1].serviceId}]] ${d.operations[1].path} — ${d.evidence.join("; ")}`);
        return clip(`${graph.duplicateEndpoints.length} in total.\n${lines.join("\n")}`);
      }
      case "list_concepts": {
        if (args.name) {
          const wanted = String(args.name).toLowerCase();
          const c = graph.concepts.find((x) => x.key === wanted || x.names.some((n) => n.toLowerCase() === wanted) || x.canonical.toLowerCase() === wanted);
          if (!c) return `No shared concept matches "${args.name}".`;
          return clip(toJsonText({ key: c.key, names: c.names, rule: c.rule, confidence: c.confidence, types: c.types, members: c.members.map((m) => `[[${m.serviceId}]] ${m.on}: ${m.name} (${m.type}${m.example !== undefined ? `, e.g. ${m.example}` : ""}) — ${m.rule}`) }));
        }
        const list = (args.all ? graph.concepts : graph.concepts.filter((c) => c.divergentNames || c.divergentTypes));
        if (!list.length) return graph.concepts.length ? "Every shared concept is spelled the same way everywhere." : "No field appears in more than one service.";
        const limit = Math.min(Number(args.limit) || 40, 120);
        const lines = list.slice(0, limit).map((c) => `- ${c.canonical}: ${c.names.join(" / ")} in ${c.services.map((id) => `[[${id}]]`).join(", ")} — ${c.rule}, ${Math.round(c.confidence * 100)}%${c.divergentTypes ? ` — TYPES DIFFER: ${c.types.join(", ")}` : ""}`);
        return clip(`${list.length} concept${list.length === 1 ? "" : "s"}.\n${lines.join("\n")}`);
      }
      case "list_findings": {
        const severity = String(args.severity || "").toLowerCase();
        const category = String(args.category || "").toLowerCase();
        const limit = Math.min(Number(args.limit) || 40, 120);
        const matching = graph.findings.filter((f) => (!severity || f.severity === severity) && (!category || f.category === category));
        if (!matching.length) return "No findings match.";
        const lines = matching.slice(0, limit).map((f) => `- (${f.severity}) ${f.category}: ${f.title}${f.detail ? ` — ${f.detail}` : ""} ${f.services.map((id) => `[[${id}]]`).join(" ")}`);
        return clip(scrub(`${matching.length} finding${matching.length === 1 ? "" : "s"}.\n${lines.join("\n")}`));
      }
      case "impact_of": {
        const id = cleanId(args.id);
        if (!byId.has(id)) return `No service with id ${args.id}.`;
        const affected = impactOf(graph, id);
        if (!affected.length) return `Nothing in the graph depends on [[${id}]] through calls or references.`;
        const why = affected.map((a) => {
          const edges = graph.edges.filter((e) => e.from === a && e.to === id && e.kind !== "shares");
          return `- [[${a}]]: ${edges.length ? edges.map((e) => `${e.kind} (${Math.round(e.confidence * 100)}%)`).join(", ") : "indirectly, through another dependent"}`;
        });
        return `${affected.length} service${affected.length === 1 ? "" : "s"} depend on [[${id}]]:\n${why.join("\n")}`;
      }
      case "highlight_services": {
        const ids = (Array.isArray(args.ids) ? args.ids : []).map(cleanId).filter((id) => byId.has(id));
        if (!ids.length) return "None of those ids exist; nothing was highlighted.";
        actions.highlightServices?.(ids, String(args.reason || ""));
        return `Highlighted ${ids.map(nameOf).join(", ")} on the map.`;
      }
      case "open_tab": {
        const tab = String(args.tab || "").toLowerCase();
        if (!["map", "entities", "duplicates", "concepts", "findings"].includes(tab)) return `Unknown tab "${args.tab}".`;
        actions.openTab?.(tab);
        return `Opened the ${tab} tab.`;
      }
      default:
        return `Unknown tool ${name}.`;
    }
  };
};

export const describeGraphStep = (name, args = {}) => {
  switch (name) {
    case "get_service": return `Read service ${args.id}`;
    case "get_entity": return `Compared entity ${args.name}`;
    case "list_duplicates": return "Listed duplicated endpoints";
    case "list_concepts": return args.name ? `Read concept ${args.name}` : "Listed concepts";
    case "list_findings": return `Read findings${args.severity ? ` (${args.severity})` : ""}`;
    case "impact_of": return `Computed impact of ${args.id}`;
    case "highlight_services": return `Highlighted ${Array.isArray(args.ids) ? args.ids.length : 0} on the map`;
    case "open_tab": return `Opened the ${args.tab} tab`;
    default: return name;
  }
};
