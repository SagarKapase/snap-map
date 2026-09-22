/**
 * The REST design proposal.
 *
 * SOAP is operation-centric: `GetAccountBalance(accountId)`. REST is
 * resource-centric: `GET /accounts/{accountId}/balance`. This module reads
 * every operation's name and message shapes and proposes the resource, the
 * verb, the path, the parameters, the body, the response and the error
 * mapping — with the rationale for each choice and a confidence. Anything
 * the heuristics could not settle is flagged `review` with the alternatives
 * listed, so the architect reviews decisions rather than re-deriving them.
 *
 * Reviewer overrides (method, path, summary) are applied on top of the
 * proposal; a reviewed row is the person's decision and is not flagged.
 */
import { createSchemaBuilder } from "./jsonSchema";

export const MIGRATION_STATUSES = [
  { id: "proposed", label: "Proposed", hint: "The engine's proposal; nobody has looked yet." },
  { id: "reviewed", label: "Reviewed", hint: "An architect has read the design." },
  { id: "approved", label: "Approved", hint: "The design is final; the adapter can be built." },
  { id: "migrated", label: "Migrated", hint: "The REST endpoint is live and parity has passed." },
  { id: "skipped", label: "Skipped", hint: "Retired or out of scope; counts as done." },
];

const VERBS = {
  GET: ["get", "find", "fetch", "retrieve", "read", "list", "search", "query", "lookup", "load", "select", "check", "is", "has", "exists", "describe", "show", "browse", "count", "enumerate", "view"],
  POST: ["create", "add", "insert", "register", "submit", "place", "open", "new", "post", "send", "enroll", "enrol", "generate", "issue", "book", "make", "start"],
  PUT: ["update", "set", "modify", "change", "edit", "save", "replace", "assign", "put", "upsert"],
  PATCH: ["patch", "adjust", "amend"],
  DELETE: ["delete", "remove", "cancel", "close", "revoke", "unregister", "purge", "clear", "deactivate", "discard", "terminate", "withdraw"],
};
const COMMANDS = ["validate", "verify", "calculate", "compute", "process", "execute", "run", "perform", "transfer", "approve", "reject", "activate", "suspend", "resume", "reset", "renew", "confirm", "authorize", "authorise", "apply", "convert", "export", "import", "sync", "synchronize", "synchronise", "notify", "publish", "lock", "unlock", "release", "reserve", "settle", "post", "acknowledge", "ping", "login", "logout", "authenticate", "refresh", "recalculate", "reprocess", "resend", "retry", "escalate", "dispatch", "ship", "pay", "refund", "capture", "void", "hold", "schedule"];
const CLAUSES = new Set(["by", "for", "of", "with", "in", "from", "using", "via", "on"]);
const ID_SUFFIX = /(id|ids|number|no|num|code|ref|reference|key|identifier|guid|uuid)$/i;

const IRREGULAR_PLURALS = { person: "people", child: "children", man: "men", woman: "women", mouse: "mice", foot: "feet", tooth: "teeth", goose: "geese", criterion: "criteria", datum: "data", index: "indices", matrix: "matrices", status: "statuses", address: "addresses" };

export const splitWords = (text) =>
  String(text || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[\s_\-.]+/)
    .filter(Boolean);

export const plural = (word) => {
  const w = String(word || "").toLowerCase();
  if (!w) return w;
  if (IRREGULAR_PLURALS[w]) return IRREGULAR_PLURALS[w];
  if (/(s|x|z|ch|sh)$/.test(w)) return /(us|is|ss|ies)$/.test(w) ? (w.endsWith("us") ? `${w.slice(0, -2)}i` : w.endsWith("is") ? `${w.slice(0, -2)}es` : w.endsWith("ss") ? `${w}es` : w) : `${w}es`;
  if (/[^aeiou]y$/.test(w)) return `${w.slice(0, -1)}ies`;
  if (/(data|info|information|news|equipment|stock|inventory|balance|history|metadata|content|feedback|money|cash|funds|settings|details)$/.test(w)) return w;
  return `${w}s`;
};

export const kebab = (words) => words.map((w) => w.toLowerCase()).join("-");
export const camel = (words) => words.map((w, i) => (i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())).join("");

