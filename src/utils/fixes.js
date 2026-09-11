/**
 * Safe, reviewable repairs to a Postman collection.
 *
 * Every fix is proposed rather than applied: each one describes exactly what
 * it would change and the caller decides which to take. Nothing here invents
 * content — a fix either moves a value that is already there or removes one
 * that should never have been committed.
 */

const POSTMAN_SCHEMA =
  "https://schema.getpostman.com/json/collection/v2.1.0/collection.json";

const SECRET_HEADERS = /^(authorization|x-api-key|api-key|apikey|x-auth-token)$/i;

const clone = (value) => JSON.parse(JSON.stringify(value));

/** Walk every request in an item tree, in place. */
const eachRequest = (items, fn) => {
  (Array.isArray(items) ? items : []).forEach((item) => {
    if (Array.isArray(item.item)) {
      eachRequest(item.item, fn);
      return;
    }
    if (item.request) fn(item, item.request);
  });
};

const urlRaw = (request) =>
  typeof request.url === "string" ? request.url : request.url?.raw || "";

const setUrlRaw = (request, raw) => {
  if (typeof request.url === "string") {
    request.url = raw;
    return;
  }
  if (request.url && typeof request.url === "object") {
    request.url.raw = raw;
    // The parsed host no longer describes the raw URL once it is rewritten.
    delete request.url.host;
    delete request.url.protocol;
  } else {
    request.url = raw;
  }
};

const originOf = (url) => {
  const match = String(url).match(/^([a-zA-Z][\w+.-]*:\/\/[^/?#]+)/);
  return match ? match[1] : "";
};

const declaredVariable = (collection, key) =>
  (collection.variable || []).some((v) => v?.key === key);

const declareVariable = (collection, key, value) => {
  if (!Array.isArray(collection.variable)) collection.variable = [];
  if (declaredVariable(collection, key)) return;
  collection.variable.push({ key, value, type: "string" });
};

/**
 * Work out which fixes apply to a collection.
 *
 * Returns a list of `{ id, title, detail, count, apply }`. `apply` takes a
 * collection and mutates its clone — the caller never has to know how a fix
 * is implemented, only what it claims to do.
 */
export const proposeFixes = (collection) => {
  if (!collection || typeof collection !== "object") return [];
  const proposals = [];

  // ── 1. A collection with no schema declaration ──
  if (collection.info && collection.info.schema !== POSTMAN_SCHEMA) {
    proposals.push({
      id: "schema",
      title: "Declare the v2.1 collection schema",
      detail: collection.info.schema
        ? `Currently ${collection.info.schema}`
        : "The collection declares no schema, which some importers reject",
      count: 1,
      apply: (draft) => {
        draft.info.schema = POSTMAN_SCHEMA;
        return ["Set info.schema to the v2.1 collection schema"];
      },
    });
  }

  // ── 2. Credentials written literally into headers ──
  const literalAuth = [];
  eachRequest(collection.item, (item, request) => {
    (request.header || []).forEach((header) => {
      const value = String(header?.value ?? "");
      if (!header?.key || !SECRET_HEADERS.test(header.key)) return;
      if (!value || value.includes("{{")) return;
      literalAuth.push({ item: item.name, key: header.key });
    });
  });

  if (literalAuth.length) {
    proposals.push({
      id: "secrets",
      title: `Move ${literalAuth.length} hard-coded credential${literalAuth.length === 1 ? "" : "s"} into a variable`,
      detail:
        "The literal value is removed, not copied into the collection — set it in an environment, which is not part of the exported file",
      count: literalAuth.length,
      apply: (draft) => {
        const changes = [];
        eachRequest(draft.item, (item, request) => {
          (request.header || []).forEach((header) => {
            const value = String(header?.value ?? "");
            if (!header?.key || !SECRET_HEADERS.test(header.key)) return;
            if (!value || value.includes("{{")) return;

            // Keep any scheme prefix ("Bearer ") so the request still works.
            const scheme = value.match(/^(Bearer|Basic|Token)\s+/i);
            const variable = /^authorization$/i.test(header.key) ? "authToken" : "apiKey";
            header.value = scheme ? `${scheme[1]} {{${variable}}}` : `{{${variable}}}`;
            declareVariable(draft, variable, "");
            changes.push(`${item.name}: ${header.key} → {{${variable}}}`);
          });
        });
        return changes;
      },
    });
  }

  // ── 3. Credentials sitting in collection variables ──
  const secretVariables = (collection.variable || []).filter(
    (v) => v?.key && String(v.value || "").length > 16 && /token|secret|key|password|pass/i.test(v.key),
  );
  if (secretVariables.length) {
    proposals.push({
      id: "variable-secrets",
      title: `Clear ${secretVariables.length} credential-shaped variable${secretVariables.length === 1 ? "" : "s"}`,
      detail: `${secretVariables.map((v) => v.key).join(", ")} — the name stays so requests still resolve, the value is emptied`,
      count: secretVariables.length,
      apply: (draft) => {
        const changes = [];
        (draft.variable || []).forEach((variable) => {
          if (secretVariables.some((v) => v.key === variable.key)) {
            variable.value = "";
            changes.push(`Emptied ${variable.key}`);
          }
        });
        return changes;
      },
    });
  }

  // ── 4. One literal host repeated across every request ──
  const origins = new Map();
  eachRequest(collection.item, (item, request) => {
    const origin = originOf(urlRaw(request));
    if (origin) origins.set(origin, (origins.get(origin) || 0) + 1);
  });
  const [topOrigin, topCount] = [...origins.entries()].sort((a, b) => b[1] - a[1])[0] || [];

  if (topOrigin && topCount > 1 && !declaredVariable(collection, "baseUrl")) {
    proposals.push({
      id: "base-url",
      title: `Replace a repeated host with {{baseUrl}}`,
      detail: `${topOrigin} appears in ${topCount} requests — one variable makes the collection switchable between environments`,
      count: topCount,
      apply: (draft) => {
        const changes = [];
        declareVariable(draft, "baseUrl", topOrigin);
        eachRequest(draft.item, (item, request) => {
          const raw = urlRaw(request);
          if (!raw.startsWith(topOrigin)) return;
          setUrlRaw(request, `{{baseUrl}}${raw.slice(topOrigin.length)}`);
          changes.push(`${item.name}: host → {{baseUrl}}`);
        });
        return changes;
      },
    });
  }

  // ── 5. Requests pointing at a machine only their author has ──
  const localhost = [];
  eachRequest(collection.item, (item, request) => {
    if (/^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i.test(urlRaw(request))) {
      localhost.push(item.name);
    }
  });
  if (localhost.length && !topOrigin?.match(/localhost|127\.0\.0\.1/i)) {
    proposals.push({
      id: "localhost",
      title: `${localhost.length} request${localhost.length === 1 ? "" : "s"} point at localhost`,
      detail: `${localhost.slice(0, 3).join(", ")}${localhost.length > 3 ? ", …" : ""} — these cannot run for anyone else. No automatic fix; the host has to be decided by you`,
      count: localhost.length,
      apply: null,
    });
  }

  return proposals;
};

/**
 * Apply the chosen fixes to a copy of the collection.
 *
 * The original is never touched, and the return value lists every individual
 * change so the user can see precisely what happened before sending it back
 * to their workspace.
 */
export const applyFixes = (collection, ids = []) => {
  const draft = clone(collection);
  const changes = [];
  proposeFixes(collection)
    .filter((proposal) => proposal.apply && ids.includes(proposal.id))
    .forEach((proposal) => {
      changes.push(...(proposal.apply(draft) || []));
    });
  return { collection: draft, changes };
};
