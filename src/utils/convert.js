/**
 * Specification converters.
 *
 * Vizroute can load OpenAPI, Swagger 2.0, Postman and plain JSON; this module
 * takes whatever was loaded and writes it back out in another one of those
 * formats.
 *
 * Two rules run through everything here:
 *
 * 1. Convert the source document when the source document has the answer.
 *    An OpenAPI file carries components, $refs and full schemas that the
 *    parsed node list throws away, so OpenAPI→Swagger transforms the document
 *    itself. Postman and loose JSON have no such structure, so those go
 *    through the node list, which is all the information there is.
 *
 * 2. Never invent. A field the source does not declare is left out, and every
 *    place where the target format cannot represent something is reported in
 *    `notes` instead of being papered over.
 */

import yaml from "js-yaml";
import { HTTP_METHODS } from "./constants";

// ─── Small shared helpers ────────────────────

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Structural copy. Anything exotic (Date, Map, class instance) is left alone. */
const clone = (value, seen = new WeakSet()) => {
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return undefined; // a cycle cannot be represented anyway
  seen.add(value);
  if (Array.isArray(value)) return value.map((v) => clone(v, seen));
  const out = {};
  Object.entries(value).forEach(([key, v]) => {
    const copied = clone(v, seen);
    if (copied !== undefined) out[key] = copied;
  });
  return out;
};

/** Collects human-readable notes about anything the target format loses. */
const noteBook = () => {
  const seen = new Set();
  const list = [];
  return {
    list,
    add(message) {
      if (message && !seen.has(message)) {
        seen.add(message);
        list.push(message);
      }
    },
  };
};

/** Rewrite every `$ref` prefix in a document, in place. */
const rewriteRefs = (value, replacements, seen = new WeakSet()) => {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item) => rewriteRefs(item, replacements, seen));
    return;
  }
  if (typeof value.$ref === "string") {
    replacements.forEach(([from, to]) => {
      if (value.$ref.startsWith(from)) {
        value.$ref = to + value.$ref.slice(from.length);
      }
    });
  }
  Object.values(value).forEach((item) => rewriteRefs(item, replacements, seen));
};

/**
 * Split an origin off a URL textually.
 *
 * `new URL` would percent-encode the `{id}` and `{{baseUrl}}` placeholders that
 * are the whole point of a spec path, so the origin is matched by hand. A
 * leading Postman variable is treated as an origin too, because in practice
 * that is exactly what `{{baseUrl}}` stands in for.
 */
