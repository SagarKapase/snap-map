import { HTTP_METHODS } from "./constants";
import { resolveSchema } from "./analysis";

// ─── Format detection ────────────────────────
export const detectFormat = (data) => {
  if (data.openapi || data.swagger) return "openapi";
  if (data.info && data.item && Array.isArray(data.item)) return "postman";
  // A v1 collection has no `item`; without this it fell through to the
  // generic JSON parser and came out as a shapeless list.
  if (!data.item && Array.isArray(data.requests)) return "postman";
  return "custom";
};

export const formatLabel = (data) => {
  if (data.openapi) return `OpenAPI ${data.openapi}`;
  if (data.swagger) return `Swagger ${data.swagger}`;
  if (data.info && data.item && Array.isArray(data.item)) return "Postman";
  if (!data.item && Array.isArray(data.requests)) return "Postman v1";
  return "Custom JSON";
};

// ─── Parameters inferred from a URL string ───
// Path placeholders ({id} or :id) and query keys are real parts of the spec,
// so they are surfaced as parameters when the format declares none.
export const extractUrlParams = (url) => {
  const params = [];
  if (!url || typeof url !== "string") return params;

  const [pathPart, queryPart] = url.split("?");

  // A Postman template is not a path parameter. Without stripping them first,
  // "{{baseUrl}}/orders" reported a required path parameter called "{baseUrl",
  // because the placeholder pattern matches the inner braces.
  const withoutTemplates = pathPart.replace(/\{\{[^}]*\}\}/g, "");

  const pathMatches =
    withoutTemplates.match(/\{[^}/]+\}|:[a-zA-Z_][a-zA-Z0-9_-]*/g) || [];
  pathMatches.forEach((raw) => {
    const name = raw.startsWith("{") ? raw.slice(1, -1) : raw.slice(1);
    if (name)
      params.push({
        name,
        in: "path",
        required: true,
        type: "",
        description: "",
        inferred: true,
      });
  });

  if (queryPart) {
    queryPart.split("&").forEach((pair) => {
      if (!pair) return;
      const [key, value = ""] = pair.split("=");
      if (key)
        params.push({
          name: key,
          in: "query",
          required: false,
          type: "",
          description: "",
          example: value,
          inferred: true,
        });
    });
  }

  return params;
};

