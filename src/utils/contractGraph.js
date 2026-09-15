/**
 * Contract Graph — the joins between many API contracts.
 *
 * Every other view in Vizroute looks at one document. This module takes a
 * set of services (each an OpenAPI document, a Postman collection, a WSDL
 * or anything else the parsers read) and computes what only shows up
 * between them:
 *
 *  – entities that more than one service exposes, and where their shapes
 *    disagree;
 *  – endpoints that duplicate each other across services;
 *  – edges: a collection's requests calling another service's operations,
 *    and `customerId`-style fields referencing an entity another service
 *    owns;
 *  – concepts: fields across services that name the same thing.
 *
 * Nothing here is guessed silently. Each finding carries the evidence it was
 * built from and a confidence, and anything inferred rather than declared is
 * marked as such, so the map can show what it knows and how it knows it.
 */
import { parseCollection, detectFormat, formatLabel } from "./parsers";
import { resolveSchema } from "./analysis";
import { splitOrigin } from "./convert";

// ─── Names and paths ─────────────────────────

const PATH_PARAM = /^(\{[^}/]+\}|:[a-zA-Z_][a-zA-Z0-9_-]*)$/;
const TEMPLATE_VAR = /\{\{[^}]*\}\}/g;
const VERSION_SEGMENT = /^v\d+(\.\d+)*$|^\d+(\.\d+)+$/i;
const NOISE_SEGMENTS = new Set(["api", "rest", "public", "internal", "services", "service"]);

/** "CustomerID", "customer_id", "customer-id" → "customer id" */
export const tokenize = (name) =>
  String(name || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[_\-./]+/g, " ")
    .trim()
    .toLowerCase();

/** A conservative singular: only the common English plurals of resource names. */
export const singular = (word) => {
  const w = String(word || "").toLowerCase();
  if (w.length <= 3) return w;
  if (/(ss|us|is)$/.test(w)) return w;
  if (/ies$/.test(w)) return `${w.slice(0, -3)}y`;
  if (/(ches|shes|xes|zes|sses)$/.test(w)) return w.slice(0, -2);
  if (/s$/.test(w)) return w.slice(0, -1);
  return w;
};

/**
 * The shape of a path with everything that varies removed: base and
 * template variables gone, version and "api" prefixes dropped, parameters
 * replaced by `{}`, plurals singularised. Two operations with the same
 * shape and method are the same endpoint however they were spelled.
 */
export const pathShape = (rawPath, servers = []) => {
  let path = String(rawPath || "").split("?")[0].split("#")[0];
  path = path.replace(TEMPLATE_VAR, "");
  const server = servers.find((s) => s && path.startsWith(s));
  if (server) path = path.slice(server.length);
  else {
    const { rest } = splitOrigin(path);
    path = rest;
  }
  const segments = path
    .split("/")
    .filter(Boolean)
    .filter((seg) => !VERSION_SEGMENT.test(seg) && !NOISE_SEGMENTS.has(seg.toLowerCase()))
    .map((seg) => (PATH_PARAM.test(seg) ? "{}" : singular(tokenize(seg).replace(/\s+/g, "-"))));
  return `/${segments.join("/")}`;
};

/** The resource an operation is about: the last static segment, singularised. */
const resourceOf = (shape) => {
  const parts = shape.split("/").filter((s) => s && s !== "{}");
  return parts[parts.length - 1] || "";
};

const pascal = (word) =>
  String(word || "")
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((t) => t[0].toUpperCase() + t.slice(1))
    .join("");

// ─── Schemas → entities and fields ───────────

const typeOf = (schema) => {
  if (!schema || typeof schema !== "object") return "unknown";
  if (Array.isArray(schema.type)) return schema.type.filter((t) => t !== "null")[0] || "unknown";
  if (schema.type) return schema.type;
  if (schema.properties) return "object";
  if (schema.items) return "array";
  if (schema.enum) return typeof schema.enum[0] === "number" ? "number" : "string";
  if (schema.oneOf || schema.anyOf || schema.allOf) return "union";
  return "unknown";
};

