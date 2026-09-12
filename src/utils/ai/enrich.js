import { chatJson } from "./client";
import { describeEndpoint, scrub } from "./context";
import { isPostmanV1, postmanV1ToV2 } from "../parsers";
import { displayPath } from "../format";

/**
 * Drafting the documentation a spec is missing.
 *
 * `fixes.js` deliberately never invents content — it moves or removes what
 * is already there. This module is the other half: summaries, descriptions,
 * operation ids and tags for the operations that have none, written from
 * the path, parameters and schemas the spec does declare. Every draft is a
 * proposal; nothing is written until the user picks it, and even then it is
 * written to a copy.
 */

const BATCH_SIZE = 18;
const CONTEXT_CHARS = 2200;

const isOpenApiFormat = (format) => /openapi|swagger/i.test(String(format || ""));

// A Postman request that was never named: "GET https://…", "New Request", the
// bare URL. The method check is case-sensitive on purpose — "Get Profile" is a
// perfectly good name.
const AUTO_NAME_RE = [
  /^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(?:https?:\/\/|\/|\{\{)/,
  /^(?:https?:\/\/|\{\{|\/)/i,
  /^(?:new request|untitled|request)$/i,
];
const AUTO_NAME = { test: (name) => AUTO_NAME_RE.some((re) => re.test(String(name || "").trim())) };

const isPostmanFormat = (spec) =>
  Boolean(spec && typeof spec === "object" && !Array.isArray(spec) && (Array.isArray(spec.item) || isPostmanV1(spec)));

const operationOf = (spec, node) => {
  if (!node?.template || !node?.method) return null;
  return spec?.paths?.[node.template]?.[node.method.toLowerCase()] || null;
};

/**
 * Walk a Postman item tree in the parser's order, so `node-N` maps back to
 * the item that produced it. The parser numbers every item — folder or
 * request — once, depth first, starting from zero.
 */
const postmanItemsById = (collection) => {
  const map = new Map();
  let id = 0;
  const walk = (items) => {
    (Array.isArray(items) ? items : []).forEach((item) => {
      const nodeId = `node-${id++}`;
      map.set(nodeId, item);
      if (Array.isArray(item.item)) walk(item.item);
    });
  };
  walk(collection?.item);
  return map;
};

// ─── Candidates ──────────────────────────────

/**
 * Which operations are missing what.
 *
 * Returns `{ candidates, infoMissing, openApi }`. Each candidate lists the
 * fields it lacks and carries enough of the endpoint for the model to write
 * from; an operation with nothing missing is not a candidate.
 */
export const findEnrichmentCandidates = ({ nodes = [], spec = null, format = "" } = {}) => {
  const openApi = isOpenApiFormat(format) && spec?.paths && typeof spec.paths === "object";
  // A custom JSON shape has no agreed place to write a description back to.
  if (!openApi && !isPostmanFormat(spec)) return { candidates: [], infoMissing: false, openApi: false };
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const candidates = [];
  const seen = new Set();

  nodes.forEach((node) => {
    if (node.type !== "request") return;
    const needs = [];

    if (openApi) {
      const op = operationOf(spec, node);
      if (!op) return;
      // Multi-tag operations appear once per tag; one draft covers them all.
      const key = `${node.method} ${node.template}`;
      if (seen.has(key)) return;
      seen.add(key);
      if (!op.summary) needs.push("summary");
      if (!op.description) needs.push("description");
      if (!op.operationId) needs.push("operationId");
      if (!Array.isArray(op.tags) || !op.tags.length) needs.push("tags");
    } else {
      if (!node.description) needs.push("description");
      if (!node.name || AUTO_NAME.test(node.name)) needs.push("name");
    }

    if (!needs.length) return;
    candidates.push({
      id: node.id,
      method: node.method,
      path: displayPath(node),
      template: node.template || "",
      name: node.name,
      group: byId.get(node.parentId)?.name || "",
      needs,
      context: describeEndpoint(node, spec, { maxChars: CONTEXT_CHARS, group: byId.get(node.parentId)?.name || "" }),
    });
  });

  const infoDescription = spec?.info?.description?.content ?? spec?.info?.description;
  const infoMissing = Boolean(spec?.info) && !String(infoDescription || "").trim();

  return { candidates, infoMissing, openApi };
};

// ─── Drafting ────────────────────────────────

const DRAFT_SCHEMA = {
  type: "object",
  properties: {
    operations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          summary: { type: "string" },
          description: { type: "string" },
          operationId: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          name: { type: "string" },
        },
        required: ["id", "summary", "description", "operationId", "tags", "name"],
        additionalProperties: false,
      },
    },
    info_description: { type: "string" },
  },
  required: ["operations", "info_description"],
  additionalProperties: false,
};

const DRAFT_RULES = `You write API reference documentation. You will receive operations from a specification, each with the fields it is missing and everything the spec declares about it.

Write only what the declared path, parameters, body and responses support. Do not invent behaviour, limits, permissions or fields that are not shown.

Field rules:
- summary: one line, sentence case, no trailing period, at most 70 characters, starts with a verb ("List customers", "Create an invoice", "Delete a webhook").
- description: one to three plain sentences: what it does, what it needs, what it returns. Mention notable parameters or status codes only if declared.
- operationId: lowerCamelCase, unique, derived from the verb and resource ("listCustomers", "getInvoiceById").
- tags: one or two nouns naming the resource ("Customers"); reuse the group name given when it fits.
- name: for Postman requests, a short human title like a summary.
- info_description: two to four sentences describing the whole API, or an empty string if not asked for.

Return an entry for every operation you were given, with its id unchanged. Leave a field as an empty string (or empty array for tags) when it was not requested for that operation.`;

const applyUnique = (proposals) => {
  // Two drafts that landed on the same operationId would fail validation later.
  const seen = new Map();
  proposals.forEach((p) => {
    const id = p.fields.operationId;
    if (!id) return;
    const count = seen.get(id) || 0;
    seen.set(id, count + 1);
    if (count) p.fields.operationId = `${id}${count + 1}`;
  });
  return proposals;
};

/**
 * Draft the missing fields for a set of candidates.
 *
 * Runs in batches; `onProgress({ done, total })` is called after each one so
 * the UI can show movement on a large spec. Resolves to
 * `{ proposals, infoDescription, usage }`, where each proposal is
 * `{ id, method, path, template, name, group, needs, fields }` and `fields`
 * holds only what was asked for and actually drafted.
 */
export const draftEnrichment = async ({
  candidates = [],
  infoMissing = false,
  apiName = "",
  apiSummary = "",
  signal,
  onProgress,
} = {}) => {
  const proposals = [];
  let infoDescription = "";
  const usage = { prompt_tokens: 0, completion_tokens: 0 };
  const batches = [];
  for (let i = 0; i < candidates.length; i += BATCH_SIZE) batches.push(candidates.slice(i, i + BATCH_SIZE));
  if (!batches.length && infoMissing) batches.push([]);

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    const askInfo = infoMissing && b === 0;

    const payload = batch.map((c) => ({
      id: c.id,
      operation: `${c.method} ${c.path}`,
      group: c.group || undefined,
      current_name: c.name,
      missing: c.needs,
      declared: c.context,
    }));

    const user = [
      `API: ${apiName || "unknown"}.`,
      apiSummary ? `Index excerpt:\n${scrub(apiSummary)}` : "",
      askInfo ? "Also write info_description for the whole API." : "info_description is not requested; return an empty string.",
      batch.length ? `Operations:\n${JSON.stringify(payload, null, 1)}` : "No operations in this batch.",
    ]
      .filter(Boolean)
      .join("\n\n");

    const { data, usage: u } = await chatJson({
      name: "enrichment",
      schema: DRAFT_SCHEMA,
      messages: [
        { role: "system", content: DRAFT_RULES },
        { role: "user", content: user },
      ],
      maxTokens: 6000,
      temperature: 0.3,
      signal,
    });
    if (u) {
      usage.prompt_tokens += u.prompt_tokens || 0;
      usage.completion_tokens += u.completion_tokens || 0;
    }

    if (askInfo && typeof data?.info_description === "string") infoDescription = data.info_description.trim();

    const byId = new Map(batch.map((c) => [c.id, c]));
    (Array.isArray(data?.operations) ? data.operations : []).forEach((op) => {
      const candidate = byId.get(String(op?.id || "").replace(/^\[\[|\]\]$/g, ""));
      if (!candidate) return;
      const fields = {};
      candidate.needs.forEach((field) => {
        const value = op[field];
        if (field === "tags") {
          const tags = (Array.isArray(value) ? value : []).map((t) => String(t).trim()).filter(Boolean);
          if (tags.length) fields.tags = tags.slice(0, 2);
        } else if (typeof value === "string" && value.trim()) {
          fields[field] = value.trim();
        }
      });
      if (Object.keys(fields).length) proposals.push({ ...candidate, context: undefined, fields });
    });

    onProgress?.({ done: Math.min((b + 1) * BATCH_SIZE, candidates.length), total: candidates.length });
  }

  return { proposals: applyUnique(proposals), infoDescription, usage };
};

