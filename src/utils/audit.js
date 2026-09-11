import { validateExample } from "./validateSchema";

/**
 * Static audit of a loaded specification.
 *
 * Two rule families run against every import: generic rules derived from the
 * parsed nodes (they work for Postman collections and plain JSON too), and
 * OpenAPI/Swagger rules that read the source document. Nothing here sends a
 * request — it is all static analysis of what the spec already says.
 */

const CATEGORY = {
  STRUCTURE: "Structure",
  DOCS: "Documentation",
  RESPONSES: "Responses",
  SECURITY: "Security",
  CONSISTENCY: "Consistency",
};

const WEIGHT = { error: 5, warning: 2, info: 0.5 };
// One noisy rule should dent the score, not destroy it.
const MAX_HITS_PER_RULE = 5;

const isOpenApiFormat = (format) => /openapi|swagger/i.test(String(format || ""));

/** Credentials that look real rather than placeholder. */
const SECRET_PATTERNS = [
  /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{12,}/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./, // JWT
  /\bgh[pousr]_[A-Za-z0-9]{20,}/, // GitHub token
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/, // Slack token
  /\bAKIA[0-9A-Z]{16}\b/, // AWS access key id
];

// Matches a bare verb segment ("delete") and compound ones ("getUser",
// "create_order", "list-pets").
const VERB_SEGMENT =
  /^(get|post|create|update|delete|remove|fetch|list|add|edit|put|insert|retrieve)([A-Z_-].*)?$/;

/** Strip scheme + host so rules reason about the path only. */
const pathOf = (url) => {
  const raw = String(url || "");
  const match = raw.match(/^[a-zA-Z][\w+.-]*:\/\/[^/?#]+([/?#].*)?$/);
  const withQuery = match ? match[1] || "/" : raw;
  return withQuery.split("?")[0];
};

const segmentsOf = (url) =>
  pathOf(url)
    .split("/")
    .filter(Boolean)
    .filter((seg) => !/^[{:]/.test(seg));

const label = (node) =>
  `${node.method || ""} ${pathOf(node.path) || node.name || ""}`.trim();

/** Every "#/components/schemas/Name" (or Swagger "#/definitions/Name") used. */
const referencedNames = (spec) => {
  const used = new Set();
  let text = "";
  try {
    text = JSON.stringify(spec);
  } catch {
    return used;
  }
  const re = /#\/(?:components\/schemas|definitions)\/([^"'/]+)/g;
  let m;
  while ((m = re.exec(text)) !== null) used.add(m[1]);
  return used;
};

const collectSecrets = (value, hits, trail = "") => {
  if (hits.length > 6) return;
  if (typeof value === "string") {
    if (SECRET_PATTERNS.some((re) => re.test(value))) hits.push(trail || "example");
    return;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, child]) =>
      collectSecrets(child, hits, trail ? `${trail}.${key}` : key),
    );
  }
};