export const splitOrigin = (raw) => {
  const url = String(raw || "");
  const absolute = url.match(/^([a-zA-Z][\w+.-]*:\/\/[^/?#]+)([/?#].*)?$/);
  if (absolute) return { origin: absolute[1], rest: absolute[2] || "/" };
  const variable = url.match(/^(\{\{[^}]+\}\})(.*)$/);
  if (variable) return { origin: variable[1], rest: variable[2] || "/" };
  return { origin: "", rest: url };
};

/** `/users/:id` and `/users/{id}` both mean the same thing; OpenAPI spells it `{id}`. */
const toPathTemplate = (rest) => {
  const path = String(rest || "/").split("?")[0].split("#")[0];
  const templated = path.replace(
    /:([a-zA-Z_][a-zA-Z0-9_-]*)/g,
    (_, name) => `{${name}}`,
  );
  return templated.startsWith("/") ? templated : `/${templated}`;
};

/** Postman spells a path variable `:id`. */
const toPostmanPath = (template) =>
  String(template || "/").replace(/\{([^}/]+)\}/g, (_, name) => `:${name}`);

/**
 * A schema derived from an example value.
 *
 * The shape is read off the data the spec already ships, so nothing is
 * invented — it just makes the exported document useful to code generators,
 * which cannot do anything with a bare example.
 */
export const inferSchema = (value, depth = 0) => {
  if (value === null) return { type: "null" };
  if (Array.isArray(value)) {
    return {
      type: "array",
      items: value.length ? inferSchema(value[0], depth + 1) : {},
    };
  }
  switch (typeof value) {
    case "string":
      return { type: "string" };
    case "number":
      return Number.isInteger(value) ? { type: "integer" } : { type: "number" };
    case "boolean":
      return { type: "boolean" };
    case "object": {
      if (depth >= 8) return { type: "object" }; // deep enough to be useful
      const properties = {};
      Object.entries(value).forEach(([key, item]) => {
        properties[key] = inferSchema(item, depth + 1);
      });
      return { type: "object", properties };
    }
    default:
      return {};
  }
};

// ─── Swagger 2.0 → OpenAPI 3.1 ───────────────

const V2_VALIDATION_KEYS = [
  "maximum",
  "exclusiveMaximum",
  "minimum",
  "exclusiveMinimum",
  "maxLength",
  "minLength",
  "pattern",
  "maxItems",
  "minItems",
  "uniqueItems",
  "enum",
  "multipleOf",
  "default",
];

/** A Swagger 2.0 `items` object is already schema-shaped, bar the file type. */
const itemsToSchema = (items) => {
  if (!isObject(items)) return {};
  const schema = {};
  if (items.type === "file") {
    schema.type = "string";
    schema.format = "binary";
  } else {
    if (items.type) schema.type = items.type;
    if (items.format) schema.format = items.format;
  }
  if (items.items) schema.items = itemsToSchema(items.items);
  V2_VALIDATION_KEYS.forEach((key) => {
    if (items[key] !== undefined) schema[key] = items[key];
  });
  return schema;
};

/** Swagger 2.0 kept serialisation on the parameter; OpenAPI 3 has style/explode. */
const styleFor = (location, collectionFormat) => {
  if (location === "path" || location === "header") {
    return collectionFormat === "csv" || !collectionFormat
      ? { style: "simple", explode: false }
      : {};
  }
  switch (collectionFormat) {
    case "ssv":
      return { style: "spaceDelimited", explode: false };
    case "pipes":
      return { style: "pipeDelimited", explode: false };
    case "multi":
      return { style: "form", explode: true };
    case "csv":
      return { style: "form", explode: false };
    default:
      return {};
  }
};

const parameterToV3 = (param, notes) => {
  if (!isObject(param)) return null;
  if (param.$ref) return { $ref: param.$ref };

  const schema = {};
  if (param.type === "file") {
    schema.type = "string";
    schema.format = "binary";
  } else {
    if (param.type) schema.type = param.type;
    if (param.format) schema.format = param.format;
  }
  if (param.items) schema.items = itemsToSchema(param.items);
  V2_VALIDATION_KEYS.forEach((key) => {
    if (param[key] !== undefined) schema[key] = param[key];
  });

  const out = { name: param.name, in: param.in };
  if (param.description) out.description = param.description;
  if (param.required || param.in === "path") out.required = true;
  if (param.deprecated) out.deprecated = true;
  if (param.allowEmptyValue) out.allowEmptyValue = true;
  Object.assign(out, styleFor(param.in, param.collectionFormat));
  if (param.collectionFormat === "tsv") {
    notes.add(
      `Parameter "${param.name}" used the tab-separated collectionFormat, which OpenAPI 3 has no equivalent for.`,
    );
  }
  out.schema = schema;
  return out;
};

const responseToV3 = (response, produces, notes) => {
  if (!isObject(response)) return { description: "" };
  if (response.$ref) return { $ref: response.$ref };

  const out = { description: response.description || "" };
  if (!response.description) {
    notes.add("Some responses had no description; an empty one was written.");
  }

  if (isObject(response.headers)) {
    out.headers = {};
    Object.entries(response.headers).forEach(([name, header]) => {
      const headerOut = {};
      if (header?.description) headerOut.description = header.description;
      headerOut.schema = itemsToSchema(header);
      out.headers[name] = headerOut;
    });
  }

  const examples = isObject(response.examples) ? response.examples : null;
  const mediaTypes = produces.length
    ? produces
    : examples
      ? Object.keys(examples)
      : [];

  if (response.schema || examples) {
    out.content = {};
    (mediaTypes.length ? mediaTypes : ["application/json"]).forEach((type) => {
      const media = {};
      if (response.schema) media.schema = clone(response.schema);
      if (examples && examples[type] !== undefined) media.example = examples[type];
      out.content[type] = media;
    });
    if (!mediaTypes.length) {
      notes.add(
        "The source declared no `produces`, so response bodies were written as application/json.",
      );
    }
  }
  return out;
};

const securityToV3 = (definitions, notes) => {
  const out = {};
  Object.entries(definitions || {}).forEach(([name, scheme]) => {
    if (!isObject(scheme)) return;
    if (scheme.type === "basic") {
      out[name] = { type: "http", scheme: "basic" };
      if (scheme.description) out[name].description = scheme.description;
      return;
    }
    if (scheme.type === "apiKey") {
      out[name] = { type: "apiKey", name: scheme.name, in: scheme.in };
      if (scheme.description) out[name].description = scheme.description;
      return;
    }
    if (scheme.type === "oauth2") {
      const flows = {};
      const scopes = scheme.scopes || {};
      if (scheme.flow === "implicit") {
        flows.implicit = { authorizationUrl: scheme.authorizationUrl, scopes };
      } else if (scheme.flow === "password") {
        flows.password = { tokenUrl: scheme.tokenUrl, scopes };
      } else if (scheme.flow === "application") {
        flows.clientCredentials = { tokenUrl: scheme.tokenUrl, scopes };
      } else if (scheme.flow === "accessCode") {
        flows.authorizationCode = {
          authorizationUrl: scheme.authorizationUrl,
          tokenUrl: scheme.tokenUrl,
          scopes,
        };
      }
      out[name] = { type: "oauth2", flows };
      if (scheme.description) out[name].description = scheme.description;
      return;
    }
    notes.add(`Security scheme "${name}" had an unrecognised type and was skipped.`);
  });
  return out;
};

const upgradeSwagger2 = (source, notes) => {
  const spec = clone(source);
  const out = { openapi: "3.1.0", info: clone(spec.info) || {} };
  if (!out.info.title) out.info.title = "API";
  if (!out.info.version) {
    out.info.version = "1.0.0";
    notes.add("The source declared no API version; 1.0.0 was written.");
  }

  // host + basePath + schemes become servers
  if (spec.host) {
    const schemes = Array.isArray(spec.schemes) && spec.schemes.length ? spec.schemes : ["https"];
    if (!spec.schemes) {
      notes.add("The source declared no schemes; https was assumed for the server URL.");
    }
    out.servers = schemes.map((scheme) => ({
      url: `${scheme}://${spec.host}${spec.basePath || ""}`,
    }));
  } else if (spec.basePath) {
    out.servers = [{ url: spec.basePath }];
  }

  if (spec.externalDocs) out.externalDocs = spec.externalDocs;
  if (spec.tags) out.tags = spec.tags;
  if (spec.security) out.security = spec.security;

  const globalConsumes = Array.isArray(spec.consumes) ? spec.consumes : [];
  const globalProduces = Array.isArray(spec.produces) ? spec.produces : [];

  out.paths = {};
  Object.entries(spec.paths || {}).forEach(([path, pathItem]) => {
    if (!isObject(pathItem)) return;
    const outItem = {};
    if (Array.isArray(pathItem.parameters)) {
      outItem.parameters = pathItem.parameters
        .map((p) => parameterToV3(p, notes))
        .filter(Boolean)
        .filter((p) => p.in !== "body" && p.in !== "formData");
    }

    HTTP_METHODS.forEach((method) => {
      const operation = pathItem[method];
      if (!isObject(operation)) return;

      const op = {};
      ["tags", "summary", "description", "operationId", "externalDocs", "deprecated", "security"].forEach(
        (key) => {
          if (operation[key] !== undefined) op[key] = clone(operation[key]);
        },
      );

      const params = Array.isArray(operation.parameters) ? operation.parameters : [];
      const bodyParam = params.find((p) => isObject(p) && p.in === "body");
      const formParams = params.filter((p) => isObject(p) && p.in === "formData");
      const rest = params.filter(
        (p) => isObject(p) && p.in !== "body" && p.in !== "formData",
      );

      const converted = rest.map((p) => parameterToV3(p, notes)).filter(Boolean);
      if (converted.length) op.parameters = converted;

      const consumes = Array.isArray(operation.consumes) ? operation.consumes : globalConsumes;
      const produces = Array.isArray(operation.produces) ? operation.produces : globalProduces;

      if (bodyParam) {
        const types = consumes.length ? consumes : ["application/json"];
        if (!consumes.length) {
          notes.add(
            "The source declared no `consumes`, so request bodies were written as application/json.",
          );
        }
        op.requestBody = { content: {} };
        if (bodyParam.description) op.requestBody.description = bodyParam.description;
        if (bodyParam.required) op.requestBody.required = true;
        types.forEach((type) => {
          op.requestBody.content[type] = bodyParam.schema
            ? { schema: clone(bodyParam.schema) }
            : {};
        });
      } else if (formParams.length) {
        const hasFile = formParams.some((p) => p.type === "file");
        const type = hasFile ? "multipart/form-data" : "application/x-www-form-urlencoded";
        const properties = {};
        const required = [];
        formParams.forEach((p) => {
          properties[p.name] = itemsToSchema(p);
          if (p.description) properties[p.name].description = p.description;
          if (p.required) required.push(p.name);
        });
        const schema = { type: "object", properties };
        if (required.length) schema.required = required;
        op.requestBody = { content: { [type]: { schema } } };
      }

      if (operation.responses) {
        op.responses = {};
        Object.entries(operation.responses).forEach(([status, response]) => {
          op.responses[status] = responseToV3(response, produces, notes);
        });
      }

      if (operation.schemes) {
        notes.add(
          "Per-operation `schemes` have no OpenAPI 3 equivalent and were dropped.",
        );
      }

      outItem[method] = op;
    });

    out.paths[path] = outItem;
  });

  const components = {};
  if (spec.definitions) components.schemas = clone(spec.definitions);
  if (spec.securityDefinitions) {
    components.securitySchemes = securityToV3(spec.securityDefinitions, notes);
  }
  if (spec.parameters) {
    components.parameters = {};
    Object.entries(spec.parameters).forEach(([name, param]) => {
      const converted = parameterToV3(param, notes);
      if (converted) components.parameters[name] = converted;
    });
  }
  if (spec.responses) {
    components.responses = {};
    Object.entries(spec.responses).forEach(([name, response]) => {
      components.responses[name] = responseToV3(response, globalProduces, notes);
    });
  }
  if (Object.keys(components).length) out.components = components;

  rewriteRefs(out, [
    ["#/definitions/", "#/components/schemas/"],
    ["#/parameters/", "#/components/parameters/"],
    ["#/responses/", "#/components/responses/"],
  ]);

  Object.keys(spec).forEach((key) => {
    if (key.startsWith("x-")) out[key] = clone(spec[key]);
  });

  return out;
};

// ─── OpenAPI 3.0 → 3.1 ───────────────────────

/** The 3.0 keywords that 3.1 replaced, rewritten in place. */
const modernizeSchemas = (value, seen = new WeakSet()) => {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item) => modernizeSchemas(item, seen));
    return;
  }

  if (value.nullable === true && value.type) {
    value.type = Array.isArray(value.type) ? [...value.type, "null"] : [value.type, "null"];
    delete value.nullable;
  } else if (value.nullable !== undefined) {
    delete value.nullable;
  }

  // 3.0 wrote `exclusiveMinimum: true` next to `minimum`; 3.1 makes it the value.
  if (value.exclusiveMinimum === true && typeof value.minimum === "number") {
    value.exclusiveMinimum = value.minimum;
    delete value.minimum;
  } else if (value.exclusiveMinimum === false) {
    delete value.exclusiveMinimum;
  }
  if (value.exclusiveMaximum === true && typeof value.maximum === "number") {
    value.exclusiveMaximum = value.maximum;
    delete value.maximum;
  } else if (value.exclusiveMaximum === false) {
    delete value.exclusiveMaximum;
  }

  Object.values(value).forEach((item) => modernizeSchemas(item, seen));
};