/** Fields of an object schema, refs already resolved. */
const fieldsOfSchema = (schema, depth = 0) => {
  if (!schema || typeof schema !== "object" || depth > 3) return [];
  let props = schema.properties;
  let required = Array.isArray(schema.required) ? schema.required : [];
  if (!props && Array.isArray(schema.allOf)) {
    props = {};
    schema.allOf.forEach((part) => {
      Object.assign(props, part?.properties || {});
      if (Array.isArray(part?.required)) required = required.concat(part.required);
    });
  }
  if (!props || typeof props !== "object") return [];
  return Object.entries(props).map(([name, prop]) => ({
    name,
    type: typeOf(prop),
    format: prop?.format || "",
    required: required.includes(name),
    enum: Array.isArray(prop?.enum) ? prop.enum.map(String) : null,
    example: prop?.example !== undefined ? prop.example : prop?.default,
    description: typeof prop?.description === "string" ? prop.description : "",
    nullable: prop?.nullable === true || (Array.isArray(prop?.type) && prop.type.includes("null")),
  }));
};

const jsType = (value) => {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
};

/** Fields of an example object, as if it were a schema. */
const fieldsOfExample = (example) => {
  if (!example || typeof example !== "object" || Array.isArray(example)) return [];
  return Object.entries(example).map(([name, value]) => ({
    name,
    type: jsType(value),
    format: "",
    required: false,
    enum: null,
    example: value !== null && typeof value !== "object" ? value : undefined,
    description: "",
    nullable: value === null,
  }));
};

const declaredSchemas = (spec) => {
  if (!spec || typeof spec !== "object") return {};
  const found = spec.components?.schemas || spec.definitions || {};
  return found && typeof found === "object" ? found : {};
};

const refName = (schema) => {
  const ref = schema?.$ref || schema?.items?.$ref;
  if (typeof ref !== "string") return "";
  return ref.split("/").pop() || "";
};

// ─── Services ────────────────────────────────

const DEFAULT_COLORS = ["#a855f7", "#3aa2ff", "#34d399", "#fbbf24", "#f87171", "#a78bfa", "#fb923c", "#22d3ee", "#e879f9", "#4ade80"];

/**
 * One service in the graph: what the document declares, normalised so it
 * can be compared with every other service. `spec` may be any format the
 * parsers accept.
 */