// ─── Applying ────────────────────────────────

const clone = (value) => JSON.parse(JSON.stringify(value));

/**
 * Write the chosen drafts into a copy of the specification.
 *
 * Only blank fields are filled — a proposal was only ever made for a field
 * that was empty, so nothing the author wrote is overwritten. Returns
 * `{ spec, changes }` with one line per change, in the style of `applyFixes`.
 */
export const applyEnrichment = ({ spec, format, proposals = [], infoDescription = "" } = {}) => {
  if (!spec || typeof spec !== "object") return { spec, changes: [] };
  const openApi = isOpenApiFormat(format) && spec.paths;
  const draft = clone(isPostmanV1(spec) ? postmanV1ToV2(spec) : spec);
  const changes = [];

  if (openApi) {
    const topTags = Array.isArray(draft.tags) ? draft.tags : null;
    proposals.forEach((p) => {
      const op = draft.paths?.[p.template]?.[String(p.method || "").toLowerCase()];
      if (!op) return;
      const label = `${p.method} ${p.template}`;
      const { fields } = p;
      if (fields.summary && !op.summary) { op.summary = fields.summary; changes.push(`${label}: summary`); }
      if (fields.description && !op.description) { op.description = fields.description; changes.push(`${label}: description`); }
      if (fields.operationId && !op.operationId) { op.operationId = fields.operationId; changes.push(`${label}: operationId ${fields.operationId}`); }
      if (fields.tags?.length && !(Array.isArray(op.tags) && op.tags.length)) {
        op.tags = fields.tags;
        changes.push(`${label}: tags ${fields.tags.join(", ")}`);
        if (topTags) {
          fields.tags.forEach((name) => {
            if (!topTags.some((t) => t?.name === name)) topTags.push({ name });
          });
        }
      }
    });
  } else {
    const items = postmanItemsById(draft);
    proposals.forEach((p) => {
      const item = items.get(p.id);
      if (!item || Array.isArray(item.item)) return;
      const request = item.request && typeof item.request === "object" ? item.request : item;
      const label = p.name || `${p.method} ${p.path}`;
      const { fields } = p;
      const hasDescription = Boolean(
        item.description?.content || item.description || request.description?.content || request.description,
      );
      if (fields.description && !hasDescription) {
        request.description = fields.description;
        changes.push(`${label}: description`);
      }
      if (fields.name && (!item.name || AUTO_NAME.test(item.name))) {
        changes.push(`${item.name || "unnamed"} → ${fields.name}`);
        item.name = fields.name;
      }
    });
  }

  if (infoDescription) {
    if (!draft.info || typeof draft.info !== "object") draft.info = {};
    const existing = draft.info.description?.content ?? draft.info.description;
    if (!String(existing || "").trim()) {
      draft.info.description = infoDescription;
      changes.push("info.description");
    }
  }

  return { spec: draft, changes };
};
