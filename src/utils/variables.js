/**
 * Postman-style `{{variable}}` handling.
 *
 * Two jobs live here:
 *
 *  – Resolution. A collection is mostly unreadable until `{{baseUrl}}` shows
 *    its actual value, so every declared scope is merged in Postman's own
 *    precedence order and templates are filled in from the result.
 *
 *  – Flow. Postman collections pass state between requests through scripts:
 *    a login writes `token`, and thirty other requests read it. Nothing in
 *    Postman shows that link, so the setters are read out of the scripts and
 *    matched against the requests that consume them.
 */

// `{{ }}` never nests in Postman, so a flat match is correct.
const TEMPLATE = /\{\{\s*([^{}\s][^{}]*?)\s*\}\}/g;

/** `{{$guid}}`, `{{$randomInt}}` … are generated per send and have no value. */
const isDynamic = (name) => name.startsWith("$");

/** Every variable name referenced in a piece of text. */
export const findVariables = (text) => {
  if (typeof text !== "string" || !text.includes("{{")) return [];
  const out = [];
  for (const match of text.matchAll(TEMPLATE)) out.push(match[1]);
  return out;
};

/**
 * Merge every scope into one lookup.
 *
 * Postman resolves local → data → environment → collection → global, so a
 * value set on the environment wins over the collection's default. Folder
 * variables sit between the two and are applied per request by the caller.
 */
export const collectVariables = ({ nodes = [], environment = null, globals = [] } = {}) => {
  const map = new Map();
  const put = (key, value, source, extra = {}) => {
    if (!key) return;
    map.set(key, { key, value: String(value ?? ""), source, ...extra });
  };

  globals.forEach((v) => {
    if (!v || v.enabled === false || v.disabled) return;
    put(v.key, v.value, "globals", { secret: v.secret });
  });

  const root = nodes.find((n) => n.type === "root");
  (root?.variables || []).forEach((v) => {
    if (!v || v.disabled) return;
    put(v.key, v.value, "collection", { secret: v.secret });
  });

  nodes
    .filter((n) => n.type === "folder" && Array.isArray(n.variables))
    .forEach((folder) => {
      folder.variables.forEach((v) => {
        if (!v || v.disabled) return;
        put(v.key, v.value, `folder: ${folder.name}`, { secret: v.secret });
      });
    });

  if (environment) {
    (environment.variables || []).forEach((v) => {
      if (!v || v.enabled === false || v.disabled) return;
      put(v.key, v.value, `environment: ${environment.name}`, { secret: v.secret });
    });
  }

  return map;
};

/**
 * Fill in what is known and report what is not.
 *
 * An unresolved variable is left in place rather than blanked — a URL with a
 * visible `{{token}}` in it is far more use than one with a hole.
 */
export const resolveText = (text, vars) => {
  if (typeof text !== "string" || !text.includes("{{")) {
    return { text: text ?? "", unresolved: [], dynamic: [], resolved: [] };
  }
  const unresolved = [];
  const dynamic = [];
  const resolved = [];

  const out = text.replace(TEMPLATE, (whole, rawName) => {
    const name = rawName.trim();
    if (isDynamic(name)) {
      if (!dynamic.includes(name)) dynamic.push(name);
      return whole;
    }
    const hit = vars.get(name);
    if (hit === undefined) {
      if (!unresolved.includes(name)) unresolved.push(name);
      return whole;
    }
    if (!resolved.includes(name)) resolved.push(name);
    return hit.value;
  });

  return { text: out, unresolved, dynamic, resolved };
};

/** Every template-bearing field of a request, resolved in one pass. */
export const resolveNode = (node, vars) => {
  if (!node) return null;
  const path = resolveText(node.path || "", vars);
  const headers = (node.headers || []).map((h) => ({
    key: resolveText(h.key, vars).text,
    value: resolveText(String(h.value ?? ""), vars).text,
  }));

  const unresolved = new Set(path.unresolved);
  const dynamic = new Set(path.dynamic);
  (node.headers || []).forEach((h) => {
    resolveText(String(h.value ?? ""), vars).unresolved.forEach((n) => unresolved.add(n));
    resolveText(String(h.value ?? ""), vars).dynamic.forEach((n) => dynamic.add(n));
  });

  let body = node.rawBody ?? null;
  if (typeof body === "string") {
    const out = resolveText(body, vars);
    out.unresolved.forEach((n) => unresolved.add(n));
    out.dynamic.forEach((n) => dynamic.add(n));
    body = out.text;
  }

  return {
    path: path.text,
    headers,
    body,
    unresolved: [...unresolved],
    dynamic: [...dynamic],
  };
};