export const normalizeService = ({ id, name, spec, sourceUrl = "", color } = {}, index = 0) => {
  if (!spec || typeof spec !== "object") {
    throw new Error("A service needs a parsed specification object.");
  }
  const format = Array.isArray(spec) ? "custom" : detectFormat(spec);
  const nodes = parseCollection(spec, () => {});
  const root = nodes.find((n) => n.type === "root") || {};
  const servers = (root.servers || []).filter((s) => typeof s === "string");
  const isCollection = format === "postman";
  const schemas = declaredSchemas(spec);

  const operations = nodes
    .filter((n) => n.type === "request")
    .map((n, i) => {
      const shape = pathShape(n.path, servers);
      const okResponse = (n.responses || []).find((r) => /^2/.test(String(r.status))) || (n.responses || [])[0];
      const responseSchema = okResponse?.schema ? resolveSchema(spec, okResponse.schema) : null;
      const responseFields = responseSchema
        ? fieldsOfSchema(responseSchema.type === "array" ? responseSchema.items : responseSchema)
        : fieldsOfExample(Array.isArray(okResponse?.example) ? okResponse.example[0] : okResponse?.example);
      const requestSchema = n.requestBodySchema ? resolveSchema(spec, n.requestBodySchema) : null;
      const requestFields = requestSchema ? fieldsOfSchema(requestSchema) : fieldsOfExample(n.body);
      return {
        id: `${id}:${i}`,
        serviceId: id,
        nodeId: n.id,
        name: n.name || `${n.method} ${n.path}`,
        method: String(n.method || "GET").toUpperCase(),
        path: String(n.path || ""),
        shape,
        resource: resourceOf(shape),
        params: (n.params || []).map((p) => ({ name: p.name, in: p.in, type: p.type || "" })),
        requestFields,
        responseFields,
        responseRef: okResponse?.schema ? refName(okResponse.schema) : "",
        requestRef: n.requestBodySchema ? refName(n.requestBodySchema) : "",
        auth: (n.auth || []).map((a) => a.type || a.name || "").filter(Boolean),
        deprecated: Boolean(n.deprecated),
      };
    });

  // Entities: declared schemas first, then shapes inferred from responses of
  // resource operations when nothing is declared (Postman, custom JSON).
  const entities = [];
  Object.entries(schemas).forEach(([schemaName, schema]) => {
    const resolved = resolveSchema(spec, schema);
    const fields = fieldsOfSchema(resolved);
    if (!fields.length) return;
    entities.push({
      name: schemaName,
      key: tokenize(singular(schemaName)),
      serviceId: id,
      fields,
      inferred: false,
      usedBy: operations.filter((op) => op.responseRef === schemaName || op.requestRef === schemaName).map((op) => op.id),
    });
  });
  if (!entities.length) {
    const byResource = new Map();
    operations.forEach((op) => {
      if (!op.resource || !op.responseFields.length) return;
      const entityName = pascal(op.resource);
      const existing = byResource.get(entityName);
      if (existing) {
        op.responseFields.forEach((f) => {
          if (!existing.fields.some((e) => e.name === f.name)) existing.fields.push(f);
        });
        existing.usedBy.push(op.id);
      } else {
        byResource.set(entityName, {
          name: entityName,
          key: tokenize(singular(entityName)),
          serviceId: id,
          fields: [...op.responseFields],
          inferred: true,
          usedBy: [op.id],
        });
      }
    });
    entities.push(...byResource.values());
  }

  const info = spec?.info || {};
  const description =
    (typeof info.description === "string" && info.description) || info.description?.content || "";

  return {
    id,
    name: name || info.title || info.name || root.name || `Service ${index + 1}`,
    description: String(description).trim(),
    version: typeof info.version === "string" ? info.version : "",
    format,
    formatLabel: Array.isArray(spec) ? "Custom JSON" : formatLabel(spec),
    color: color || DEFAULT_COLORS[index % DEFAULT_COLORS.length],
    servers,
    sourceUrl,
    isCollection,
    operations,
    entities,
    nodeCount: nodes.length,
  };
};

// ─── Comparisons ─────────────────────────────

const jaccard = (a, b) => {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size && !B.size) return 0;
  let inter = 0;
  A.forEach((x) => B.has(x) && inter++);
  return inter / (A.size + B.size - inter);
};

/** Side-by-side differences between two field sets of the same entity. */
export const compareFields = (left, right) => {
  const byName = (list) => new Map(list.map((f) => [f.name, f]));
  const L = byName(left);
  const R = byName(right);
  const onlyLeft = left.filter((f) => !R.has(f.name)).map((f) => f.name);
  const onlyRight = right.filter((f) => !L.has(f.name)).map((f) => f.name);
  const typeConflicts = [];
  const requiredConflicts = [];
  L.forEach((f, name) => {
    const g = R.get(name);
    if (!g) return;
    if (f.type !== g.type && f.type !== "unknown" && g.type !== "unknown") {
      typeConflicts.push({ name, left: f.type, right: g.type });
    }
    if (f.required !== g.required) requiredConflicts.push({ name, left: f.required, right: g.required });
  });
  const shared = [...L.keys()].filter((n) => R.has(n));
  return {
    onlyLeft,
    onlyRight,
    typeConflicts,
    requiredConflicts,
    shared,
    similarity: jaccard([...L.keys()], [...R.keys()]),
    consistent: !onlyLeft.length && !onlyRight.length && !typeConflicts.length,
  };
};