const upgradeOpenApi30 = (source) => {
  const out = clone(source);
  out.openapi = "3.1.0";
  modernizeSchemas(out.paths);
  modernizeSchemas(out.components);
  return out;
};

// ─── Nodes → OpenAPI 3.1 ─────────────────────

/** Everything the exported document needs that is not on an individual node. */
const collectionMeta = (spec, nodes) => {
  const root = nodes.find((n) => n.type === "root");
  return {
    title:
      spec?.info?.title || spec?.info?.name || spec?.name || root?.name || "API",
    version: spec?.info?.version || root?.version || "",
    description:
      (typeof spec?.info?.description === "string" && spec.info.description) ||
      spec?.info?.description?.content ||
      "",
  };
};

/**
 * Postman keeps its variables on the collection; they are the closest thing it
 * has to an OpenAPI server variable, so real declared values are reused rather
 * than guessed at.
 */
const postmanVariables = (spec) => {
  const out = {};
  (Array.isArray(spec?.variable) ? spec.variable : []).forEach((v) => {
    if (v?.key) out[v.key] = String(v.value ?? "");
  });
  return out;
};

const openApiFromNodes = ({ spec, nodes }, notes) => {
  const meta = collectionMeta(spec, nodes);
  const requests = nodes.filter((n) => n.type === "request");
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const variables = postmanVariables(spec);

  // The origin most endpoints share becomes the server; the rest get their own
  // at the path level, which is exactly what OpenAPI's per-path servers are for.
  const originCount = new Map();
  requests.forEach((node) => {
    const { origin } = splitOrigin(node.path);
    if (origin) originCount.set(origin, (originCount.get(origin) || 0) + 1);
  });
  const primaryOrigin =
    [...originCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";

  const serverFor = (origin) => {
    const server = { url: origin.replace(/\{\{([^}]+)\}\}/g, (_, name) => `{${name}}`) };
    const used = [...origin.matchAll(/\{\{([^}]+)\}\}/g)].map((m) => m[1]);
    if (used.length) {
      server.variables = {};
      used.forEach((name) => {
        server.variables[name] = { default: variables[name] ?? "" };
        if (variables[name] === undefined) {
          notes.add(
            `The collection uses the variable "${name}" in its URLs but never declares a value for it.`,
          );
        }
      });
    }
    return server;
  };

  const out = {
    openapi: "3.1.0",
    info: { title: meta.title, version: meta.version || "1.0.0" },
  };
  if (!meta.version) {
    notes.add("The source declared no API version; 1.0.0 was written.");
  }
  if (meta.description) out.info.description = meta.description;
  if (primaryOrigin) out.servers = [serverFor(primaryOrigin)];

  const tags = [];
  const seenTags = new Set();
  const securitySchemes = {};
  let inferredTypes = false;

  const paths = {};
  requests.forEach((node) => {
    const { origin, rest } = splitOrigin(node.path);
    const template = node.template || toPathTemplate(rest);
    const method = String(node.method || "GET").toLowerCase();
    if (!HTTP_METHODS.includes(method)) {
      notes.add(`"${node.method}" is not an HTTP method OpenAPI describes; ${node.name} was skipped.`);
      return;
    }

    if (!paths[template]) paths[template] = {};
    if (paths[template][method]) {
      notes.add(
        `Two requests map to ${method.toUpperCase()} ${template}; only the first was written.`,
      );
      return;
    }

    const folder = node.parentId ? byId.get(node.parentId) : null;
    const tag = folder && folder.type === "folder" ? folder.name : null;
    if (tag && !seenTags.has(tag)) {
      seenTags.add(tag);
      tags.push(folder.description ? { name: tag, description: folder.description } : { name: tag });
    }

    const operation = {};
    if (tag) operation.tags = [tag];
    if (node.name) operation.summary = node.name;
    if (node.description && node.description !== node.name) {
      operation.description = node.description;
    }
    if (node.deprecated) operation.deprecated = true;

    const parameters = (node.params || [])
      .filter((p) => p && p.name && ["path", "query", "header", "cookie"].includes(p.in))
      .map((p) => {
        const param = { name: p.name, in: p.in };
        if (p.description) param.description = p.description;
        if (p.required || p.in === "path") param.required = true;
        if (p.type) {
          param.schema = { type: p.type };
        } else {
          param.schema = { type: "string" };
          inferredTypes = true;
        }
        if (p.example !== undefined && p.example !== "") param.example = p.example;
        return param;
      });
    if (parameters.length) operation.parameters = parameters;

    if (node.body != null) {
      const schema = node.requestBodySchema || inferSchema(node.body);
      operation.requestBody = {
        content: {
          "application/json": { schema, example: node.body },
        },
      };
      if (!node.requestBodySchema) {
        notes.add("Request body schemas were derived from the example bodies in the source.");
      }
    }

    const responses = {};
    (node.responses || []).forEach((response) => {
      const status = String(response.status || "").trim() || "default";
      const entry = { description: response.description || "" };
      if (response.example !== undefined || response.schema) {
        const type = response.contentType || "application/json";
        const media = {};
        if (response.schema) media.schema = clone(response.schema);
        else if (response.example !== undefined) media.schema = inferSchema(response.example);
        if (response.example !== undefined) media.example = response.example;
        entry.content = { [type]: media };
      }
      responses[status] = entry;
    });
    if (Object.keys(responses).length) operation.responses = responses;

    (node.auth || []).forEach((auth) => {
      const key = auth.name || auth.type;
      if (!key) return;
      if (!securitySchemes[key]) {
        if (auth.type === "bearer" || auth.scheme === "bearer") {
          securitySchemes[key] = { type: "http", scheme: "bearer" };
        } else if (auth.type === "basic" || auth.scheme === "basic") {
          securitySchemes[key] = { type: "http", scheme: "basic" };
        } else if (auth.type === "apikey" || auth.type === "apiKey") {
          if (auth.headerName) {
            securitySchemes[key] = {
              type: "apiKey",
              name: auth.headerName,
              in: auth.location || "header",
            };
          } else {
            notes.add(
              "The source requires an API key for some requests but does not say which header or query parameter carries it.",
            );
            return;
          }
        } else if (auth.type === "oauth2") {
          notes.add(
            "OAuth 2 is required by the source but it declares no flow URLs, so no security scheme could be written.",
          );
          return;
        } else {
          return;
        }
      }
      operation.security = [
        ...(operation.security || []),
        { [key]: auth.scopes || [] },
      ];
    });

    // A request pointing somewhere other than the main server keeps its own.
    const pathItem = paths[template];
    if (origin && origin !== primaryOrigin) {
      pathItem.servers = [serverFor(origin)];
    }
    pathItem[method] = operation;
  });

  out.paths = paths;
  if (tags.length) out.tags = tags;
  if (Object.keys(securitySchemes).length) {
    out.components = { securitySchemes };
  }
  if (inferredTypes) {
    notes.add(
      "Parameters whose type the source never declared were written as strings.",
    );
  }
  return out;
};