const dedupeParams = (params) => {
  const seen = new Set();
  return params.filter((p) => {
    const key = `${p.in}:${p.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

// ─── OpenAPI / Swagger helpers ───────────────
const openApiAuth = (spec, operation) => {
  const schemes =
    spec.components?.securitySchemes || spec.securityDefinitions || {};
  const security = operation.security ?? spec.security;
  if (!Array.isArray(security) || security.length === 0) return [];

  const out = [];
  security.forEach((requirement) => {
    Object.entries(requirement || {}).forEach(([name, scopes]) => {
      const scheme = schemes[name] || {};
      out.push({
        name,
        type: scheme.type || "",
        scheme: scheme.scheme || "",
        location: scheme.in || "",
        headerName: scheme.name || "",
        scopes: Array.isArray(scopes) ? scopes : [],
      });
    });
  });
  return out;
};

/** The example a media object carries, wherever OpenAPI lets it be written. */
const mediaExample = (media, schema) => {
  if (media?.example !== undefined) return media.example;
  if (media?.examples && typeof media.examples === "object") {
    const first = Object.values(media.examples)[0];
    if (first?.value !== undefined) return first.value;
  }
  return schema?.example;
};

const RAW_LANGUAGE_FOR = [
  [/json/i, "json"],
  [/xml/i, "xml"],
  [/html/i, "html"],
  [/javascript/i, "javascript"],
];

/** One form field per schema property; `format: binary` is a file. */
const formFieldsFromSchema = (schema) => {
  const props = schema?.properties;
  if (!props || typeof props !== "object") return [];
  const required = Array.isArray(schema.required) ? schema.required : [];
  return Object.entries(props).map(([key, prop]) => {
    const example = prop?.example ?? prop?.default;
    return {
      key,
      value: example != null && typeof example !== "object" ? String(example) : "",
      type: prop?.format === "binary" || prop?.type === "file" ? "file" : "text",
      disabled: false,
      required: required.includes(key),
      description: prop?.description || "",
    };
  });
};

/**
 * What the operation accepts as a body, in the same terms the Postman
 * parser uses. Only `application/json` was read before, so a multipart
 * upload or a form post looked like it took no body at all.
 */
const readOpenApiBody = (spec, operation) => {
  const none = { body: null, bodyMode: "none", formFields: [], requestBodySchema: null };

  const content = operation.requestBody?.content;
  if (content && typeof content === "object") {
    const types = Object.keys(content);
    const picked =
      types.find((t) => /json/i.test(t)) ||
      types.find((t) => /^multipart\//i.test(t)) ||
      types.find((t) => t === "application/x-www-form-urlencoded") ||
      types[0];
    if (!picked) return none;
    const media = content[picked] || {};
    const schema = media.schema || null;
    const example = mediaExample(media, schema);

    if (/json/i.test(picked)) {
      return {
        body: example !== undefined ? example : null,
        bodyMode: "raw",
        language: "json",
        contentType: picked,
        formFields: [],
        requestBodySchema: schema,
      };
    }
    if (/^multipart\//i.test(picked) || picked === "application/x-www-form-urlencoded") {
      return {
        body: null,
        bodyMode: picked === "application/x-www-form-urlencoded" ? "urlencoded" : "formdata",
        contentType: picked,
        formFields: formFieldsFromSchema(resolveSchema(spec, schema)),
        requestBodySchema: null,
      };
    }
    if (picked === "application/octet-stream" || schema?.format === "binary") {
      return { body: null, bodyMode: "file", contentType: picked, formFields: [], requestBodySchema: null };
    }
    const language = RAW_LANGUAGE_FOR.find(([pattern]) => pattern.test(picked))?.[1] || "text";
    const raw = typeof example === "string" ? example : "";
    return {
      body: raw || null,
      bodyMode: "raw",
      rawBody: raw,
      language,
      contentType: picked,
      formFields: [],
      requestBodySchema: null,
    };
  }

  // Swagger 2.0: the body is a parameter, and form fields are parameters too.
  const params = Array.isArray(operation.parameters) ? operation.parameters : [];
  const formParams = params.filter((p) => p && p.in === "formData");
  if (formParams.length) {
    const consumes = Array.isArray(operation.consumes) ? operation.consumes : spec.consumes || [];
    const urlencoded =
      consumes.includes("application/x-www-form-urlencoded") &&
      !consumes.includes("multipart/form-data") &&
      !formParams.some((p) => p.type === "file");
    return {
      body: null,
      bodyMode: urlencoded ? "urlencoded" : "formdata",
      contentType: urlencoded ? "application/x-www-form-urlencoded" : "multipart/form-data",
      formFields: formParams.map((p) => ({
        key: p.name,
        value: p.default != null ? String(p.default) : p["x-example"] != null ? String(p["x-example"]) : "",
        type: p.type === "file" ? "file" : "text",
        disabled: false,
        required: !!p.required,
        description: p.description || "",
      })),
      requestBodySchema: null,
    };
  }
  const bodyParam = params.find((p) => p && p.in === "body");
  if (bodyParam) {
    return {
      body: bodyParam.schema?.example !== undefined ? bodyParam.schema.example : null,
      bodyMode: "raw",
      language: "json",
      contentType: "application/json",
      formFields: [],
      requestBodySchema: bodyParam.schema || null,
    };
  }
  return none;
};

const openApiResponses = (operation) => {
  const responses = operation.responses || {};
  return Object.entries(responses).map(([status, res]) => {
    const content = res?.content || {};
    const contentType = Object.keys(content)[0] || "";
    const media = contentType ? content[contentType] : null;

    let example = media?.example;
    if (example === undefined && media?.examples) {
      example = Object.values(media.examples)[0]?.value;
    }
    if (example === undefined) example = media?.schema?.example;
    // Swagger 2.0 keeps examples on the response object itself
    if (example === undefined && res?.examples) {
      example =
        res.examples["application/json"] ?? Object.values(res.examples)[0];
    }

    return {
      status,
      description: res?.description || "",
      contentType: contentType || (res?.examples ? "application/json" : ""),
      example,
      schema: media?.schema || res?.schema || null,
    };
  });
};

// ─── OpenAPI / Swagger parser ────────────────
export const parseOpenApi = (data, setStats) => {
  const allNodes = [];
  let id = 0;
  const s = { total: 0, get: 0, post: 0, put: 0, delete: 0, patch: 0 };

  // A server URL may be templated: "https://{env}.api.test/{ver}". The
  // document declares the defaults, so they are filled in rather than left
  // for the playground to send as literal braces.
  const resolveServerUrl = (server) => {
    let url = String(server?.url || "");
    Object.entries(server?.variables || {}).forEach(([name, variable]) => {
      if (variable?.default !== undefined) {
        url = url.split(`{${name}}`).join(String(variable.default));
      }
    });
    return url.replace(/\/+$/, "");
  };

  const servers = [];
  if (Array.isArray(data.servers) && data.servers.length) {
    data.servers.forEach((server) => {
      const url = resolveServerUrl(server);
      if (url && !servers.includes(url)) servers.push(url);
    });
  } else if (data.host) {
    const schemes = Array.isArray(data.schemes) && data.schemes.length ? data.schemes : ["https"];
    schemes.forEach((scheme) => {
      const url = `${scheme}://${data.host}${data.basePath || ""}`.replace(/\/+$/, "");
      if (!servers.includes(url)) servers.push(url);
    });
  } else if (data.basePath) {
    servers.push(String(data.basePath).replace(/\/+$/, ""));
  }

  const baseUrl = servers[0] || "";

  const root = {
    id: "node-root",
    name: data.info?.title || "API Specification",
    version: data.info?.version || "v1.0",
    type: "root",
    parentId: null,
    itemCount: 0,
    servers,
  };
  allNodes.push(root);

  const tagGroups = {};
  const paths = data.paths || {};

  Object.entries(paths).forEach(([pathStr, pathObj]) => {
    if (!pathObj) return;
    HTTP_METHODS.forEach((method) => {
      const operation = pathObj[method];
      if (!operation) return;

      const tags =
        operation.tags && operation.tags.length > 0
          ? operation.tags
          : ["Default"];
      const upperMethod = method.toUpperCase();

      const bodyInfo = readOpenApiBody(data, operation);

      const declared = [
        ...(Array.isArray(pathObj.parameters) ? pathObj.parameters : []),
        ...(Array.isArray(operation.parameters) ? operation.parameters : []),
      ]
        // Form fields are read as the body, not listed as parameters.
        .filter((p) => p && p.in !== "body" && p.in !== "formData")
        .map((p) => ({
          name: p.name,
          in: p.in || "query",
          required: !!p.required,
          type: p.schema?.type || p.type || "",
          description: p.description || "",
          example: p.example ?? p.schema?.example,
        }));

      const params = dedupeParams([...declared, ...extractUrlParams(pathStr)]);

      const headers = params
        .filter((p) => p.in === "header")
        .map((p) => ({
          key: p.name,
          value: p.example != null ? String(p.example) : "",
        }));

      tags.forEach((tag) => {
        if (!tagGroups[tag]) tagGroups[tag] = [];
        tagGroups[tag].push({
          name:
            operation.summary ||
            operation.operationId ||
            `${upperMethod} ${pathStr}`,
          method: upperMethod,
          path: `${baseUrl}${pathStr}`,
          template: pathStr,
          description: operation.description || operation.summary || "",
          ...bodyInfo,
          params,
          headers,
          auth: openApiAuth(data, operation),
          responses: openApiResponses(operation),
          deprecated: !!operation.deprecated,
        });
      });

      s[method] = (s[method] || 0) + 1;
      s.total++;
    });
  });

  Object.entries(tagGroups).forEach(([tag, endpoints]) => {
    const folderId = `node-${id++}`;
    allNodes.push({
      id: folderId,
      name: tag,
      type: "folder",
      parentId: "node-root",
      itemCount: endpoints.length,
      description:
        (data.tags || []).find((t) => t.name === tag)?.description || "",
    });

    endpoints.forEach((ep) => {
      allNodes.push({
        id: `node-${id++}`,
        type: "request",
        parentId: folderId,
        ...ep,
      });
    });
  });

  root.itemCount = allNodes.length - 1;
  setStats(s);
  return allNodes;
};