/** Entities exposed by more than one service, and whether they agree. */
const findSharedEntities = (services) => {
  const byKey = new Map();
  services.forEach((service) => {
    service.entities.forEach((entity) => {
      if (!byKey.has(entity.key)) byKey.set(entity.key, []);
      byKey.get(entity.key).push(entity);
    });
  });
  const shared = [];
  byKey.forEach((occurrences, key) => {
    const owners = new Set(occurrences.map((e) => e.serviceId));
    if (owners.size < 2) return;
    const [first, ...rest] = occurrences;
    const comparisons = rest.map((other) => ({
      left: { serviceId: first.serviceId, name: first.name },
      right: { serviceId: other.serviceId, name: other.name },
      ...compareFields(first.fields, other.fields),
    }));
    shared.push({
      key,
      name: first.name,
      services: [...owners],
      occurrences: occurrences.map((e) => ({ serviceId: e.serviceId, name: e.name, fields: e.fields, inferred: e.inferred })),
      shapes: new Set(occurrences.map((e) => e.fields.map((f) => `${f.name}:${f.type}`).sort().join("|"))).size,
      consistent: comparisons.every((c) => c.consistent),
      comparisons,
      inferred: occurrences.some((e) => e.inferred),
    });
  });
  return shared.sort((a, b) => b.services.length - a.services.length || a.name.localeCompare(b.name));
};

/**
 * Endpoints that duplicate each other across services: same method and path
 * shape is a duplicate; same method and resource with overlapping response
 * fields is a near-duplicate, scored.
 */
const findDuplicateEndpoints = (services) => {
  // A collection describes calls to endpoints, not endpoints of its own; a
  // request in it that matches a service is a call edge, not a duplicate.
  const ops = services.filter((s) => !s.isCollection).flatMap((s) => s.operations);
  const out = [];
  for (let i = 0; i < ops.length; i++) {
    for (let j = i + 1; j < ops.length; j++) {
      const a = ops[i];
      const b = ops[j];
      if (a.serviceId === b.serviceId || a.method !== b.method) continue;
      const sameShape = a.shape === b.shape && a.shape !== "/";
      const sameResource = a.resource && a.resource === b.resource;
      if (!sameShape && !sameResource) continue;
      const fieldOverlap = jaccard(
        a.responseFields.map((f) => f.name),
        b.responseFields.map((f) => f.name),
      );
      let score;
      let kind;
      if (sameShape) {
        score = a.responseFields.length && b.responseFields.length ? 0.7 + 0.3 * fieldOverlap : 0.7;
        kind = "duplicate";
      } else {
        if (fieldOverlap < 0.5) continue;
        score = 0.4 + 0.5 * fieldOverlap;
        kind = "near-duplicate";
      }
      out.push({
        kind,
        score: Math.round(score * 100) / 100,
        method: a.method,
        shape: a.shape,
        operations: [
          { serviceId: a.serviceId, id: a.id, name: a.name, path: a.path },
          { serviceId: b.serviceId, id: b.id, name: b.name, path: b.path },
        ],
        evidence: [
          sameShape ? `Same method and path shape ${a.method} ${a.shape}` : `Same method and resource "${a.resource}"`,
          a.responseFields.length && b.responseFields.length
            ? `Response fields overlap ${Math.round(fieldOverlap * 100)}%`
            : "No response fields to compare",
        ],
      });
    }
  }
  return out.sort((x, y) => y.score - x.score);
};

/** The service that owns an entity: the one with resource operations for it. */
const ownersOf = (services) => {
  const owners = new Map(); // entity key → [{serviceId, operations}]
  services.forEach((service) => {
    if (service.isCollection) return; // a collection describes calls, not ownership
    service.operations.forEach((op) => {
      const key = tokenize(op.resource);
      if (!key) return;
      if (!owners.has(key)) owners.set(key, new Map());
      const perService = owners.get(key);
      if (!perService.has(service.id)) perService.set(service.id, []);
      perService.get(service.id).push(op.id);
    });
  });
  return owners;
};