// ─── OpenAPI 3.x → Swagger 2.0 ───────────────

const SWAGGER_TYPES = new Set([
  "string",
  "number",
  "integer",
  "boolean",
  "array",
  "object",
  "file",
]);

/** Rewrite JSON Schema 2020-12 constructs Swagger 2.0 never had. */
const downgradeSchemas = (value, notes, seen = new WeakSet()) => {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item) => downgradeSchemas(item, notes, seen));
    return;
  }

  if (Array.isArray(value.type)) {
    const concrete = value.type.filter((t) => t !== "null");
    if (value.type.includes("null")) value["x-nullable"] = true;
    value.type = concrete[0] || "string";
    if (concrete.length > 1) {
      notes.add(
        "Schemas that allowed several types were narrowed to the first — Swagger 2.0 has one type per schema.",
      );
    }
  }
  if (value.type && !SWAGGER_TYPES.has(value.type)) {
    if (value.type === "null") value["x-nullable"] = true;
    delete value.type;
  }
  if (value.const !== undefined) {
    value.enum = [value.const];
    delete value.const;
  }
  if (Array.isArray(value.examples)) {
    if (value.example === undefined && value.examples.length) {
      [value.example] = value.examples;
    }
    delete value.examples;
  }
  if (typeof value.exclusiveMinimum === "number") {
    value.minimum = value.exclusiveMinimum;
    value.exclusiveMinimum = true;
  }
  if (typeof value.exclusiveMaximum === "number") {
    value.maximum = value.exclusiveMaximum;
    value.exclusiveMaximum = true;
  }
  ["oneOf", "anyOf", "not", "if", "then", "else", "prefixItems", "contentMediaType"].forEach(
    (key) => {
      if (value[key] !== undefined) {
        delete value[key];
        notes.add(
          "JSON Schema keywords Swagger 2.0 does not support (oneOf, anyOf, not, …) were removed.",
        );
      }
    },
  );

  Object.values(value).forEach((item) => downgradeSchemas(item, notes, seen));
};