const verbOf = (token) => {
  const t = String(token || "").toLowerCase();
  for (const [method, list] of Object.entries(VERBS)) if (list.includes(t)) return { method, kind: "crud" };
  if (COMMANDS.includes(t)) return { method: "POST", kind: "command" };
  return null;
};

const STATUS_RULES = [
  [/(notfound|unknown|missing|nosuch|doesnotexist|notexist|absent)/i, 404, "Not Found"],
  [/(invalid|validation|badrequest|malformed|illegal|argument|format|required|constraint|outofrange)/i, 400, "Bad Request"],
  [/(unauthori[sz]ed|notauthori[sz]ed|unauthenticated|authentication|credential|login|token|session|expired)/i, 401, "Unauthorized"],
  [/(forbidden|permission|denied|notallowed|access|authori[sz]ation)/i, 403, "Forbidden"],
  [/(conflict|duplicate|alreadyexist|exists|locked|concurren|stale|version)/i, 409, "Conflict"],
  [/(insufficient|limit|exceed|quota|balance|funds)/i, 422, "Unprocessable Entity"],
  [/(timeout|timedout|unavailable|busy|overload)/i, 503, "Service Unavailable"],
  [/(unsupported|notimplemented)/i, 501, "Not Implemented"],
];

/** The HTTP status a SOAP fault name suggests. */
export const statusForFault = (name) => {
  const flat = String(name || "").replace(/[^A-Za-z]/g, "");
  for (const [pattern, status, reason] of STATUS_RULES) if (pattern.test(flat)) return { status, reason };
  return { status: 500, reason: "Internal Server Error" };
};

const idStem = (fieldName) => {
  const words = splitWords(fieldName);
  if (!words.length) return null;
  const last = words[words.length - 1];
  if (words.length === 1 && /^(id|key|code|number|no|ref|guid|uuid|identifier)$/i.test(last)) return { stem: [], suffix: last };
  if (ID_SUFFIX.test(last) && words.length > 1) return { stem: words.slice(0, -1), suffix: last };
  if (/^(id|ids|number|no|code|ref|key|identifier)$/i.test(last)) return null;
  // "AccountID" splits as ["Account", "ID"]; "AccountId" the same. "CustomerRef" too.
  const m = last.match(/^(.*?)(Id|ID|Number|No|Code|Ref|Key)$/);
  if (m && m[1]) return { stem: [...words.slice(0, -1), m[1]], suffix: m[2] };
  return null;
};

const sameWords = (a, b) => a.length === b.length && a.every((w, i) => w.toLowerCase() === b[i].toLowerCase());
const singularWords = (words) => words.map((w, i) => (i === words.length - 1 ? singularOf(w) : w));
const singularOf = (word) => {
  const w = String(word || "");
  const lower = w.toLowerCase();
  const irregular = Object.entries(IRREGULAR_PLURALS).find(([, p]) => p === lower);
  if (irregular) return irregular[0];
  if (lower.length <= 3 || /(ss|us|is)$/.test(lower)) return w;
  if (/ies$/.test(lower)) return `${w.slice(0, -3)}y`;
  if (/(ches|shes|xes|zes|sses)$/.test(lower)) return w.slice(0, -2);
  if (/s$/.test(lower)) return w.slice(0, -1);
  return w;
};

const cleanPath = (path) => `/${String(path || "").trim().replace(/^\/+|\/+$/g, "")}`.replace(/\/{2,}/g, "/");
export const templateParams = (path) => [...String(path || "").matchAll(/\{([^}/]+)\}/g)].map((m) => m[1]);

/**
 * Propose one operation. Returns the row without collision handling; the
 * caller reconciles paths across the service.
 */