/**
 * Edges between services. Three kinds, each with its evidence:
 *  – "calls": a request in one service (typically a collection) matches an
 *    operation another service declares — by server, or by path shape when
 *    the caller's host is a variable;
 *  – "references": a field named like `<entity>Id` in one service points at
 *    an entity another service owns;
 *  – "shares": both expose the same entity.
 */
const findEdges = (services, sharedEntities) => {
  const edges = [];
  const push = (edge) => {
    const existing = edges.find((e) => e.from === edge.from && e.to === edge.to && e.kind === edge.kind);
    if (existing) {
      existing.evidence.push(...edge.evidence);
      existing.weight += 1;
    } else edges.push({ ...edge, weight: 1 });
  };

  // calls
  services.forEach((caller) => {
    services.forEach((callee) => {
      if (caller.id === callee.id || !callee.operations.length) return;
      caller.operations.forEach((op) => {
        const hostMatch = callee.servers.some((s) => s && op.path.startsWith(s));
        const shapeMatch = callee.operations.find((c) => c.method === op.method && c.shape === op.shape && op.shape !== "/");
        if (hostMatch && shapeMatch) {
          push({ from: caller.id, to: callee.id, kind: "calls", confidence: 0.95, evidence: [`${op.method} ${op.path} matches ${callee.name}'s ${shapeMatch.method} ${shapeMatch.path} on its server`] });
        } else if (caller.isCollection && !hostMatch && shapeMatch && !callee.isCollection) {
          const ambiguous = services.filter((s) => s.id !== caller.id && s.id !== callee.id && !s.isCollection && s.operations.some((c) => c.method === op.method && c.shape === op.shape)).length;
          if (!ambiguous) {
            push({ from: caller.id, to: callee.id, kind: "calls", confidence: 0.6, evidence: [`${op.method} ${op.path} matches ${callee.name}'s ${shapeMatch.method} ${shapeMatch.path} by path shape (host is a variable)`] });
          }
        }
      });
    });
  });

  // references
  const owners = ownersOf(services);
  services.forEach((service) => {
    const seen = new Set();
    const consider = (fieldName, where) => {
      const m = String(fieldName).match(/^(.*?)(Id|ID|_id|Ref|Key|Number|No)$/);
      if (!m || !m[1]) return;
      const key = tokenize(singular(m[1]));
      const perService = owners.get(key);
      if (!perService) return;
      perService.forEach((opIds, ownerId) => {
        if (ownerId === service.id) return;
        const mark = `${ownerId}:${fieldName}`;
        if (seen.has(mark)) return;
        seen.add(mark);
        push({ from: service.id, to: ownerId, kind: "references", confidence: 0.7, evidence: [`${where} carries ${fieldName}, and ${services.find((s) => s.id === ownerId)?.name} owns "${key}" (${opIds.length} operation${opIds.length === 1 ? "" : "s"})`] });
      });
    };
    service.entities.forEach((e) => e.fields.forEach((f) => consider(f.name, `${e.name}`)));
    service.operations.forEach((op) => {
      op.requestFields.forEach((f) => consider(f.name, `${op.method} ${op.path} request`));
      op.params.forEach((p) => consider(p.name, `${op.method} ${op.path} parameter`));
    });
  });

  // shares
  sharedEntities.forEach((entity) => {
    const ids = entity.services;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        push({ from: ids[i], to: ids[j], kind: "shares", confidence: entity.inferred ? 0.5 : 0.9, evidence: [`Both expose ${entity.name}${entity.consistent ? "" : " with different shapes"}`] });
      }
    }
  });

  return edges;
};