const collectionFormatFor = (param) => {
  if (param.style === "spaceDelimited") return "ssv";
  if (param.style === "pipeDelimited") return "pipes";
  if (param.style === "form" && param.explode !== false) return "multi";
  return "csv";
};

const parameterToV2 = (param, notes) => {
  if (!isObject(param)) return null;
  if (param.$ref) return { $ref: param.$ref };
  if (param.in === "cookie") {
    notes.add("Cookie parameters were dropped — Swagger 2.0 has no such location.");
    return null;
  }

  const out = { name: param.name, in: param.in };
  if (param.description) out.description = param.description;
  out.required = param.in === "path" ? true : !!param.required;

  const schema = param.schema;
  if (isObject(schema)) {
    if (schema.$ref) {
      out.type = "string";
      notes.add(
        `Parameter "${param.name}" referenced a shared schema; Swagger 2.0 only allows one on a body, so it was written as a string.`,
      );
    } else {
      const flat = clone(schema);
      downgradeSchemas(flat, notes);
      Object.assign(out, flat);
      if (out.type === "array" && !out.items) out.items = {};
      if (out.type === "array") out.collectionFormat = collectionFormatFor(param);
    }
  } else if (param.content) {
    out.type = "string";
    notes.add(
      `Parameter "${param.name}" was serialised through a media type, which Swagger 2.0 cannot express; it was written as a string.`,
    );
  }
  if (param.example !== undefined) out["x-example"] = param.example;
  return out;
};