export const auditSpec = ({ spec, nodes = [], format = "", flow = null } = {}) => {
  const findings = [];
  const add = (rule, severity, category, title, detail, nodeId) =>
    findings.push({
      id: `${rule}:${nodeId || findings.length}`,
      rule,
      severity,
      category,
      title,
      detail,
      nodeId,
      // Shape the status bar already understands
      level: severity === "info" ? "info" : "warn",
      message: detail ? `${title} — ${detail}` : title,
    });

  const requests = nodes.filter((n) => n.type === "request");
  const openApi = isOpenApiFormat(format) && spec && typeof spec === "object";

  // ── Generic rules: true for any imported format ──────────────
  const seen = new Map();
  requests.forEach((node) => {
    if (!node.path || !String(node.path).trim()) {
      add("no-url", "error", CATEGORY.STRUCTURE, "Endpoint has no URL",
        node.name || "unnamed", node.id);
      return;
    }

    const key = `${node.method} ${node.path}`;
    if (seen.has(key)) {
      add("duplicate-endpoint", "warning", CATEGORY.STRUCTURE,
        "Duplicate endpoint", key, node.id);
    } else {
      seen.set(key, node.id);
    }

    if (/^http:\/\//i.test(String(node.path))) {
      add("insecure-scheme", "error", CATEGORY.SECURITY,
        "Endpoint served over plain HTTP", label(node), node.id);
    }

    if (!String(node.description || "").trim()) {
      add("missing-description", "info", CATEGORY.DOCS,
        "Endpoint has no description", label(node), node.id);
    }

    const verb = segmentsOf(node.path).find((seg) => VERB_SEGMENT.test(seg));
    if (verb) {
      add("verb-in-path", "info", CATEGORY.CONSISTENCY,
        "Path contains a verb — the method already says the action",
        `"${verb}" in ${pathOf(node.path)}`, node.id);
    }

    if (node.deprecated) {
      add("deprecated-endpoint", "info", CATEGORY.CONSISTENCY,
        "Endpoint is marked deprecated", label(node), node.id);
    }

    const secrets = [];
    collectSecrets(node.body, secrets);
    (node.responses || []).forEach((r) => collectSecrets(r.example, secrets));
    (node.headers || []).forEach((h) => collectSecrets(h.value, secrets));
    if (secrets.length) {
      add("secret-in-example", "error", CATEGORY.SECURITY,
        "Example contains what looks like a real credential",
        `${label(node)} (${secrets[0]})`, node.id);
    }
  });

  nodes
    .filter((n) => n.type === "folder")
    .forEach((folder) => {
      if (!nodes.some((n) => n.parentId === folder.id)) {
        add("empty-group", "info", CATEGORY.STRUCTURE,
          "Group has no endpoints", folder.name, folder.id);
      }
    });

  // Casing consistency across path segments
  const casings = new Set();
  requests.forEach((node) =>
    segmentsOf(node.path).forEach((seg) => {
      if (/^[a-z0-9]+$/.test(seg)) return; // single lowercase word is neutral
      if (/^[a-z0-9]+(-[a-z0-9]+)+$/.test(seg)) casings.add("kebab-case");
      else if (/^[a-z0-9]+(_[a-z0-9]+)+$/.test(seg)) casings.add("snake_case");
      else if (/^[a-z]+([A-Z][a-z0-9]*)+$/.test(seg)) casings.add("camelCase");
      else if (/[A-Z]/.test(seg)) casings.add("mixed");
    }),
  );
  if (casings.size > 1) {
    add("path-casing", "warning", CATEGORY.CONSISTENCY,
      "Path segments mix naming conventions",
      [...casings].join(", "));
  }

  // ── OpenAPI / Swagger rules ──────────────────────────────────
  if (openApi) {
    const info = spec.info || {};
    if (!String(info.description || "").trim()) {
      add("info-description", "warning", CATEGORY.DOCS,
        "The API itself has no description", "info.description is empty");
    }
    if (!info.version) {
      add("info-version", "warning", CATEGORY.STRUCTURE,
        "No API version declared", "info.version is missing");
    }

    const servers = spec.servers || (spec.host ? [{ url: spec.host }] : []);
    if (!servers.length) {
      add("no-servers", "warning", CATEGORY.STRUCTURE,
        "No server URL declared", "Requests have no base URL to resolve against");
    }
    servers.forEach((server) => {
      if (/^http:\/\//i.test(String(server?.url || ""))) {
        add("insecure-server", "error", CATEGORY.SECURITY,
          "Server URL uses plain HTTP", server.url);
      }
    });

    const schemes =
      spec.components?.securitySchemes || spec.securityDefinitions || {};
    const schemeNames = Object.keys(schemes);
    if (!schemeNames.length) {
      add("no-security-schemes", "error", CATEGORY.SECURITY,
        "No security scheme defined",
        "Every operation reads as unauthenticated");
    }
    schemeNames.forEach((name) => {
      const scheme = schemes[name] || {};
      if (String(scheme.scheme || "").toLowerCase() === "basic") {
        add("basic-auth", "warning", CATEGORY.SECURITY,
          "Basic authentication in use", `securityScheme "${name}"`);
      }
      if (scheme.type === "apiKey" && scheme.in === "query") {
        add("apikey-in-query", "error", CATEGORY.SECURITY,
          "API key passed in the query string — it leaks into logs and history",
          `securityScheme "${name}"`);
      }
    });

    const declaredRefs = referencedNames(spec);
    const defined = spec.components?.schemas || spec.definitions || {};
    Object.keys(defined).forEach((name) => {
      if (!declaredRefs.has(name)) {
        add("unused-schema", "info", CATEGORY.STRUCTURE,
          "Schema is defined but never referenced", name);
      }
      if (!String(defined[name]?.description || "").trim()) {
        add("schema-no-description", "info", CATEGORY.DOCS,
          "Schema has no description", name);
      }
    });

    const operationIds = new Map();
    let sawRateLimit = false;

    requests.forEach((node) => {
      const statuses = (node.responses || []).map((r) => String(r.status));
      if (statuses.length) {
        if (!statuses.some((s) => /^2/.test(s))) {
          add("no-success-response", "warning", CATEGORY.RESPONSES,
            "No 2xx response declared", label(node), node.id);
        }
        if (!statuses.some((s) => /^[45]/.test(s) || s === "default")) {
          add("no-error-response", "warning", CATEGORY.RESPONSES,
            "No error response declared", label(node), node.id);
        }
        if (statuses.includes("429")) sawRateLimit = true;
      } else {
        add("no-responses", "warning", CATEGORY.RESPONSES,
          "Operation declares no responses", label(node), node.id);
      }

      if (!String(node.name || "").trim()) {
        add("no-summary", "warning", CATEGORY.DOCS,
          "Operation has no summary", pathOf(node.path), node.id);
      }

      if (schemeNames.length && !(node.auth || []).length) {
        add("unsecured-operation", "warning", CATEGORY.SECURITY,
          "Operation declares no security while the API defines schemes",
          label(node), node.id);
      }

      // Path template variables must be declared as parameters
      const declared = new Set(
        (node.params || [])
          .filter((p) => p.in === "path" && !p.inferred)
          .map((p) => p.name),
      );
      const template = String(node.template || node.path || "");
      (template.match(/\{([^}/]+)\}/g) || []).forEach((raw) => {
        const name = raw.slice(1, -1);
        if (!declared.has(name)) {
          add("undeclared-path-param", "error", CATEGORY.STRUCTURE,
            "Path variable is not declared as a parameter",
            `{${name}} in ${pathOf(node.path)}`, node.id);
        }
      });

      const schema = node.requestBodySchema;
      if (schema && schema.type === "object" && schema.additionalProperties === undefined) {
        add("open-request-body", "info", CATEGORY.SECURITY,
          "Request body accepts unlisted properties",
          `${label(node)} — additionalProperties is unset`, node.id);
      }
    });

    // operationId uniqueness, read from the source document
    Object.entries(spec.paths || {}).forEach(([p, item]) => {
      if (!item || typeof item !== "object") return;
      Object.entries(item).forEach(([method, op]) => {
        if (!op || typeof op !== "object" || !op.responses) return;
        const id = op.operationId;
        if (!id) {
          add("no-operation-id", "info", CATEGORY.CONSISTENCY,
            "Operation has no operationId", `${method.toUpperCase()} ${p}`);
        } else if (operationIds.has(id)) {
          add("duplicate-operation-id", "error", CATEGORY.CONSISTENCY,
            "Duplicate operationId", `"${id}" reused on ${method.toUpperCase()} ${p}`);
        } else {
          operationIds.set(id, true);
        }
        if (!(op.tags || []).length) {
          add("no-tags", "info", CATEGORY.STRUCTURE,
            "Operation has no tags, so it lands in the default group",
            `${method.toUpperCase()} ${p}`);
        }
      });
    });

    if (schemeNames.length && !sawRateLimit && requests.length > 3) {
      add("no-rate-limit", "info", CATEGORY.SECURITY,
        "No 429 response anywhere — rate limiting is undocumented",
        `${requests.length} operations`);
    }
  }

  // ── Collection rules: variables, credentials and saved examples ──
  // These read the fields the Postman parser fills in, so they stay silent
  // on a plain OpenAPI import rather than reporting absent things as faults.

  nodes.forEach((node) => {
    (node.variables || []).forEach((variable) => {
      if (SECRET_PATTERNS.some((re) => re.test(String(variable.value || "")))) {
        add("secret-in-variable", "error", CATEGORY.SECURITY,
          "Credential stored in a collection variable",
          `${variable.key} on ${node.name}`, node.id);
      }
    });
  });

  requests.forEach((node) => {
    const url = String(node.path || "");

    if (/^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i.test(url)) {
      add("localhost-url", "warning", CATEGORY.STRUCTURE,
        "Points at a local address",
        `${label(node)} — nobody else on the team can run this`, node.id);
    }

    (node.headers || []).forEach((header) => {
      const key = String(header.key || "").toLowerCase();
      const value = String(header.value || "");
      if (!value || value.includes("{{")) return;
      if (key === "authorization") {
        add("hardcoded-auth", "error", CATEGORY.SECURITY,
          "Authorization header holds a literal value",
          `${label(node)} — use a variable so the token is not shared`, node.id);
      } else if (/^(x-api-key|api-key|apikey|x-auth-token)$/.test(key)) {
        add("hardcoded-key-header", "error", CATEGORY.SECURITY,
          `${header.key} header holds a literal value`,
          label(node), node.id);
      }
    });

    if ((node.disabledHeaders || []).length) {
      add("disabled-header", "info", CATEGORY.STRUCTURE,
        "Request carries disabled headers",
        `${label(node)} — ${node.disabledHeaders.map((h) => h.key).join(", ")}`,
        node.id);
    }

    if (node.scripts && !(node.responses || []).length) {
      add("no-saved-example", "info", CATEGORY.DOCS,
        "No saved response example",
        `${label(node)} — anyone reading this cannot tell what it returns`,
        node.id);
    }
  });

  // ── Variable flow ────────────────────────────────────────────
  if (flow) {
    (flow.missing || []).forEach((entry) => {
      add("undeclared-variable", "error", CATEGORY.STRUCTURE,
        `{{${entry.name}}} is used but never set`,
        `Read by ${entry.nodeIds.length} request${entry.nodeIds.length === 1 ? "" : "s"}, and no script or variable provides it`,
        entry.nodeIds[0]);
    });

    (flow.orderingIssues || []).forEach((issue) => {
      const producer = nodes.find((n) => n.id === issue.producer);
      const consumer = nodes.find((n) => n.id === issue.consumer);
      add("variable-ordering", "warning", CATEGORY.STRUCTURE,
        `{{${issue.variable}}} is read before it is set`,
        `${consumer?.name || "a request"} runs before ${producer?.name || "the request that sets it"}`,
        issue.consumer);
    });

    (flow.unused || []).forEach((entry) => {
      add("unused-variable", "info", CATEGORY.CONSISTENCY,
        `${entry.name} is declared but never used`,
        `Declared on the ${entry.source}`, null);
    });
  }

  // ── Examples against their own schemas ───────────────────────
  // Purely a comparison of two things the document already contains.
  requests.forEach((node) => {
    (node.responses || []).forEach((response) => {
      if (!response.schema || response.example === undefined) return;
      const { checked, issues } = validateExample(response.example, response.schema, spec);
      if (!checked || !issues.length) return;
      const first = issues[0];
      add("example-schema-mismatch", "warning", CATEGORY.RESPONSES,
        `Response example does not match its schema`,
        `${label(node)} ${response.status} — ${first.path}: ${first.message}${issues.length > 1 ? ` (+${issues.length - 1} more)` : ""}`,
        node.id);
    });

    if (node.requestBodySchema && node.body !== undefined && node.body !== null) {
      const { checked, issues } = validateExample(node.body, node.requestBodySchema, spec);
      if (checked && issues.length) {
        const first = issues[0];
        add("body-schema-mismatch", "warning", CATEGORY.STRUCTURE,
          "Request body example does not match its schema",
          `${label(node)} — ${first.path}: ${first.message}${issues.length > 1 ? ` (+${issues.length - 1} more)` : ""}`,
          node.id);
      }
    }
  });

  // ── Score ────────────────────────────────────────────────────
  const byRule = new Map();
  findings.forEach((f) => {
    const entry = byRule.get(f.rule) || { severity: f.severity, count: 0 };
    entry.count += 1;
    byRule.set(f.rule, entry);
  });

  let penalty = 0;
  byRule.forEach(({ severity, count }) => {
    penalty += WEIGHT[severity] * Math.min(count, MAX_HITS_PER_RULE);
  });

  const score = requests.length
    ? Math.max(0, Math.min(100, Math.round(100 - penalty)))
    : 100;

  const counts = {
    error: findings.filter((f) => f.severity === "error").length,
    warning: findings.filter((f) => f.severity === "warning").length,
    info: findings.filter((f) => f.severity === "info").length,
  };

  return {
    findings,
    counts,
    score,
    grade: score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 55 ? "D" : "F",
    openApi,
  };
};

export const AUDIT_CATEGORIES = Object.values(CATEGORY);