const proposeOperation = (op, builder, options) => {
  const rationale = [];
  const reviewReasons = [];
  let confidence = 1;

  const input = builder.messageShape(op.input, op.style, op.name, op.rpcNamespace);
  const output = builder.messageShape(op.output, op.style, `${op.name}Response`, op.rpcNamespace);
  const words = splitWords(op.name);
  const first = words[0] || "";
  let verb = verbOf(first);
  let method;
  let kind;
  let nameWords = words.slice(1);
  // A single-word operation (Add, Subtract, Ping) names no resource at all:
  // it is an action on the service, grouped under the service's own name.
  const verbOnly = words.length === 1;
  if (verbOnly) {
    method = "POST";
    kind = "command";
    nameWords = options.serviceWords.length ? options.serviceWords : ["service"];
    confidence -= 0.15;
    rationale.push(`"${first}" is the whole operation name, so there is no resource to hang it on; it is an action under /${kebab(nameWords)}, taken from the service name.`);
    reviewReasons.push(`Single-word operation: consider a resource noun for it (for example /calculations/${first.toLowerCase()}) so related operations share one collection.`);
  } else if (verb) {
    method = verb.method;
    kind = verb.kind;
    rationale.push(kind === "command" ? `"${first}" is a command, so it stays a POST action rather than being forced onto a CRUD verb.` : `"${first}" maps to ${method}.`);
  } else {
    nameWords = words;
    const scalarOnly = input.fields.every((f) => f.scalar && !f.array);
    method = output.fields.length && scalarOnly && input.fields.length <= 4 ? "GET" : "POST";
    kind = method === "GET" ? "crud" : "command";
    confidence -= 0.3;
    reviewReasons.push(`No HTTP verb matches "${first}"; ${method} was chosen ${method === "GET" ? "because every input is a scalar and there is a result" : "as the safe default for an action"}.`);
    rationale.push(`The operation name does not start with a recognised verb.`);
  }
  if (kind === "command" && verb && first.toLowerCase() === "post") kind = "crud";

  // Head words name the resource; a "By/For/Of…" tail names a filter.
  const clauseAt = nameWords.findIndex((w, i) => i > 0 && CLAUSES.has(w.toLowerCase()));
  const head = clauseAt === -1 ? nameWords : nameWords.slice(0, clauseAt);
  const tail = clauseAt === -1 ? [] : nameWords.slice(clauseAt + 1);
  const clause = clauseAt === -1 ? "" : nameWords[clauseAt].toLowerCase();

  // Identifier candidates from the input fields.
  const candidates = input.fields
    .filter((f) => f.scalar && !f.array)
    .map((f) => ({ field: f, ...(idStem(f.name) || {}) }))
    .filter((c) => c.stem !== undefined);

  const findId = (resourceWords) => {
    if (!resourceWords.length) return null;
    const singular = singularWords(resourceWords);
    return (
      candidates.find((c) => sameWords(c.stem, singular) || sameWords(c.stem, resourceWords)) ||
      candidates.find((c) => c.stem.length && sameWords(c.stem.slice(-singular.length), singular)) ||
      null
    );
  };

  let primary = [];
  let idCandidate = null;
  let rest = [];
  for (let n = head.length; n >= 1 && !idCandidate; n--) {
    const prefix = head.slice(0, n);
    const found = findId(prefix);
    if (found) {
      primary = prefix;
      idCandidate = found;
      rest = head.slice(n);
    }
  }
  if (!idCandidate) {
    const bare = candidates.find((c) => !c.stem.length);
    if (bare && head.length && ["GET", "PUT", "PATCH", "DELETE"].includes(method)) {
      primary = head.slice(0, 1);
      idCandidate = bare;
      rest = head.slice(1);
      rationale.push(`The input's "${bare.field.name}" identifies one ${singularOf(primary[0]).toLowerCase()}.`);
    }
  }
  if (!primary.length) {
    primary = head.length ? head : [singularOf(first) || "resource"];
    rest = [];
  }
  const others = candidates.filter((c) => c !== idCandidate && c.stem.length);
  if (idCandidate && others.length && !tail.length) {
    confidence -= 0.2;
    reviewReasons.push(`Several identifiers in the input: ${[idCandidate, ...others].map((c) => c.field.name).join(", ")}. "${idCandidate.field.name}" was chosen because it names the resource.`);
  }

  const singularPrimary = singularWords(primary);
  const resourceName = kebab(singularPrimary);
  // A service name is not a collection: /calculator/add, not /calculators/add.
  const collection = verbOnly ? kebab(singularPrimary) : kebab([...singularPrimary.slice(0, -1), plural(singularPrimary[singularPrimary.length - 1])]);
  const segments = [];
  const pathParams = [];
  const queryParams = [];
  let bodyFields = input.fields.slice();
  const consume = (field) => {
    bodyFields = bodyFields.filter((f) => f !== field);
  };

  // A "for/of/by <other resource id>" clause nests under that resource.
  let parentCandidate = null;
  if (tail.length) {
    parentCandidate = findId(tail) || candidates.find((c) => c.stem.length && sameWords(c.stem, singularWords(tail))) || null;
    if (parentCandidate && parentCandidate !== idCandidate) {
      const parentWords = singularWords(parentCandidate.stem);
      const parentParam = camel([...parentWords, "id"]);
      segments.push(kebab([...parentWords.slice(0, -1), plural(parentWords[parentWords.length - 1])]), `{${parentParam}}`);
      pathParams.push({ name: parentParam, field: parentCandidate.field.name, xmlName: parentCandidate.field.xmlName, schema: parentCandidate.field.schema, description: parentCandidate.field.description });
      consume(parentCandidate.field);
      rationale.push(`"${clause} ${tail.join(" ")}" nests the ${collection} under /${segments[0]}/{${parentParam}}.`);
    }
  }

  segments.push(collection);
  if (idCandidate) {
    const paramName = camel([...singularPrimary, idCandidate.suffix.toLowerCase() === "ids" ? "id" : idCandidate.suffix]);
    segments.push(`{${paramName}}`);
    pathParams.push({ name: paramName, field: idCandidate.field.name, xmlName: idCandidate.field.xmlName, schema: idCandidate.field.schema, description: idCandidate.field.description });
    consume(idCandidate.field);
    rationale.push(`"${idCandidate.field.name}" in the request identifies the ${resourceName}, so it is the path parameter {${paramName}}.`);
  }
  if (rest.length) {
    segments.push(kebab(rest));
    rationale.push(`"${rest.join(" ")}" is a sub-resource of ${resourceName}.`);
  }

  // Filters from the tail that are not a parent id become query parameters.
  if (tail.length && !parentCandidate) {
    const filterFields = input.fields.filter((f) => f.scalar && sameWords(splitWords(f.name), tail));
    if (filterFields.length) rationale.push(`"${clause} ${tail.join(" ")}" is a filter, so ${filterFields.map((f) => f.name).join(", ")} became query parameters.`);
    else rationale.push(`"${clause} ${tail.join(" ")}" describes a filter; the input fields become query parameters.`);
  }

  let responseStatus = 200;
  let requestBody = null;
  if (method === "GET" || method === "DELETE") {
    const scalars = bodyFields.filter((f) => f.scalar && !f.array);
    const complex = bodyFields.filter((f) => !f.scalar || f.array);
    scalars.forEach((f) => queryParams.push({ name: f.name, field: f.name, xmlName: f.xmlName, schema: f.schema, required: f.required, description: f.description }));
    if (complex.length) {
      if (method === "GET") {
        method = "POST";
        segments.push("search");
        kind = "search";
        confidence -= 0.1;
        queryParams.length = 0;
        requestBody = { schema: input.schema, fields: bodyFields, wrapper: input.wrapper };
        rationale.push(`The request carries structured criteria (${complex.map((f) => f.name).join(", ")}), which do not fit a query string; proposed as POST /…/search.`);
        reviewReasons.push("A search with a body is a compromise; consider flattening the criteria into query parameters.");
      } else {
        requestBody = { schema: input.schema, fields: bodyFields, wrapper: input.wrapper };
        reviewReasons.push("A DELETE with a request body is unusual; consider moving the fields into the path or query.");
        confidence -= 0.1;
      }
    } else if (method === "GET" && !idCandidate && !rest.length && kind !== "command") {
      kind = "list";
      rationale.push(`No identifier in the request, so this reads the ${collection} collection${queryParams.length ? ` filtered by ${queryParams.map((q) => q.name).join(", ")}` : ""}.`);
    }
    if (method === "DELETE") {
      kind = "delete";
      responseStatus = output.fields.length ? 200 : 204;
      if (!idCandidate) {
        confidence -= 0.2;
        reviewReasons.push("A DELETE without an identifier would act on the whole collection; check the path.");
      }
    }
  } else {
    if (bodyFields.length) requestBody = { schema: input.schema, fields: bodyFields, wrapper: input.wrapper };
    if (kind === "command") {
      segments.push(kebab([first]));
      rationale.push(`Commands are POST /…/${kebab([first])}; the request is the body.`);
      confidence -= 0.05;
    } else if (method === "POST") {
      kind = "create";
      responseStatus = output.fields.length ? 201 : 202;
      if (idCandidate) rationale.push("Create with an identifier in the request: the client names the resource.");
      if (!output.fields.length) rationale.push("Nothing comes back, so 202 Accepted.");
      else rationale.push("A creation answers 201 Created with the new representation.");
    } else {
      kind = "update";
      if (!idCandidate) {
        confidence -= 0.2;
        reviewReasons.push(`${method} without an identifier addresses the whole collection; check the path.`);
      }
    }
  }
  if (kind === "crud" && method === "GET") kind = idCandidate ? "item" : "list";
  if (kind === "command") kind = "action";

  // Response: unwrap a single "Result"/"return" field; empty → 204.
  let responseSchema = null;
  let unwrapped = "";
  if (output.fields.length === 1 && /(result|response|return|value|data|body|payload)$/i.test(output.fields[0].name)) {
    responseSchema = output.fields[0].schema;
    unwrapped = output.fields[0].name;
    rationale.push(`The response wrapper holds one field, "${unwrapped}", which is returned directly.`);
  } else if (output.fields.length) {
    responseSchema = output.schema;
  } else if (op.output) {
    responseStatus = responseStatus === 201 ? 201 : 204;
  } else {
    responseStatus = 202;
    rationale.push("The operation is one-way (no output message), so 202 Accepted.");
  }
  if (responseStatus === 204 && op.output && !output.fields.length && method !== "DELETE") rationale.push("The response element is empty, so 204 No Content.");

  // Faults → HTTP statuses.
  const errors = [];
  (op.faults || []).forEach((fault) => {
    const { status, reason } = statusForFault(fault.name || fault.message);
    const shape = builder.messageShape(fault, "document", fault.name, op.rpcNamespace);
    const existing = errors.find((e) => e.status === status);
    if (existing) {
      existing.faults.push(fault.name);
      existing.description += `; ${fault.name}`;
    } else {
      errors.push({ status, reason, faults: [fault.name], description: `${fault.name}${fault.documentation ? ` — ${fault.documentation}` : ""}`, schema: shape.schema, detailName: shape.wrapper });
    }
    if (status === 500) reviewReasons.push(`Fault "${fault.name}" does not name a client error; it is mapped to 500. Change it if it is one.`);
  });
  if (op.faults?.length) rationale.push(`Faults: ${errors.map((e) => `${e.faults.join("/")} → ${e.status}`).join(", ")}.`);
  if (!errors.some((e) => e.status === 400) && (requestBody || pathParams.length || queryParams.length)) errors.push({ status: 400, reason: "Bad Request", faults: [], description: "The request failed validation.", schema: null });
  if (!errors.some((e) => e.status === 404) && pathParams.length) errors.push({ status: 404, reason: "Not Found", faults: [], description: `No ${resourceName} with that identifier.`, schema: null });
  errors.sort((a, b) => a.status - b.status);

  if (input.multipart) {
    confidence -= 0.1;
    reviewReasons.push("The SOAP request has several body parts; they were merged into one request shape.");
  }

  const path = cleanPath(segments.join("/"));
  const summary = [first ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() : "", ...nameWords.map((w) => w.toLowerCase())].filter(Boolean).join(" ");

  return {
    id: op.name,
    soapOperation: op.name,
    documentation: op.documentation || "",
    method,
    path,
    summary,
    resource: collection,
    resourceName,
    kind,
    pathParams,
    queryParams,
    requestBody,
    response: { status: responseStatus, schema: responseSchema, wrapper: output.wrapper, unwrapped },
    errors,
    rationale,
    confidence: Math.max(0, Math.round(confidence * 100) / 100),
    review: false,
    reviewReasons,
    overridden: {},
    status: "proposed",
    soap: {
      action: op.soapAction,
      style: op.style,
      version: op.soapVersion,
      endpoint: op.endpoint,
      inputElement: input.element,
      outputElement: output.element,
      inputWrapper: input.wrapper,
      outputWrapper: output.wrapper,
      rpc: Boolean(input.rpc),
    },
    shapes: { input, output },
    options,
  };
};