// ─── Custom / generic JSON parser ────────────
export const parseCustomApi = (data, setStats) => {
  const allNodes = [];
  let id = 0;
  const s = { total: 0, get: 0, post: 0, put: 0, delete: 0, patch: 0 };

  const root = {
    id: "node-root",
    name: data.name || data.title || "API Collection",
    version: data.version || "v1.0",
    type: "root",
    parentId: null,
    itemCount: 0,
  };
  allNodes.push(root);

  const normalizeEndpoint = (ep) => {
    const method = (ep.method || ep.type || ep.httpMethod || "GET").toUpperCase();
    const url = ep.url || ep.path || ep.endpoint || ep.route || "";
    const name = ep.name || ep.title || ep.summary || `${method} ${url}`;
    const description = ep.description || ep.summary || "";
    let body = null;
    if (ep.body) {
      try {
        body = typeof ep.body === "string" ? JSON.parse(ep.body) : ep.body;
      } catch {
        body = ep.body;
      }
    }
    return { method, url, name, description, body };
  };

  // Response examples, only when the source JSON actually carries one
  const customResponses = (ep) => {
    const raw = ep.response ?? ep.responses ?? ep.example ?? ep.sampleResponse;
    if (raw == null) return [];
    if (Array.isArray(raw)) {
      return raw.filter(Boolean).map((r) => ({
        status: String(r.status ?? r.code ?? 200),
        description: r.name || r.description || "",
        contentType: r.contentType || "application/json",
        example: r.body ?? r.example ?? r.data ?? r,
      }));
    }
    if (typeof raw === "object" && (raw.status || raw.code || raw.body)) {
      return [
        {
          status: String(raw.status ?? raw.code ?? 200),
          description: raw.name || raw.description || "",
          contentType: raw.contentType || "application/json",
          example: raw.body ?? raw.example ?? raw.data ?? raw,
        },
      ];
    }
    return [
      {
        status: "200",
        description: "",
        contentType: "application/json",
        example: raw,
      },
    ];
  };

  const normalizeHeaders = (ep) => {
    const raw = ep.headers;
    if (!raw) return [];
    if (Array.isArray(raw))
      return raw
        .filter((h) => h && (h.key || h.name))
        .map((h) => ({ key: h.key || h.name, value: String(h.value ?? "") }));
    if (typeof raw === "object")
      return Object.entries(raw).map(([key, value]) => ({
        key,
        value: String(value ?? ""),
      }));
    return [];
  };

  const addEndpoints = (endpoints, parentId) => {
    endpoints.forEach((ep) => {
      const norm = normalizeEndpoint(ep);
      const m = norm.method.toLowerCase();
      s[m] = (s[m] || 0) + 1;
      s.total++;
      allNodes.push({
        id: `node-${id++}`,
        name: norm.name,
        type: "request",
        parentId,
        method: norm.method,
        path: norm.url,
        description: norm.description,
        body: norm.body,
        params: extractUrlParams(norm.url),
        headers: normalizeHeaders(ep),
        auth: [],
        responses: customResponses(ep),
      });
    });
  };

  if (Array.isArray(data)) {
    root.name = "API Collection";
    addEndpoints(data, "node-root");
  } else {
    const endpointsArr = data.endpoints || data.routes || data.apis || null;
    if (Array.isArray(endpointsArr)) {
      addEndpoints(endpointsArr, "node-root");
    } else {
      const metaKeys = [
        "name",
        "title",
        "version",
        "description",
        "baseUrl",
        "base_url",
      ];
      const groups = Object.entries(data).filter(
        ([key, val]) => Array.isArray(val) && !metaKeys.includes(key),
      );
      if (groups.length > 0) {
        groups.forEach(([groupName, endpoints]) => {
          const folderId = `node-${id++}`;
          allNodes.push({
            id: folderId,
            name: groupName,
            type: "folder",
            parentId: "node-root",
            itemCount: endpoints.length,
            description: "",
          });
          addEndpoints(endpoints, folderId);
        });
      } else {
        const norm = normalizeEndpoint(data);
        if (norm.url) {
          const m = norm.method.toLowerCase();
          s[m] = (s[m] || 0) + 1;
          s.total++;
          allNodes.push({
            id: `node-${id++}`,
            name: norm.name,
            type: "request",
            parentId: "node-root",
            method: norm.method,
            path: norm.url,
            description: norm.description,
            body: norm.body,
            params: extractUrlParams(norm.url),
            headers: normalizeHeaders(data),
            auth: [],
            responses: customResponses(data),
          });
        }
      }
    }
  }

  root.itemCount = allNodes.length - 1;
  setStats(s);
  return allNodes;
};