/**
 * Fields across services that name the same thing.
 *
 * Deterministic and evidence-led, with each rule named in the result:
 *  – identifier form: `customerId`, `customer_id`, `CustomerRef` are the
 *    customer identifier; so is `id` on a Customer entity, and so is the
 *    path parameter of `/customers/{custId}` — the resource says what the
 *    parameter identifies, whatever it was abbreviated to;
 *  – same name: a non-generic field name (`shippingAddress`, `postalCode`)
 *    is one concept wherever it appears; a generic one (`id`, `name`,
 *    `status`) is only the same concept on the same entity;
 *  – shared example value: a field whose example equals an identifier
 *    cluster's example is moved into that cluster, on its own.
 * Nothing is joined on a guessed synonym or abbreviation.
 */
const GENERIC_FIELDS = new Set(["id", "name", "status", "type", "code", "value", "description", "title", "label", "key", "created", "updated", "created at", "updated at", "date", "count", "total", "amount", "url", "email"]);
const ID_SUFFIX = /^(.*?)(id|ref|key|number|no|code|uuid)$/;

const conceptKeyFor = (field) => {
  const tokens = tokenize(field.name);
  const joined = tokens.replace(/\s+/g, "");
  const owner = field.entityKey || field.resourceKey || "";
  const suffix = joined.match(ID_SUFFIX);
  if (suffix && suffix[1]) {
    const prefix = singular(suffix[1]);
    // {custId} on /customers/{custId}: "cust" abbreviates the resource, so
    // the parameter identifies a customer. {customerId} on /orders/{...}
    // does not abbreviate "order" and keeps its own meaning.
    if (field.kind === "parameter" && owner && prefix !== owner && prefix.length >= 3 && owner.startsWith(prefix)) {
      return { key: `${owner}#identifier`, rule: "identifier of its resource", confidence: 0.8 };
    }
    return { key: `${prefix}#identifier`, rule: "identifier form", confidence: 0.85 };
  }
  if (suffix && !suffix[1] && owner) {
    // "id" on Customer, or {id} on /customers/{id}
    return { key: `${owner}#identifier`, rule: "identifier of its resource", confidence: 0.8 };
  }
  if (GENERIC_FIELDS.has(tokens)) {
    return owner
      ? { key: `${owner}.${tokens}`, rule: "same name on the same entity", confidence: 0.9 }
      : { key: `?.${tokens}`, rule: "same name", confidence: 0.5 };
  }
  return { key: singular(joined), rule: "same name", confidence: 0.95 };
};