const downgradeToSwagger2 = (source, notes) => {
  const spec = clone(source);
  const out = { swagger: "2.0", info: clone(spec.info) || {} };
  if (!out.info.title) out.info.title = "API";
  if (!out.info.version) out.info.version = "1.0.0";

  // servers → schemes / host / basePath
  const servers = Array.isArray(spec.servers) ? spec.servers : [];
  if (servers.length > 1) {
    notes.add(
      `The source declared ${servers.length} servers; Swagger 2.0 holds one, so the first was used.`,
    );
  }
  if (servers[0]?.url) {
    let url = String(servers[0].url);
    Object.entries(servers[0].variables || {}).forEach(([name, variable]) => {
      if (variable?.default !== undefined) {
        url = url.split(`{${name}}`).join(String(variable.default));
      }
    });
    const match = url.match(/^([a-zA-Z][\w+.-]*):\/\/([^/?#]+)(\/[^?#]*)?$/);
    if (match) {
      out.schemes = [match[1]];
      [, , out.host] = match;
      if (match[3] && match[3] !== "/") out.basePath = match[3].replace(/\/$/, "");
    } else if (url.startsWith("/")) {
      out.basePath = url.replace(/\/$/, "") || "/";
    } else {
      notes.add(`The server URL "${url}" is relative and could not be split into host and basePath.`);
    }
  }

  if (spec.externalDocs) out.externalDocs = spec.externalDocs;
  if (spec.tags) out.tags = spec.tags;
  if (spec.security) out.security = clone(spec.security);

  const consumesSeen = new Set();
  const producesSeen = new Set();

  out.paths = {};
  Object.entries(spec.paths || {}).forEach(([path, pathItem]) => {
    if (!isObject(pathItem)) return;
    const outItem = {};
    if (pathItem.servers) {
      notes.add(
        "Per-path server overrides were dropped — Swagger 2.0 has a single host for the whole document.",
      );
    }
    if (Array.isArray(pathItem.parameters)) {
      const converted = pathItem.parameters.map((p) => parameterToV2(p, notes)).filter(Boolean);
      if (converted.length) outItem.parameters = converted;
    }

    HTTP_METHODS.forEach((method) => {
      const operation = pathItem[method];
      if (!isObject(operation)) return;
      const op = {};
      ["tags", "summary", "description", "operationId", "externalDocs", "deprecated", "security"].forEach(
        (key) => {
          if (operation[key] !== undefined) op[key] = clone(operation[key]);
        },
      );

      const parameters = (Array.isArray(operation.parameters) ? operation.parameters : [])
        .map((p) => parameterToV2(p, notes))
        .filter(Boolean);

      const body = operation.requestBody;
      if (isObject(body)) {
        const content = isObject(body.content) ? body.content : {};
        const [mediaType, media] = Object.entries(content)[0] || [];
        if (mediaType) {
          consumesSeen.add(mediaType);
          op.consumes = [mediaType];
          if (Object.keys(content).length > 1) {
            notes.add(
              "Request bodies offered several media types; Swagger 2.0 keeps one schema, so the first was used.",
            );
          }
          const isForm =
            mediaType === "application/x-www-form-urlencoded" ||
            mediaType.startsWith("multipart/");
          if (isForm && isObject(media?.schema?.properties)) {
            const required = new Set(media.schema.required || []);
            Object.entries(media.schema.properties).forEach(([name, property]) => {
              const flat = clone(property);
              downgradeSchemas(flat, notes);
              parameters.push({
                name,
                in: "formData",
                required: required.has(name),
                ...flat,
              });
            });
          } else {
            const schema = media?.schema ? clone(media.schema) : {};
            downgradeSchemas(schema, notes);
            const param = { name: "body", in: "body", required: !!body.required, schema };
            if (body.description) param.description = body.description;
            parameters.push(param);
          }
        }
      }

      if (parameters.length) op.parameters = parameters;

      op.responses = {};
      Object.entries(operation.responses || {}).forEach(([status, response]) => {
        if (!isObject(response)) return;
        if (response.$ref) {
          op.responses[status] = { $ref: response.$ref };
          return;
        }
        const entry = { description: response.description || "" };
        const content = isObject(response.content) ? response.content : {};
        const [mediaType, media] = Object.entries(content)[0] || [];
        if (mediaType) {
          producesSeen.add(mediaType);
          op.produces = [...new Set([...(op.produces || []), mediaType])];
          if (media?.schema) {
            const schema = clone(media.schema);
            downgradeSchemas(schema, notes);
            entry.schema = schema;
          }
          if (media?.example !== undefined) {
            entry.examples = { [mediaType]: media.example };
          }
        }
        if (isObject(response.headers)) {
          entry.headers = {};
          Object.entries(response.headers).forEach(([name, header]) => {
            const flat = header?.schema ? clone(header.schema) : {};
            downgradeSchemas(flat, notes);
            if (header?.description) flat.description = header.description;
            entry.headers[name] = flat;
          });
        }
        op.responses[status] = entry;
      });
      if (!Object.keys(op.responses).length) {
        op.responses = { default: { description: "" } };
        notes.add(
          "Operations with no declared responses were given an empty default — Swagger 2.0 requires one.",
        );
      }

      if (operation.callbacks) {
        notes.add("Callbacks were dropped — Swagger 2.0 has no equivalent.");
      }
      if (operation.servers) {
        notes.add(
          "Per-operation server overrides were dropped — Swagger 2.0 has a single host for the whole document.",
        );
      }

      outItem[method] = op;
    });

    out.paths[path] = outItem;
  });

  const components = isObject(spec.components) ? spec.components : {};
  if (components.schemas) {
    out.definitions = clone(components.schemas);
    downgradeSchemas(out.definitions, notes);
  }
  if (components.parameters) {
    out.parameters = {};
    Object.entries(components.parameters).forEach(([name, param]) => {
      const converted = parameterToV2(param, notes);
      if (converted) out.parameters[name] = converted;
    });
  }
  if (components.responses) {
    out.responses = {};
    Object.entries(components.responses).forEach(([name, response]) => {
      const entry = { description: response?.description || "" };
      const [mediaType, media] = Object.entries(response?.content || {})[0] || [];
      if (media?.schema) {
        const schema = clone(media.schema);
        downgradeSchemas(schema, notes);
        entry.schema = schema;
      }
      if (mediaType && media?.example !== undefined) {
        entry.examples = { [mediaType]: media.example };
      }
      out.responses[name] = entry;
    });
  }
  if (components.requestBodies) {
    notes.add(
      "Shared request bodies were dropped — Swagger 2.0 has no components/requestBodies.",
    );
  }
  if (components.securitySchemes) {
    out.securityDefinitions = {};
    Object.entries(components.securitySchemes).forEach(([name, scheme]) => {
      if (!isObject(scheme)) return;
      if (scheme.type === "apiKey") {
        out.securityDefinitions[name] = {
          type: "apiKey",
          name: scheme.name,
          in: scheme.in,
        };
      } else if (scheme.type === "http" && scheme.scheme === "basic") {
        out.securityDefinitions[name] = { type: "basic" };
      } else if (scheme.type === "http") {
        out.securityDefinitions[name] = {
          type: "apiKey",
          name: "Authorization",
          in: "header",
        };
        notes.add(
          `"${name}" uses HTTP ${scheme.scheme} auth, which Swagger 2.0 cannot express; it was written as an Authorization header.`,
        );
      } else if (scheme.type === "oauth2") {
        const flows = scheme.flows || {};
        const [flowName, flow] = Object.entries(flows)[0] || [];
        const map = {
          implicit: "implicit",
          password: "password",
          clientCredentials: "application",
          authorizationCode: "accessCode",
        };
        if (flowName && flow) {
          out.securityDefinitions[name] = {
            type: "oauth2",
            flow: map[flowName] || "implicit",
            scopes: flow.scopes || {},
          };
          if (flow.authorizationUrl) {
            out.securityDefinitions[name].authorizationUrl = flow.authorizationUrl;
          }
          if (flow.tokenUrl) out.securityDefinitions[name].tokenUrl = flow.tokenUrl;
          if (Object.keys(flows).length > 1) {
            notes.add(
              `"${name}" declared several OAuth flows; Swagger 2.0 holds one, so the first was used.`,
            );
          }
        }
      } else {
        notes.add(`Security scheme "${name}" has no Swagger 2.0 equivalent and was dropped.`);
      }
    });
  }
  if (components.callbacks || components.links) {
    notes.add("Links and callbacks were dropped — Swagger 2.0 has no equivalent.");
  }

  if (consumesSeen.size) out.consumes = [...consumesSeen];
  if (producesSeen.size) out.produces = [...producesSeen];

  rewriteRefs(out, [
    ["#/components/schemas/", "#/definitions/"],
    ["#/components/parameters/", "#/parameters/"],
    ["#/components/responses/", "#/responses/"],
  ]);

  Object.keys(spec).forEach((key) => {
    if (key.startsWith("x-")) out[key] = clone(spec[key]);
  });

  return out;
};

// ─── Nodes → Postman collection v2.1 ─────────

const POSTMAN_SCHEMA =
  "https://schema.getpostman.com/json/collection/v2.1.0/collection.json";

const postmanUrl = (node, primaryOrigin) => {
  const { origin, rest } = splitOrigin(node.path);
  const template = node.template || toPathTemplate(rest);
  const host = origin && origin === primaryOrigin ? "{{baseUrl}}" : origin;
  const pathText = toPostmanPath(template);
  const query = (node.params || [])
    .filter((p) => p.in === "query" && p.name)
    .map((p) => ({
      key: p.name,
      value: p.example !== undefined ? String(p.example) : "",
      ...(p.description ? { description: p.description } : {}),
    }));

  const raw =
    `${host}${pathText}` +
    (query.length
      ? `?${query.map((q) => `${q.key}=${q.value}`).join("&")}`
      : "");

  const url = { raw };
  if (host) url.host = [host];
  url.path = pathText.split("/").filter(Boolean);
  if (query.length) url.query = query;

  const variables = (node.params || [])
    .filter((p) => p.in === "path" && p.name)
    .map((p) => ({
      key: p.name,
      value: p.example !== undefined ? String(p.example) : "",
      ...(p.description ? { description: p.description } : {}),
    }));
  if (variables.length) url.variable = variables;

  return url;
};

const postmanAuthFor = (auth) => {
  if (!auth) return null;
  const type = String(auth.type || auth.scheme || "").toLowerCase();
  if (type === "bearer" || auth.scheme === "bearer") return { type: "bearer" };
  if (type === "basic" || auth.scheme === "basic") return { type: "basic" };
  if (type === "apikey") {
    const out = { type: "apikey", apikey: [] };
    if (auth.headerName) out.apikey.push({ key: "key", value: auth.headerName });
    if (auth.location) out.apikey.push({ key: "in", value: auth.location });
    return out;
  }
  if (type === "oauth2") return { type: "oauth2" };
  return null;
};

const postmanFromNodes = ({ spec, nodes }, notes) => {
  const meta = collectionMeta(spec, nodes);
  const requests = nodes.filter((n) => n.type === "request");

  const originCount = new Map();
  requests.forEach((node) => {
    const { origin } = splitOrigin(node.path);
    if (origin) originCount.set(origin, (originCount.get(origin) || 0) + 1);
  });
  const primaryOrigin =
    [...originCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  if (originCount.size > 1) {
    notes.add(
      "Requests point at more than one host; only the most common one became {{baseUrl}}.",
    );
  }

  const toItem = (node) => {
    const request = {
      method: String(node.method || "GET").toUpperCase(),
      header: (node.headers || [])
        .filter((h) => h && h.key)
        .map((h) => ({ key: h.key, value: String(h.value ?? ""), type: "text" })),
      url: postmanUrl(node, primaryOrigin),
    };
    if (node.description) request.description = node.description;

    if (node.body != null) {
      const raw =
        typeof node.body === "string" ? node.body : JSON.stringify(node.body, null, 2);
      request.body = {
        mode: "raw",
        raw,
        options: { raw: { language: "json" } },
      };
      const hasContentType = request.header.some(
        (h) => h.key.toLowerCase() === "content-type",
      );
      if (!hasContentType) {
        request.header.push({
          key: "Content-Type",
          value: "application/json",
          type: "text",
        });
      }
    }

    const auth = postmanAuthFor((node.auth || [])[0]);
    if (auth) request.auth = auth;

    const item = { name: node.name || `${request.method} ${node.path}`, request };

    const responses = (node.responses || []).filter((r) => r.example !== undefined);
    if (responses.length) {
      item.response = responses.map((response) => ({
        name: response.description || `${response.status} response`,
        originalRequest: request,
        code: Number.parseInt(response.status, 10) || 0,
        status: response.description || "",
        header: response.contentType
          ? [{ key: "Content-Type", value: response.contentType }]
          : [],
        body:
          typeof response.example === "string"
            ? response.example
            : JSON.stringify(response.example, null, 2),
        _postman_previewlanguage: "json",
      }));
    }
    return item;
  };

  // Rebuild the folder tree the parser flattened.
  const childrenOf = new Map();
  nodes.forEach((node) => {
    if (!node.parentId) return;
    if (!childrenOf.has(node.parentId)) childrenOf.set(node.parentId, []);
    childrenOf.get(node.parentId).push(node);
  });

  const build = (parentId) =>
    (childrenOf.get(parentId) || []).map((node) => {
      if (node.type === "folder") {
        const folder = { name: node.name, item: build(node.id) };
        if (node.description) folder.description = node.description;
        return folder;
      }
      return toItem(node);
    });

  const out = {
    info: {
      name: meta.title,
      schema: POSTMAN_SCHEMA,
    },
    item: build("node-root"),
  };
  if (meta.description) out.info.description = meta.description;
  if (primaryOrigin) {
    out.variable = [{ key: "baseUrl", value: primaryOrigin, type: "string" }];
  }
  if (requests.some((n) => (n.auth || []).length)) {
    notes.add(
      "Auth types were carried over, but Postman needs the credentials themselves filled in before a request will run.",
    );
  }
  return out;
};

/**
 * Postman items for an arbitrary set of endpoints.
 *
 * Used to turn the gaps a coverage report finds into requests that can be
 * merged straight into an existing collection.
 */
export const postmanItemsForNodes = (nodes = [], name = "Generated") => {
  const requests = nodes.filter((n) => n.type === "request");
  if (!requests.length) return [];
  const root = { id: "node-root", type: "root", name, parentId: null };
  const flat = [root, ...requests.map((node) => ({ ...node, parentId: "node-root" }))];
  const collection = postmanFromNodes({ spec: null, nodes: flat }, noteBook());
  return collection.item || [];
};

// ─── Nodes → .http request file ──────────────

const httpFromNodes = ({ spec, nodes }, notes) => {
  const meta = collectionMeta(spec, nodes);
  const requests = nodes.filter((n) => n.type === "request");
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const originCount = new Map();
  requests.forEach((node) => {
    const { origin } = splitOrigin(node.path);
    if (origin) originCount.set(origin, (originCount.get(origin) || 0) + 1);
  });
  const primaryOrigin =
    [...originCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";

  const lines = [`# ${meta.title}`];
  if (meta.version) lines.push(`# Version ${meta.version}`);
  if (primaryOrigin) lines.push("", `@baseUrl = ${primaryOrigin}`);
  lines.push("");

  let lastFolder = null;
  requests.forEach((node) => {
    const folder = node.parentId ? byId.get(node.parentId) : null;
    if (folder?.type === "folder" && folder.name !== lastFolder) {
      lastFolder = folder.name;
      lines.push(`# ── ${folder.name} ${"─".repeat(Math.max(0, 40 - folder.name.length))}`, "");
    }

    const { origin, rest } = splitOrigin(node.path);
    const template = node.template || toPathTemplate(rest);
    const host = origin && origin === primaryOrigin ? "{{baseUrl}}" : origin;
    const query = (node.params || [])
      .filter((p) => p.in === "query" && p.name && p.example !== undefined && p.example !== "")
      .map((p) => `${p.name}=${p.example}`)
      .join("&");

    lines.push(`### ${node.name || template}`);
    if (node.description && node.description !== node.name) {
      String(node.description)
        .split("\n")
        .forEach((line) => lines.push(`# ${line}`));
    }
    if (node.deprecated) lines.push("# Deprecated");
    (node.auth || []).forEach((auth) => {
      const label = auth.scheme || auth.type;
      if (label) lines.push(`# Requires ${label} authentication`);
    });

    lines.push(
      `${String(node.method || "GET").toUpperCase()} ${host}${template}${query ? `?${query}` : ""}`,
    );
    (node.headers || [])
      .filter((h) => h && h.key)
      .forEach((h) => lines.push(`${h.key}: ${h.value ?? ""}`));

    if (node.body != null) {
      const hasContentType = (node.headers || []).some(
        (h) => String(h.key).toLowerCase() === "content-type",
      );
      if (!hasContentType) lines.push("Content-Type: application/json");
      lines.push("");
      lines.push(
        typeof node.body === "string" ? node.body : JSON.stringify(node.body, null, 2),
      );
    }
    lines.push("");
  });

  if (requests.some((n) => (n.params || []).some((p) => p.in === "path"))) {
    notes.add(
      "Path placeholders were left as written in the spec; fill them in before sending.",
    );
  }
  return lines.join("\n");
};

// ─── Public API ──────────────────────────────

export const EXPORT_TARGETS = [
  {
    id: "openapi-json",
    label: "OpenAPI 3.1",
    hint: "json",
    ext: "openapi.json",
    mime: "application/json;charset=utf-8",
  },
  {
    id: "openapi-yaml",
    label: "OpenAPI 3.1",
    hint: "yaml",
    ext: "openapi.yaml",
    mime: "text/yaml;charset=utf-8",
  },
  {
    id: "swagger-json",
    label: "Swagger 2.0",
    hint: "json",
    ext: "swagger.json",
    mime: "application/json;charset=utf-8",
  },
  {
    id: "postman",
    label: "Postman collection",
    hint: "v2.1",
    ext: "postman_collection.json",
    mime: "application/json;charset=utf-8",
  },
  {
    id: "http",
    label: "HTTP request file",
    hint: ".http",
    ext: "http",
    mime: "text/plain;charset=utf-8",
  },
];

const isOpenApiSource = (spec) => isObject(spec) && (spec.openapi || spec.swagger);

/** Every route to an OpenAPI 3.1 document, in one place. */
const buildOpenApi31 = (source, notes) => {
  const { spec } = source;
  if (isObject(spec) && spec.swagger) return upgradeSwagger2(spec, notes);
  if (isObject(spec) && typeof spec.openapi === "string") {
    if (spec.openapi.startsWith("3.1")) {
      notes.add("The source is already OpenAPI 3.1 and was written out unchanged.");
      return clone(spec);
    }
    return upgradeOpenApi30(spec);
  }
  return openApiFromNodes(source, notes);
};

const toYaml = (document) =>
  yaml.dump(document, { noRefs: true, lineWidth: 100, quotingType: '"' });

/**
 * Convert the loaded specification into `targetId`.
 *
 * `nodes` should be the complete node list, not the filtered view — an export
 * that silently dropped whatever was collapsed or filtered out would be worse
 * than no export at all.
 */
export const convertSpec = (targetId, { spec = null, nodes = [] } = {}) => {
  const target = EXPORT_TARGETS.find((t) => t.id === targetId);
  if (!target) throw new Error(`Unknown export format "${targetId}".`);

  const requests = nodes.filter((n) => n.type === "request");
  if (!requests.length && !isOpenApiSource(spec)) {
    throw new Error("There are no endpoints to export yet.");
  }

  const notes = noteBook();
  const source = { spec, nodes };
  let text;

  switch (targetId) {
    case "openapi-json":
      text = JSON.stringify(buildOpenApi31(source, notes), null, 2);
      break;
    case "openapi-yaml":
      text = toYaml(buildOpenApi31(source, notes));
      break;
    case "swagger-json": {
      if (isObject(spec) && spec.swagger === "2.0") {
        notes.add("The source is already Swagger 2.0 and was written out unchanged.");
        text = JSON.stringify(clone(spec), null, 2);
        break;
      }
      const openApi = buildOpenApi31(source, noteBook()); // upgrade notes are moot here
      text = JSON.stringify(downgradeToSwagger2(openApi, notes), null, 2);
      break;
    }
    case "postman": {
      // A collection that is already a collection is passed through whole:
      // rebuilding it would quietly drop the scripts, tests and variables the
      // parser never reads. Only the schema declaration is brought up to date.
      if (isObject(spec) && spec.info && Array.isArray(spec.item)) {
        const passthrough = clone(spec);
        if (passthrough.info.schema !== POSTMAN_SCHEMA) {
          notes.add(
            passthrough.info.schema
              ? "The collection declared an older schema; it was restamped as v2.1."
              : "The collection declared no schema; it was stamped as v2.1.",
          );
          passthrough.info.schema = POSTMAN_SCHEMA;
        }
        notes.add(
          "The source is already a Postman collection, so everything else was kept as-is.",
        );
        text = JSON.stringify(passthrough, null, 2);
        break;
      }
      text = JSON.stringify(postmanFromNodes(source, notes), null, 2);
      break;
    }
    case "http":
      text = httpFromNodes(source, notes);
      break;
    default:
      throw new Error(`Unknown export format "${targetId}".`);
  }

  return { text, notes: notes.list, ext: target.ext, mime: target.mime };
};

/** The source document itself, as JSON or YAML. */
export const serializeSource = (spec, as) =>
  as === "yaml" ? toYaml(spec) : JSON.stringify(spec, null, 2);