// ─── Postman helpers ─────────────────────────

/**
 * A Postman v1 collection has a flat `requests` array and its own folder
 * shape. Rather than teach the parser two layouts, v1 is reshaped into the
 * v2 item tree once, up front.
 */
export const isPostmanV1 = (data) =>
  !!data &&
  typeof data === "object" &&
  !data.item &&
  Array.isArray(data.requests) &&
  (typeof data.name === "string" || typeof data.id === "string");

const v1RequestToItem = (request) => {
  const headers = [];
  // v1 kept headers as a raw header block, one per line.
  String(request.headers || "")
    .split(/\r?\n/)
    .forEach((line) => {
      const idx = line.indexOf(":");
      if (idx > 0) {
        headers.push({
          key: line.slice(0, idx).trim(),
          value: line.slice(idx + 1).trim(),
        });
      }
    });

  const events = [];
  if (request.preRequestScript) {
    events.push({
      listen: "prerequest",
      script: { exec: String(request.preRequestScript).split(/\r?\n/) },
    });
  }
  if (request.tests) {
    events.push({
      listen: "test",
      script: { exec: String(request.tests).split(/\r?\n/) },
    });
  }

  return {
    name: request.name || request.url || "Request",
    event: events,
    request: {
      method: request.method || "GET",
      header: headers,
      url: request.url || "",
      description: request.description || "",
      body: request.rawModeData
        ? { mode: "raw", raw: request.rawModeData }
        : undefined,
    },
  };
};