const findConcepts = (services) => {
  const fields = [];
  services.forEach((service) => {
    service.entities.forEach((entity) =>
      entity.fields.forEach((f) =>
        fields.push({ ...f, serviceId: service.id, serviceName: service.name, on: entity.name, entityKey: entity.key, kind: "entity" })));
    service.operations.forEach((op) =>
      op.params
        .filter((p) => p.in === "path" || p.in === "query")
        .forEach((p) =>
          fields.push({ name: p.name, type: p.type || "unknown", format: "", example: undefined, serviceId: service.id, serviceName: service.name, on: `${op.method} ${op.path}`, resourceKey: tokenize(op.resource), kind: "parameter" })));
  });

  const clusters = new Map();
  const place = (f, key, rule, confidence) => {
    if (!clusters.has(key)) clusters.set(key, { key, rules: new Set(), confidence, members: [] });
    const cluster = clusters.get(key);
    cluster.rules.add(rule);
    cluster.confidence = Math.min(cluster.confidence, confidence);
    cluster.members.push({ ...f, rule });
  };
  fields.forEach((f) => {
    const { key, rule, confidence } = conceptKeyFor(f);
    if (key.startsWith("?.")) return; // a generic name with no owner says nothing
    place(f, key, rule, confidence);
  });

  // A field elsewhere carrying the same example value as an identifier
  // cluster is that identifier under another name. Only that field moves.
  const exampleIndex = new Map();
  clusters.forEach((cluster) => {
    if (!cluster.key.endsWith("#identifier")) return;
    cluster.members.forEach((m) => {
      if (m.example === undefined || m.example === null || String(m.example).length < 4 || m.type === "boolean") return;
      exampleIndex.set(`${m.type}|${String(m.example)}`, cluster);
    });
  });
  clusters.forEach((cluster) => {
    if (cluster.key.endsWith("#identifier")) return;
    cluster.members = cluster.members.filter((m) => {
      const target = m.example !== undefined && m.example !== null ? exampleIndex.get(`${m.type}|${String(m.example)}`) : null;
      if (!target || target === cluster) return true;
      target.members.push({ ...m, rule: "shared example value" });
      target.rules.add("shared example value");
      target.confidence = Math.min(target.confidence, 0.7);
      return false;
    });
  });

  return [...clusters.values()]
    .filter((c) => c.members.length)
    .map((cluster) => {
      const names = [...new Set(cluster.members.map((m) => m.name))];
      const servicesInvolved = [...new Set(cluster.members.map((m) => m.serviceId))];
      const types = [...new Set(cluster.members.map((m) => m.type).filter((t) => t && t !== "unknown"))];
      const rules = [...cluster.rules];
      return {
        key: cluster.key,
        canonical: names.slice().sort((a, b) => a.length - b.length || a.localeCompare(b))[0],
        names,
        services: servicesInvolved,
        members: cluster.members.map((m) => ({ name: m.name, type: m.type, serviceId: m.serviceId, serviceName: m.serviceName, on: m.on, example: m.example, rule: m.rule })),
        rule: rules.join(" + "),
        confidence: Math.round(cluster.confidence * 100) / 100,
        divergentNames: names.length > 1,
        divergentTypes: types.length > 1,
        types,
      };
    })
    .filter((c) => c.services.length > 1)
    .sort((a, b) => Number(b.divergentNames) - Number(a.divergentNames) || b.services.length - a.services.length || a.key.localeCompare(b.key));
};

// ─── Findings ────────────────────────────────

const buildFindings = ({ services, sharedEntities, duplicateEndpoints, concepts, edges }) => {
  const findings = [];
  sharedEntities
    .filter((e) => !e.consistent)
    .forEach((e) =>
      findings.push({
        id: `inconsistent:${e.key}`,
        severity: "high",
        category: "consistency",
        title: `${e.name} has ${e.shapes} different shapes across ${e.services.length} services`,
        detail: e.comparisons
          .filter((c) => !c.consistent)
          .map((c) => {
            const bits = [];
            if (c.onlyLeft.length) bits.push(`only in ${serviceName(services, c.left.serviceId)}: ${c.onlyLeft.join(", ")}`);
            if (c.onlyRight.length) bits.push(`only in ${serviceName(services, c.right.serviceId)}: ${c.onlyRight.join(", ")}`);
            c.typeConflicts.forEach((t) => bits.push(`${t.name} is ${t.left} vs ${t.right}`));
            return bits.join("; ");
          })
          .join(" · "),
        services: e.services,
        inferred: e.inferred,
      }));
  duplicateEndpoints.forEach((d) =>
    findings.push({
      id: `duplicate:${d.operations[0].id}:${d.operations[1].id}`,
      severity: d.kind === "duplicate" ? "high" : "medium",
      category: "duplication",
      title: `${d.kind === "duplicate" ? "Duplicate" : "Near-duplicate"} endpoint: ${d.method} ${d.shape}`,
      detail: `${serviceName(services, d.operations[0].serviceId)} ${d.operations[0].path} and ${serviceName(services, d.operations[1].serviceId)} ${d.operations[1].path} (score ${d.score})`,
      services: d.operations.map((o) => o.serviceId),
    }));
  concepts
    .filter((c) => c.divergentNames)
    .forEach((c) =>
      findings.push({
        id: `concept:${c.key}`,
        severity: c.divergentTypes ? "high" : "medium",
        category: "naming",
        title: `One concept, ${c.names.length} names: ${c.names.join(", ")}`,
        detail: `${c.rule} (confidence ${c.confidence})${c.divergentTypes ? ` — and ${c.types.length} different types: ${c.types.join(", ")}` : ""}`,
        services: c.services,
      }));
  services
    .filter((s) => !s.isCollection && s.operations.length && s.operations.every((op) => !op.auth.length))
    .forEach((s) =>
      findings.push({
        id: `noauth:${s.id}`,
        severity: "medium",
        category: "security",
        title: `${s.name} declares no authentication on any operation`,
        detail: `${s.operations.length} operations, none with a security requirement`,
        services: [s.id],
      }));
  services
    .filter((s) => !s.isCollection && !edges.some((e) => e.from === s.id || e.to === s.id) && services.length > 1)
    .forEach((s) =>
      findings.push({
        id: `island:${s.id}`,
        severity: "info",
        category: "structure",
        title: `${s.name} shares nothing with the other services`,
        detail: "No shared entities, references or calls were found — it may be independent, or its contract may not describe its relationships",
        services: [s.id],
      }));
  const order = { high: 0, medium: 1, info: 2 };
  return findings.sort((a, b) => order[a.severity] - order[b.severity]);
};

