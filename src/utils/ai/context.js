import { resolveSchema } from "../analysis";
import { SECRET_PATTERNS } from "../audit";
import { displayPath, toJsonText } from "../format";

/**
 * What the model gets to see of a loaded specification.
 *
 * A real spec does not fit in a prompt as a document — the Shopware admin
 * API is 1,600 operations — but the parsed node graph does: one line per
 * endpoint is a few dozen tokens, and anything deeper is fetched on demand
 * through the assistant's tools. Everything that leaves the browser passes
 * through `scrub` first.
 */

// ─── Redaction ───────────────────────────────

// Header values that are credentials whatever their shape.
const AUTH_VALUE = /((?:authorization|x-api-key|api-key|apikey|x-auth-token|cookie)"?\s*[:=]\s*"?)([^"\n,}]+)/gi;
// A bearer token with a real-looking value after it.
const BEARER = /\b(Bearer|Basic|Token)\s+(?!\{\{)[A-Za-z0-9._~+/=-]{12,}/g;
// The audit's JWT pattern stops at the second dot; here the signature goes too.
const JWT = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*/g;

/** Replace anything that looks like a live credential before it is sent anywhere. */
export const scrub = (text) => {
  let out = String(text ?? "");
  out = out.replace(BEARER, "$1 [redacted]");
  out = out.replace(JWT, "[redacted]");
  SECRET_PATTERNS.forEach((re) => {
    out = out.replace(new RegExp(re.source, `${re.flags.replace("g", "")}g`), "[redacted]");
  });
  out = out.replace(AUTH_VALUE, (whole, prefix, value) =>
    value.includes("{{") || value.includes("[redacted]") ? whole : `${prefix}[redacted]`,
  );
  return out;
};

/** Roughly four characters per token — close enough to size a prompt by. */
export const estimateTokens = (text) => Math.ceil(String(text || "").length / 4);

const clip = (text, max) => {
  const s = String(text ?? "");
  return s.length > max ? `${s.slice(0, max)}…` : s;
};

// ─── Spec index ──────────────────────────────

// Leaves most of a 262k window for the conversation and the tool results.
const INDEX_CHAR_BUDGET = 160_000;
const MIN_LINES_PER_GROUP = 6;

const groupPath = (node, byId) => {
  const parts = [];
  let cursor = node;
  while (cursor && cursor.type === "folder") {
    parts.unshift(cursor.name);
    cursor = byId.get(cursor.parentId);
  }
  return parts.join(" / ");
};

const authSummary = (spec, nodes) => {
  const schemes = spec?.components?.securitySchemes || spec?.securityDefinitions;
  if (schemes && typeof schemes === "object") {
    return Object.entries(schemes).map(([name, s]) =>
      `${name}: ${[s?.type, s?.scheme, s?.in && `in ${s.in}`, s?.name].filter(Boolean).join(" ")}`,
    );
  }
  const seen = new Map();
  nodes.forEach((n) => (n.auth || []).forEach((a) => {
    const key = a.type || a.name || "unknown";
    seen.set(key, (seen.get(key) || 0) + 1);
  }));
  return [...seen.entries()].map(([type, count]) => `${type} (${count} requests)`);
};

const endpointLine = (node) => {
  const summary = node.name && node.name !== `${node.method} ${node.template || node.path}` ? node.name : "";
  return `- [[${node.id}]] ${node.method || "GET"} ${displayPath(node)}${summary ? ` — ${clip(summary, 90)}` : ""}${node.deprecated ? " (deprecated)" : ""}`;
};

/**
 * The whole API on one page: header, then every group with its endpoints.
 *
 * Groups that would overrun the budget are cut proportionally and say so,
 * so the model knows to search rather than assume the list is complete.
 */
export const buildSpecIndex = ({ nodes = [], spec = null, format = "" } = {}) => {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const root = nodes.find((n) => n.type === "root");
  const requests = nodes.filter((n) => n.type === "request");

  const head = [];
  head.push(`# ${root?.name || "API"}${root?.version ? ` — version ${root.version}` : ""}`);
  head.push(`Format: ${format || "unknown"}. ${requests.length} endpoints in ${nodes.filter((n) => n.type === "folder").length} groups.`);
  const description = spec?.info?.description?.content || spec?.info?.description || root?.description;
  if (description) head.push(`Description: ${clip(String(description).replace(/\s+/g, " "), 700)}`);
  const servers = root?.servers?.length ? root.servers : [];
  if (servers.length) head.push(`Servers: ${servers.slice(0, 5).join(", ")}`);
  const auth = authSummary(spec, requests);
  if (auth.length) head.push(`Auth: ${auth.slice(0, 8).join("; ")}`);

  const schemaNames = Object.keys(spec?.components?.schemas || spec?.definitions || {});
  if (schemaNames.length) {
    head.push(`Schemas (${schemaNames.length}): ${schemaNames.slice(0, 80).join(", ")}${schemaNames.length > 80 ? ", …" : ""}`);
  }

  const methods = {};
  requests.forEach((n) => { methods[n.method || "GET"] = (methods[n.method || "GET"] || 0) + 1; });
  head.push(`Methods: ${Object.entries(methods).map(([m, c]) => `${m} ${c}`).join(", ")}`);

  // Group requests by their parent, in the order the folders appear.
  const byParent = new Map();
  requests.forEach((n) => {
    if (!byParent.has(n.parentId)) byParent.set(n.parentId, []);
    byParent.get(n.parentId).push(n);
  });
  const groupIds = nodes.filter((n) => n.type === "folder" || n.type === "root").map((n) => n.id).filter((id) => byParent.has(id));

  const headText = head.join("\n");
  const remaining = Math.max(0, INDEX_CHAR_BUDGET - headText.length);
  const averageLine = 70;
  const budgetLines = Math.floor(remaining / averageLine);
  const total = requests.length;
  let truncated = false;

  const sections = groupIds.map((id) => {
    const group = byId.get(id);
    const items = byParent.get(id);
    const share = Math.max(MIN_LINES_PER_GROUP, Math.floor((items.length / total) * budgetLines));
    const shown = items.length > share && total > budgetLines ? items.slice(0, share) : items;
    if (shown.length < items.length) truncated = true;

    const lines = [];
    const title = group?.type === "root" ? "Ungrouped" : groupPath(group, byId) || group?.name || "Group";
    lines.push(`\n## ${title} (${items.length})`);
    if (group?.description && group.type !== "root") lines.push(clip(String(group.description).replace(/\s+/g, " "), 160));
    shown.forEach((n) => lines.push(endpointLine(n)));
    if (shown.length < items.length) {
      lines.push(`- … ${items.length - shown.length} more in this group — use search_endpoints to find them`);
    }
    return lines.join("\n");
  });

  const text = scrub(`${headText}\n${sections.join("\n")}`);
  return { text, tokens: estimateTokens(text), truncated, endpoints: total };
};

// ─── Endpoint detail ─────────────────────────

/** Drop empty branches so the model reads what is there, not what is missing. */
const prune = (value) => {
  if (Array.isArray(value)) {
    const arr = value.map(prune).filter((v) => v !== undefined);
    return arr.length ? arr : undefined;
  }
  if (value && typeof value === "object") {
    const out = {};
    Object.entries(value).forEach(([k, v]) => {
      const p = prune(v);
      if (p !== undefined) out[k] = p;
    });
    return Object.keys(out).length ? out : undefined;
  }
  if (value === null || value === undefined || value === "" || value === false) return undefined;
  return value;
};

const clipJson = (value, max) => {
  if (value === undefined || value === null) return undefined;
  const text = toJsonText(value);
  return text.length > max ? `${text.slice(0, max)}… (truncated, ${text.length.toLocaleString()} chars)` : value;
};

/**
 * Everything the spec says about one endpoint, as compact JSON.
 *
 * `$ref`s are inlined so the model does not have to ask for each schema in
 * turn, and long examples are cut — the shape matters, not the fixture.
 */
export const describeEndpoint = (node, spec = null, { maxChars = 7000, group = "" } = {}) => {
  if (!node) return "";
  const detail = {
    id: node.id,
    name: node.name,
    method: node.method,
    path: displayPath(node),
    url: node.path !== displayPath(node) ? node.path : undefined,
    template: node.template && node.template !== displayPath(node) ? node.template : undefined,
    deprecated: node.deprecated,
    description: clip(node.description, 1200),
    group: group || undefined,
    parameters: (node.params || []).map((p) => ({
      name: p.name,
      in: p.in,
      required: p.required || undefined,
      type: p.type || undefined,
      description: clip(p.description, 200) || undefined,
      example: p.example,
      inferred: p.inferred || undefined,
    })),
    headers: (node.headers || []).map((h) => ({ key: h.key, value: clip(h.value, 120) })),
    auth: (node.auth || []).map((a) => ({
      name: a.name,
      type: a.type,
      scheme: a.scheme,
      in: a.location,
      header: a.headerName,
      scopes: a.scopes?.length ? a.scopes : undefined,
      inherited: a.inherited || undefined,
    })),
    requestBody: clipJson(node.body, 1500),
    requestBodySchema: node.requestBodySchema ? clipJson(resolveSchema(spec, node.requestBodySchema), 2500) : undefined,
    formFields: node.formFields?.length ? node.formFields : undefined,
    responses: (node.responses || []).map((r) => ({
      status: r.status,
      description: clip(r.description, 200),
      contentType: r.contentType,
      schema: r.schema ? clipJson(resolveSchema(spec, r.schema), 2000) : undefined,
      example: clipJson(r.example, 1200),
    })),
    scripts: node.scripts && (node.scripts.prerequest || node.scripts.test)
      ? { prerequest: clip(node.scripts.prerequest, 1200), test: clip(node.scripts.test, 1200) }
      : undefined,
  };
  const text = scrub(toJsonText(prune(detail) || {}));
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n… (truncated)` : text;
};

/** A schema from components/definitions with its own `$ref`s inlined. */
export const describeSchema = (spec, name, { maxChars = 6000 } = {}) => {
  const table = spec?.components?.schemas || spec?.definitions || {};
  const exact = table[name];
  const key = exact ? name : Object.keys(table).find((k) => k.toLowerCase() === String(name || "").toLowerCase());
  if (!key) return null;
  const text = scrub(toJsonText(resolveSchema(spec, table[key])));
  return { name: key, text: text.length > maxChars ? `${text.slice(0, maxChars)}\n… (truncated)` : text };
};

// ─── Search ──────────────────────────────────

/**
 * Plain scoring over name, path and description. Every word in the query
 * has to hit somewhere; exact path segments and method matches rank higher.
 */
export const searchEndpoints = (nodes, { query = "", method = "", limit = 20 } = {}) => {
  const words = String(query || "").toLowerCase().split(/[\s,]+/).filter(Boolean);
  const wantMethod = String(method || "").toUpperCase();
  const scored = [];
  nodes.forEach((n) => {
    if (n.type !== "request") return;
    if (wantMethod && wantMethod !== "ALL" && n.method !== wantMethod) return;
    const path = displayPath(n).toLowerCase();
    const name = String(n.name || "").toLowerCase();
    const desc = String(n.description || "").toLowerCase();
    let score = 0;
    for (const w of words) {
      if (path.includes(w)) score += path.split("/").includes(w) ? 4 : 2;
      else if (name.includes(w)) score += 3;
      else if (desc.includes(w)) score += 1;
      else return;
    }
    scored.push({ node: n, score: score || 1 });
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(({ node }) => node);
};

/** The short form used in search results and tool output. */
export const endpointSummary = (node, byId) => ({
  id: node.id,
  method: node.method,
  path: displayPath(node),
  name: node.name,
  group: byId?.get(node.parentId)?.name || undefined,
  deprecated: node.deprecated || undefined,
});