// ─── Variable flow ───────────────────────────

// `pm.environment.set("token", …)` and the three sibling scopes.
const SETTERS = [
  /pm\.(?:environment|collectionVariables|globals|variables)\.set\s*\(\s*["'`]([^"'`]+)["'`]/g,
  // The pre-`pm` API, still all over older collections.
  /postman\.set(?:Environment|Global)Variable\s*\(\s*["'`]([^"'`]+)["'`]/g,
];

const GETTERS = [
  /pm\.(?:environment|collectionVariables|globals|variables)\.get\s*\(\s*["'`]([^"'`]+)["'`]/g,
  /postman\.get(?:Environment|Global)Variable\s*\(\s*["'`]([^"'`]+)["'`]/g,
];

const matchAll = (text, patterns) => {
  const out = [];
  if (typeof text !== "string" || !text) return out;
  patterns.forEach((pattern) => {
    for (const match of text.matchAll(pattern)) out.push(match[1]);
  });
  return out;
};

const scriptText = (node) =>
  `${node?.scripts?.prerequest || ""}\n${node?.scripts?.test || ""}`;

/** Every variable a request reads, whether from a template or a script. */
const consumedBy = (node) => {
  const names = new Set();
  const eat = (text) => findVariables(text).forEach((n) => !isDynamic(n) && names.add(n));

  eat(node.path);
  (node.headers || []).forEach((h) => {
    eat(h.key);
    eat(String(h.value ?? ""));
  });
  (node.params || []).forEach((p) => {
    eat(p.name);
    if (p.example !== undefined) eat(String(p.example));
  });
  (node.formFields || []).forEach((f) => {
    eat(f.key);
    eat(f.value);
  });
  // Auth credentials are templates far more often than they are literals.
  (node.auth || []).forEach((auth) => {
    (auth.values || []).forEach((v) => eat(v.value));
    eat(auth.headerName);
  });
  if (typeof node.rawBody === "string") eat(node.rawBody);
  if (node.graphql) {
    eat(node.graphql.query);
    eat(node.graphql.variables);
  }
  matchAll(scriptText(node), GETTERS).forEach((n) => names.add(n));

  return [...names];
};

/**
 * Who writes each variable, who reads it, and the edges between them.
 *
 * Order matters: a collection runs top to bottom, so a consumer that appears
 * before its producer is a genuine ordering problem and is reported as one.
 */
export const analyseVariableFlow = (nodes = [], vars = new Map()) => {
  const requests = nodes.filter((n) => n.type === "request");
  const order = new Map(requests.map((node, i) => [node.id, i]));

  const producers = new Map();
  const consumers = new Map();

  requests.forEach((node) => {
    matchAll(scriptText(node), SETTERS).forEach((name) => {
      if (!producers.has(name)) producers.set(name, []);
      if (!producers.get(name).includes(node.id)) producers.get(name).push(node.id);
    });
    consumedBy(node).forEach((name) => {
      if (!consumers.has(name)) consumers.set(name, []);
      if (!consumers.get(name).includes(node.id)) consumers.get(name).push(node.id);
    });
  });

  const edges = [];
  const orderingIssues = [];
  consumers.forEach((consumerIds, name) => {
    const producerIds = producers.get(name) || [];
    producerIds.forEach((from) => {
      consumerIds.forEach((to) => {
        if (from === to) return;
        edges.push({ from, to, variable: name });
        if (order.get(to) < order.get(from)) {
          orderingIssues.push({ variable: name, producer: from, consumer: to });
        }
      });
    });
  });

  // Read somewhere, but never written by a script and never declared.
  const missing = [];
  consumers.forEach((ids, name) => {
    if (producers.has(name) || vars.has(name)) return;
    missing.push({ name, nodeIds: ids });
  });

  // Declared but nothing ever reads it.
  const unused = [];
  vars.forEach((entry, name) => {
    if (!consumers.has(name)) unused.push({ name, source: entry.source });
  });

  return { producers, consumers, edges, missing, unused, orderingIssues };
};