const serviceName = (services, id) => services.find((s) => s.id === id)?.name || id;

// ─── Public API ──────────────────────────────

/**
 * Build the graph for a set of services.
 *
 * `inputs` are `{ id, name, spec, sourceUrl?, color? }`; a service whose
 * spec cannot be read is reported in `errors` rather than failing the rest.
 */
export const buildContractGraph = (inputs = []) => {
  const services = [];
  const errors = [];
  const seenIds = new Set();
  (Array.isArray(inputs) ? inputs : []).forEach((input, index) => {
    try {
      const id = String(input?.id || `svc-${index + 1}`);
      if (seenIds.has(id)) throw new Error(`Duplicate service id "${id}"`);
      seenIds.add(id);
      services.push(normalizeService({ ...input, id }, index));
    } catch (e) {
      errors.push({ id: input?.id || `svc-${index + 1}`, name: input?.name || "", message: e?.message || String(e) });
    }
  });

  const sharedEntities = findSharedEntities(services);
  const duplicateEndpoints = findDuplicateEndpoints(services);
  const edges = findEdges(services, sharedEntities);
  const concepts = findConcepts(services);
  const findings = buildFindings({ services, sharedEntities, duplicateEndpoints, concepts, edges });

  return {
    services,
    errors,
    entities: sharedEntities,
    duplicateEndpoints,
    edges,
    concepts,
    findings,
    stats: {
      services: services.length,
      operations: services.reduce((n, s) => n + s.operations.length, 0),
      entities: services.reduce((n, s) => n + s.entities.length, 0),
      sharedEntities: sharedEntities.length,
      inconsistentEntities: sharedEntities.filter((e) => !e.consistent).length,
      duplicates: duplicateEndpoints.length,
      edges: edges.length,
      concepts: concepts.length,
      findings: findings.length,
    },
  };
};

/** Every service reachable from `serviceId` by following edges backwards: who is affected if it changes. */
export const impactOf = (graph, serviceId) => {
  const affected = new Set();
  const queue = [serviceId];
  while (queue.length) {
    const current = queue.shift();
    graph.edges.forEach((edge) => {
      if (edge.to === current && edge.kind !== "shares" && !affected.has(edge.from) && edge.from !== serviceId) {
        affected.add(edge.from);
        queue.push(edge.from);
      }
    });
  }
  return [...affected];
};

/** A Mermaid flowchart of the service map, for wikis and READMEs. */
export const toMermaid = (graph) => {
  const lines = ["flowchart LR"];
  const label = (s) => s.name.replace(/["[\]]/g, "");
  graph.services.forEach((s) => lines.push(`  ${s.id}["${label(s)}"]`));
  graph.edges.forEach((e) => {
    const arrow = e.kind === "calls" ? "-->" : e.kind === "references" ? "-.->" : "---";
    lines.push(`  ${e.from} ${arrow}|${e.kind}| ${e.to}`);
  });
  return lines.join("\n");
};