export const postmanV1ToV2 = (data) => {
  const byFolder = new Map();
  (data.folders || []).forEach((folder) => byFolder.set(folder.id, folder));

  const claimed = new Set();
  const folders = (data.folders || []).map((folder) => {
    const order = folder.order || folder.collection_order || [];
    order.forEach((id) => claimed.add(id));
    const requests = order
      .map((id) => (data.requests || []).find((r) => r.id === id))
      .filter(Boolean);
    return {
      name: folder.name || "Folder",
      description: folder.description || "",
      item: requests.map(v1RequestToItem),
    };
  });

  const loose = (data.requests || [])
    .filter((r) => !claimed.has(r.id))
    .map(v1RequestToItem);

  return {
    info: {
      name: data.name || "API Collection",
      description: data.description || "",
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    item: [...folders, ...loose],
  };
};

/**
 * A Postman environment or globals export is not a collection — it carries
 * `values` and a variable scope. It is recognised here so the import screen
 * can route it to the environment store instead of trying to graph it.
 */
export const isPostmanVariableFile = (data) =>
  !!data &&
  typeof data === "object" &&
  Array.isArray(data.values) &&
  !data.item &&
  !data.requests;

export const readPostmanVariableFile = (data) => ({
  name: data.name || "Imported environment",
  scope: data._postman_variable_scope === "globals" ? "globals" : "environment",
  variables: (data.values || [])
    .filter((v) => v && v.key)
    .map((v) => ({
      key: v.key,
      value: String(v.value ?? ""),
      enabled: v.enabled !== false,
      secret: v.type === "secret",
    })),
});

/** `[{key, value, disabled}]` → the flat shape the rest of the app uses. */
const readVariableList = (list) => {
  const out = [];
  (Array.isArray(list) ? list : []).forEach((v) => {
    if (!v || !v.key) return;
    out.push({
      key: v.key,
      value: v.value === undefined || v.value === null ? "" : String(v.value),
      disabled: v.disabled === true,
      secret: v.type === "secret",
    });
  });
  return out;
};

/**
 * Postman auth is inherited: a request with no auth of its own uses its
 * folder's, then the collection's. Reading only the request — which is what
 * the parser used to do — reported most collections as requiring nothing.
 */
const postmanAuth = (auth, inherited = false) => {
  if (!auth || !auth.type || auth.type === "noauth") return [];
  const type = String(auth.type);
  const detail = Array.isArray(auth[type]) ? auth[type] : [];
  const field = (key) => detail.find((d) => d?.key === key)?.value;

  return [
    {
      name: type,
      type,
      scheme: type === "bearer" ? "bearer" : type === "basic" ? "basic" : "",
      location: type === "apikey" ? String(field("in") || "header") : "header",
      headerName:
        type === "apikey"
          ? String(field("key") || "")
          : type === "noauth"
            ? ""
            : "Authorization",
      scopes: [],
      inherited,
      // The credential itself is nearly always a {{variable}}; keeping the
      // raw values is what lets the flow analysis see auth as a consumer.
      values: detail
        .filter((d) => d && d.key)
        .map((d) => ({ key: d.key, value: String(d.value ?? "") })),
    },
  ];
};

/** `event: [{listen, script: {exec: [...]}}]` → `{ prerequest, test }`. */
const readScripts = (item) => {
  const out = { prerequest: "", test: "" };
  (Array.isArray(item?.event) ? item.event : []).forEach((event) => {
    if (!event || event.disabled) return;
    const exec = event.script?.exec;
    const text = Array.isArray(exec) ? exec.join("\n") : String(exec || "");
    if (!text.trim()) return;
    const slot = event.listen === "prerequest" ? "prerequest" : "test";
    out[slot] = out[slot] ? `${out[slot]}\n${text}` : text;
  });
  return out;
};

/**
 * Postman supports six body modes; only `raw` was read before, so a
 * form-data or GraphQL request looked like it had no body at all.
 */
const readBody = (req) => {
  const body = req?.body;
  if (!body || !body.mode) return { body: null, bodyMode: "none", formFields: [] };

  if (body.mode === "raw") {
    const raw = body.raw ?? "";
    let parsed = raw;
    try {
      parsed = typeof raw === "string" && raw.trim() ? JSON.parse(raw) : raw;
    } catch {
      parsed = raw; // a template with {{vars}} in it is not valid JSON
    }
    return {
      body: raw === "" ? null : parsed,
      bodyMode: "raw",
      rawBody: typeof raw === "string" ? raw : "",
      language: body.options?.raw?.language || "",
      formFields: [],
    };
  }

  if (body.mode === "formdata" || body.mode === "urlencoded") {
    const fields = (Array.isArray(body[body.mode]) ? body[body.mode] : [])
      .filter((f) => f && f.key)
      .map((f) => ({
        key: f.key,
        value: f.type === "file" ? String(f.src || "") : String(f.value ?? ""),
        type: f.type === "file" ? "file" : "text",
        disabled: f.disabled === true,
        description: f.description?.content || f.description || "",
      }));
    return { body: null, bodyMode: body.mode, formFields: fields };
  }

  if (body.mode === "graphql") {
    return {
      body: null,
      bodyMode: "graphql",
      graphql: {
        query: body.graphql?.query || "",
        variables: body.graphql?.variables || "",
      },
      formFields: [],
    };
  }

  if (body.mode === "file") {
    return { body: null, bodyMode: "file", fileSrc: body.file?.src || "", formFields: [] };
  }

  return { body: null, bodyMode: body.mode, formFields: [] };
};

const postmanResponses = (item) => {
  const list = Array.isArray(item.response) ? item.response : [];
  return list.filter(Boolean).map((r) => {
    let example = r.body;
    try {
      if (typeof r.body === "string") example = JSON.parse(r.body);
    } catch {
      example = r.body;
    }
    const ct = (r.header || []).find(
      (h) => h && String(h.key).toLowerCase() === "content-type",
    );
    return {
      status: String(r.code ?? r.status ?? ""),
      description: r.name || r.status || "",
      contentType: ct?.value || "",
      example,
    };
  });
};

// ─── Postman collection parser ───────────────

export const parsePostmanCollection = (rawData, setStats) => {
  const data = isPostmanV1(rawData) ? postmanV1ToV2(rawData) : rawData;
  const allNodes = [];
  let id = 0;
  const s = { total: 0, get: 0, post: 0, put: 0, delete: 0, patch: 0 };

  const collectionVariables = readVariableList(data.variable);
  const collectionScripts = readScripts(data);
  const collectionAuth = data.auth;

  const root = {
    id: "node-root",
    name: data.info?.name || data.name || "API Collection",
    version: data.info?.version || "v1.0",
    type: "root",
    parentId: null,
    itemCount: 0,
    description: data.info?.description?.content || data.info?.description || "",
    variables: collectionVariables,
    scripts: collectionScripts,
  };
  allNodes.push(root);

  /**
   * `ancestors` carries what a nested item inherits: the nearest declared
   * auth and every variable declared above it.
   */
  const processItem = (item, parentId, ancestors) => {
    const nodeId = `node-${id++}`;

    if (item.item && Array.isArray(item.item)) {
      const folderVariables = readVariableList(item.variable);
      const folderScripts = readScripts(item);
      allNodes.push({
        id: nodeId,
        name: item.name,
        type: "folder",
        parentId,
        itemCount: item.item.length,
        description: item.description?.content || item.description || "",
        variables: folderVariables,
        scripts: folderScripts,
        auth: postmanAuth(item.auth, false),
      });
      item.item.forEach((child) =>
        processItem(child, nodeId, {
          auth: item.auth || ancestors.auth,
          authOwned: item.auth ? false : ancestors.authOwned,
          variables: [...ancestors.variables, ...folderVariables],
          scripts: [
            ...ancestors.scripts,
            { source: item.name, ...folderScripts },
          ],
        }),
      );
      return;
    }

    const req = item.request || item;
    const url =
      typeof req.url === "string" ? req.url : req.url?.raw || item.url || "";
    const method = (req.method || item.method || "GET").toUpperCase();
    s[method.toLowerCase()] = (s[method.toLowerCase()] || 0) + 1;
    s.total++;

    const bodyInfo = readBody(req);

    const declared = [];
    if (req.url && typeof req.url === "object") {
      (req.url.variable || []).forEach((v) => {
        if (v?.key)
          declared.push({
            name: v.key,
            in: "path",
            required: true,
            type: "",
            description: v.description?.content || v.description || "",
            example: v.value,
          });
      });
      (req.url.query || []).forEach((q) => {
        if (q?.key)
          declared.push({
            name: q.key,
            in: "query",
            required: false,
            type: "",
            description: q.description?.content || q.description || "",
            example: q.value,
            disabled: q.disabled === true,
          });
      });
    }

    const rawHeaders = Array.isArray(req.header) ? req.header : [];
    const headers = rawHeaders
      .filter((h) => h && h.key && !h.disabled)
      .map((h) => ({ key: h.key, value: String(h.value ?? "") }));
    const disabledHeaders = rawHeaders
      .filter((h) => h && h.key && h.disabled)
      .map((h) => ({ key: h.key, value: String(h.value ?? ""), disabled: true }));

    // Own auth wins; otherwise whatever the nearest ancestor declared.
    const ownAuth = req.auth || item.auth;
    const effectiveAuth = ownAuth
      ? postmanAuth(ownAuth, false)
      : postmanAuth(ancestors.auth, true);

    allNodes.push({
      id: nodeId,
      name: item.name,
      type: "request",
      parentId,
      method,
      path: url,
      description:
        item.description?.content ||
        req.description?.content ||
        item.description ||
        (typeof req.description === "string" ? req.description : "") ||
        "",
      params: dedupeParams([...declared, ...extractUrlParams(url)]),
      headers,
      disabledHeaders,
      auth: effectiveAuth,
      responses: postmanResponses(item),
      scripts: readScripts(item),
      inheritedVariables: ancestors.variables,
      ...bodyInfo,
    });
  };

  const rootAncestors = {
    auth: collectionAuth,
    authOwned: false,
    variables: collectionVariables,
    scripts: [{ source: root.name, ...collectionScripts }],
  };

  if (data.item && Array.isArray(data.item)) {
    data.item.forEach((item) => processItem(item, "node-root", rootAncestors));
  }
  root.itemCount = allNodes.length - 1;
  setStats(s);
  return allNodes;
};

// ─── Unified parse dispatcher ────────────────
export const parseCollection = (data, setStats) => {
  const format = Array.isArray(data) ? "custom" : detectFormat(data);
  if (format === "openapi") return parseOpenApi(data, setStats);
  if (format === "custom") return parseCustomApi(data, setStats);
  return parsePostmanCollection(data, setStats);
};