/** Apply a reviewer's override to a proposed row. */
const applyOverride = (row, override, builder) => {
  if (!override || typeof override !== "object") return row;
  const next = { ...row, overridden: {}, rationale: [...row.rationale], reviewReasons: [...row.reviewReasons] };
  if (override.method && /^(GET|POST|PUT|PATCH|DELETE)$/i.test(override.method) && override.method.toUpperCase() !== row.method) {
    next.method = override.method.toUpperCase();
    next.overridden.method = row.method;
    next.rationale.push(`Reviewer changed the method from ${row.method} to ${next.method}.`);
    if ((next.method === "GET" || next.method === "DELETE") && next.requestBody) {
      next.queryParams = [...next.queryParams, ...next.requestBody.fields.filter((f) => f.scalar && !f.array && !next.pathParams.some((p) => p.field === f.name)).map((f) => ({ name: f.name, field: f.name, xmlName: f.xmlName, schema: f.schema, required: f.required, description: f.description }))];
      next.requestBody = null;
    }
    if (next.method === "POST" && row.method === "GET" && row.queryParams.length) {
      next.requestBody = { schema: row.shapes.input.schema, fields: row.shapes.input.fields.filter((f) => !row.pathParams.some((p) => p.field === f.name)), wrapper: row.shapes.input.wrapper };
      next.queryParams = [];
    }
  }
  if (typeof override.path === "string" && override.path.trim() && cleanPath(override.path) !== row.path) {
    const path = cleanPath(override.path);
    next.path = path;
    next.overridden.path = row.path;
    next.rationale.push(`Reviewer changed the path from ${row.path} to ${path}.`);
    const wanted = templateParams(path);
    const all = row.shapes.input.fields;
    next.pathParams = wanted.map((name) => {
      const known = row.pathParams.find((p) => p.name === name) || null;
      const field = all.find((f) => f.name.toLowerCase() === name.toLowerCase()) || all.find((f) => splitWords(f.name).join("").toLowerCase() === splitWords(name).join("").toLowerCase()) || null;
      if (known) return known;
      if (field) return { name, field: field.name, xmlName: field.xmlName, schema: field.schema, description: field.description };
      next.reviewReasons.push(`Path parameter {${name}} does not match any request field; the adapter cannot fill it.`);
      return { name, field: "", xmlName: "", schema: { type: "string" }, description: "" };
    });
    const inPath = new Set(next.pathParams.map((p) => p.field));
    next.queryParams = next.queryParams.filter((q) => !inPath.has(q.field));
    if (next.requestBody) next.requestBody = { ...next.requestBody, fields: next.requestBody.fields.filter((f) => !inPath.has(f.name)) };
    // Fields that were path parameters and no longer are go back to the query or body.
    row.pathParams.filter((p) => !inPath.has(p.field) && p.field).forEach((p) => {
      const field = all.find((f) => f.name === p.field);
      if (!field) return;
      if (next.method === "GET" || next.method === "DELETE") next.queryParams.push({ name: field.name, field: field.name, xmlName: field.xmlName, schema: field.schema, required: field.required, description: field.description });
      else if (next.requestBody) next.requestBody = { ...next.requestBody, fields: [...next.requestBody.fields, field] };
      else next.requestBody = { schema: row.shapes.input.schema, fields: [field], wrapper: row.shapes.input.wrapper };
    });
  }
  if (typeof override.summary === "string" && override.summary.trim() && override.summary.trim() !== row.summary) {
    next.summary = override.summary.trim().slice(0, 120);
    next.overridden.summary = row.summary;
  }
  if (typeof override.notes === "string") next.notes = override.notes.slice(0, 2000);
  if (Object.keys(next.overridden).length) {
    next.confidence = 1;
    next.reviewReasons = next.reviewReasons.filter((r) => r.startsWith("Path parameter"));
  }
  void builder;
  return next;
};

/**
 * Propose the REST design for a parsed service.
 *
 * `options.propertyCase` renames JSON properties (keep | camel | snake);
 * `options.basePath` is the version prefix for the servers entry;
 * `options.overrides[operationName]` are the reviewer's decisions;
 * `options.statuses[operationName]` the migration status of each row.
 */
export const proposeDesign = (service, options = {}) => {
  const { propertyCase = "camel", basePath = "/v1", overrides = {}, statuses = {} } = options;
  const builder = createSchemaBuilder(service, { propertyCase });
  // "CalculatorSoap" / "AccountService" → ["Calculator"] / ["Account"]: what a verb-only operation hangs under.
  const serviceWords = splitWords(service?.name || "").filter((w) => !/^(service|services|soap|soap12|port|ws|web|api|v\d+)$/i.test(w));
  const opts = { propertyCase, basePath, serviceWords };
  const seenNames = new Set();
  const rows = (service?.operations || []).map((op) => {
    let row = proposeOperation(op, builder, opts);
    if (seenNames.has(row.id)) {
      let n = 2;
      while (seenNames.has(`${row.id}_${n}`)) n++;
      row = { ...row, id: `${row.id}_${n}` };
      row.reviewReasons.push(`Operation name ${op.name} is declared more than once (different port types).`);
    }
    seenNames.add(row.id);
    return row;
  });

  // Collisions: the same method and path twice.
  const byRoute = new Map();
  rows.forEach((row) => {
    const key = `${row.method} ${row.path}`;
    if (!byRoute.has(key)) byRoute.set(key, []);
    byRoute.get(key).push(row);
  });
  byRoute.forEach((group) => {
    if (group.length < 2) return;
    group.slice(1).forEach((row) => {
      const suffix = kebab(splitWords(row.soapOperation));
      row.path = cleanPath(`${row.path}/${suffix}`);
      row.confidence = Math.max(0, row.confidence - 0.2);
      row.reviewReasons.push(`Collides with ${group[0].soapOperation} on ${group[0].method} ${group[0].path}; the operation name was appended to keep it distinct.`);
    });
    group[0].reviewReasons.push(`${group.slice(1).map((r) => r.soapOperation).join(", ")} proposed the same route; they were given suffixes.`);
    group[0].confidence = Math.max(0, group[0].confidence - 0.1);
  });

  const reviewed = rows.map((row) => {
    const withOverride = applyOverride(row, overrides[row.id], builder);
    const status = MIGRATION_STATUSES.some((s) => s.id === statuses[row.id]) ? statuses[row.id] : "proposed";
    // A row the reviewer touched is their decision; only a broken override still asks for attention.
    const overridden = Object.keys(withOverride.overridden).length > 0;
    const review = overridden ? withOverride.reviewReasons.length > 0 : withOverride.confidence < 0.7 || withOverride.reviewReasons.length > 0;
    return { ...withOverride, status, review };
  });

  const resources = [];
  reviewed.forEach((row) => {
    let r = resources.find((x) => x.name === row.resource);
    if (!r) {
      r = { name: row.resource, tag: row.resource.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "), operations: [] };
      resources.push(r);
    }
    r.operations.push(row.id);
  });

  const byMethod = {};
  reviewed.forEach((row) => {
    byMethod[row.method] = (byMethod[row.method] || 0) + 1;
  });

  return {
    serviceName: service?.name || "",
    basePath,
    propertyCase,
    operations: reviewed,
    resources,
    components: builder.components,
    ambiguities: builder.ambiguities,
    warnings: service?.warnings || [],
    builder,
    stats: {
      operations: reviewed.length,
      review: reviewed.filter((r) => r.review).length,
      resources: resources.length,
      byMethod,
      byStatus: MIGRATION_STATUSES.reduce((acc, s) => ({ ...acc, [s.id]: reviewed.filter((r) => r.status === s.id).length }), {}),
      ambiguities: builder.ambiguities.length,
    },
  };
};
