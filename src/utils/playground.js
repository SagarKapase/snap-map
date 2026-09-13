/**
 * The playground's request model.
 *
 * A request is more than a method, a URL and a JSON body. Collections carry
 * form-data and GraphQL bodies, bearer tokens and API keys, disabled headers,
 * and `{{variables}}` inside every one of those. Everything the document
 * declares is read into one draft here, and the draft is turned into the
 * exact fetch() call — and the matching cURL — in one place, so what is sent
 * and what is shown never drift apart.
 */
import { resolveText, findVariables } from "./variables";
import { resolveSchema } from "./analysis";

export const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

/** Browsers refuse to attach a body to the other methods. */
export const BODY_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

export const AUTH_TYPES = [
  { id: "none", label: "None" },
  { id: "bearer", label: "Bearer token" },
  { id: "basic", label: "Basic" },
  { id: "apikey", label: "API key" },
];

export const BODY_MODES = [
  { id: "none", label: "None" },
  { id: "raw", label: "Raw" },
  { id: "formdata", label: "Form data" },
  { id: "urlencoded", label: "URL encoded" },
  { id: "graphql", label: "GraphQL" },
  { id: "binary", label: "Binary" },
];

export const RAW_LANGUAGES = [
  { id: "json", label: "JSON", contentType: "application/json" },
  { id: "text", label: "Text", contentType: "text/plain" },
  { id: "xml", label: "XML", contentType: "application/xml" },
  { id: "html", label: "HTML", contentType: "text/html" },
  { id: "javascript", label: "JavaScript", contentType: "application/javascript" },
];

export const DEFAULT_SETTINGS = { timeoutMs: 30000, credentials: false };

const EMPTY_VARS = new Map();

// A {placeholder} or :placeholder — never the inner braces of a {{template}}.
const PATH_VAR = /(?<!\{)\{([^{}/]+)\}(?!\})|:([a-zA-Z_][a-zA-Z0-9_-]*)/g;

/** Names of the {placeholder} / :placeholder segments in a URL path. */
export const pathVarsIn = (url) => {
  const names = [];
  let match;
  PATH_VAR.lastIndex = 0;
  while ((match = PATH_VAR.exec(String(url || ""))) !== null) {
    const name = match[1] || match[2];
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
};

/** A URL the browser can actually send: scheme and host present. */
export const isAbsolute = (url) => /^[a-zA-Z][\w+.-]*:\/\//.test(String(url || "").trim());

/** "{{baseUrl}}/pets" — the host is a variable, not a missing origin. */
export const startsWithVariable = (url) => /^\s*\{\{/.test(String(url || ""));

export const joinBase = (origin, path) => {
  const base = String(origin || "").replace(/\/+$/, "");
  const rest = String(path || "");
  if (!base) return rest;
  return rest.startsWith("/") ? `${base}${rest}` : `${base}/${rest}`;
};

/** Split "a=1&b=2" without re-encoding what the user typed. */
export const parseQuery = (queryString) =>
  String(queryString || "")
    .split("&")
    .filter(Boolean)
    .map((pair) => {
      const eq = pair.indexOf("=");
      return eq === -1
        ? { key: pair, value: "", enabled: true }
        : { key: pair.slice(0, eq), value: pair.slice(eq + 1), enabled: true };
    });

/** Append a query string, respecting whatever the URL already carries. */
export const joinQuery = (url, query) => {
  if (!query) return url;
  return url.includes("?") ? `${url}&${query}` : `${url}?${query}`;
};

export const serializeQuery = (rows) =>
  rows
    .filter((row) => row.enabled && row.key.trim())
    .map((row) => `${row.key}=${row.value}`)
    .join("&");

/** POSIX-safe single quoting — a quote cannot be backslash-escaped inside ''. */
export const shellQuote = (value) => `'${String(value).replace(/'/g, "'\\''")}'`;

const bodyText = (body) => {
  if (body == null) return "";
  if (typeof body === "string") return body;
  try {
    return JSON.stringify(body, null, 2);
  } catch {
    return "";
  }
};

const looksLikeJson = (text) => {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
};

// ─── Seeding a draft from what the document declares ──

export const blankAuth = () => ({
  type: "none",
  token: "",
  username: "",
  password: "",
  key: "",
  value: "",
  addTo: "header",
});

/**
 * What the spec says about authentication, in the playground's terms.
 *
 * A Postman collection usually carries the credential as a `{{variable}}`;
 * it is kept as written and resolved at send time, so switching environment
 * switches the token.
 */
export const seedAuth = (node) => {
  const auth = (node?.auth || [])[0];
  const blank = blankAuth();
  if (!auth) return blank;

  const type = String(auth.type || auth.name || "").toLowerCase();
  const scheme = String(auth.scheme || "").toLowerCase();
  const field = (key) => {
    const hit = (auth.values || []).find((v) => v.key === key);
    return hit ? String(hit.value ?? "") : "";
  };

  if (
    type === "bearer" ||
    (type === "http" && scheme === "bearer") ||
    type === "oauth2" ||
    type === "openidconnect"
  ) {
    return { ...blank, type: "bearer", token: field("token") || field("accessToken") };
  }
  if (type === "basic" || (type === "http" && scheme === "basic")) {
    return { ...blank, type: "basic", username: field("username"), password: field("password") };
  }
  if (type === "apikey") {
    const where = String(field("in") || auth.location || "header").toLowerCase();
    return {
      ...blank,
      type: "apikey",
      key: field("key") || auth.headerName || "X-API-Key",
      value: field("value"),
      addTo: where === "query" ? "query" : "header",
    };
  }
  return blank;
};

/** A short description of the declared scheme, for the Auth tab's note. */
export const describeAuth = (node) => {
  const auth = (node?.auth || [])[0];
  if (!auth) return null;
  const type = String(auth.type || auth.name || "").toLowerCase();
  const scheme = String(auth.scheme || "").toLowerCase();
  const inherited = auth.inherited ? " (inherited from the collection)" : "";
  const location = String(auth.location || "").toLowerCase();

  let label;
  if (type === "bearer" || (type === "http" && scheme === "bearer")) label = "Bearer token";
  else if (type === "basic" || (type === "http" && scheme === "basic")) label = "Basic authentication";
  else if (type === "apikey")
    label = `API key${auth.headerName ? ` in ${auth.headerName}` : ""}${
      location && location !== "header" ? ` (${location})` : ""
    }`;
  else if (type === "oauth2") label = "OAuth 2.0 access token";
  else if (type === "openidconnect") label = "OpenID Connect token";
  else if (type === "http") label = `HTTP ${auth.scheme || "authentication"}`;
  else label = auth.name || auth.type || "Authentication";

  return {
    label: `${label}${inherited}`,
    cookie: location === "cookie",
    unsupported: type === "http" && scheme && scheme !== "bearer" && scheme !== "basic",
  };
};

export const blankField = () => ({ key: "", value: "", type: "text", enabled: true, file: null });

export const blankBody = () => ({
  mode: "none",
  raw: "",
  language: "json",
  fields: [],
  graphql: { query: "", variables: "" },
  file: null,
  fromSchema: false,
});

/**
 * A request body with the shape the schema describes and nothing else.
 *
 * Only values the schema itself states — example, default, const, the
 * first enum member — are used. Everything else is the empty value of its
 * type, which is a form to fill in rather than data pretending to be real.
 */
export const skeletonFromSchema = (schema, depth = 0) => {
  if (!schema || typeof schema !== "object" || depth > 6) return undefined;
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (schema.const !== undefined) return schema.const;
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];

  if (Array.isArray(schema.allOf) && schema.allOf.length) {
    const merged = {};
    schema.allOf.forEach((part) => {
      const piece = skeletonFromSchema(part, depth + 1);
      if (piece && typeof piece === "object" && !Array.isArray(piece)) Object.assign(merged, piece);
    });
    return merged;
  }
  const alternative = schema.oneOf?.[0] || schema.anyOf?.[0];
  if (alternative) return skeletonFromSchema(alternative, depth + 1);

  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  if (schema.properties || type === "object") {
    const out = {};
    Object.entries(schema.properties || {}).forEach(([key, prop]) => {
      if (prop?.readOnly) return;
      const value = skeletonFromSchema(prop, depth + 1);
      out[key] = value === undefined ? null : value;
    });
    return out;
  }
  if (type === "array") {
    const item = schema.items ? skeletonFromSchema(schema.items, depth + 1) : undefined;
    return item === undefined ? [] : [item];
  }
  if (type === "string") return "";
  if (type === "integer" || type === "number") return 0;
  if (type === "boolean") return false;
  if (type === "null") return null;
  return undefined;
};

/** The request body the document describes, in whichever mode it uses. */
export const seedBody = (node, spec = null) => {
  const blank = blankBody();
  if (!node) return blank;

  const mode = node.bodyMode;
  if (mode === "formdata" || mode === "urlencoded") {
    return {
      ...blank,
      mode,
      fields: (node.formFields || []).map((f) => ({
        key: f.key,
        value: String(f.value ?? ""),
        type: f.type === "file" ? "file" : "text",
        enabled: !f.disabled,
        file: null,
      })),
    };
  }
  if (mode === "graphql") {
    return {
      ...blank,
      mode,
      graphql: {
        query: node.graphql?.query || "",
        variables: node.graphql?.variables || "",
      },
    };
  }
  if (mode === "file") return { ...blank, mode: "binary" };

  // The raw template is preferred over the parsed example so its
  // {{variables}} survive to be resolved at send time.
  const raw = typeof node.rawBody === "string" && node.rawBody ? node.rawBody : bodyText(node.body);
  if (raw) {
    const known = RAW_LANGUAGES.some((l) => l.id === node.language);
    const language = known ? node.language : looksLikeJson(raw) || raw.includes("{{") ? "json" : "text";
    return { ...blank, mode: "raw", raw, language };
  }

  if (node.requestBodySchema) {
    const skeleton = skeletonFromSchema(resolveSchema(spec, node.requestBodySchema));
    if (skeleton !== undefined && typeof skeleton === "object") {
      return {
        ...blank,
        mode: "raw",
        raw: JSON.stringify(skeleton, null, 2),
        language: "json",
        fromSchema: true,
      };
    }
  }

  // The mode is known even when nothing was written for it.
  if (mode === "raw") {
    const known = RAW_LANGUAGES.some((l) => l.id === node.language);
    return { ...blank, mode: "raw", language: known ? node.language : "json" };
  }
  return blank;
};

/** Declared headers first, then the ones the collection switched off. */
export const seedHeaders = (node) => {
  const enabled = (node?.headers || [])
    .filter((h) => h && h.key)
    .map((h) => ({ key: h.key, value: String(h.value ?? ""), enabled: true }));
  const disabled = (node?.disabledHeaders || [])
    .filter((h) => h && h.key)
    .map((h) => ({ key: h.key, value: String(h.value ?? ""), enabled: false }));
  const rows = [...enabled, ...disabled];
  return rows.length ? rows : [{ key: "Accept", value: "*/*", enabled: true }];
};

// ─── Turning a draft into a request ──

/**
 * `{{$guid}}` and friends have no stored value; Postman generates them per
 * send, and so does the playground.
 */
const fillDynamic = (text) =>
  text.replace(/\{\{\s*(\$[a-zA-Z]+)\s*\}\}/g, (whole, name) => {
    switch (name) {
      case "$guid":
        return typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
              const r = (Math.random() * 16) | 0;
              return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
            });
      case "$timestamp":
        return String(Math.floor(Date.now() / 1000));
      case "$isoTimestamp":
        return new Date().toISOString();
      case "$randomInt":
        return String(Math.floor(Math.random() * 1001));
      default:
        return whole;
    }
  });

const toBase64 = (text) => {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
};

const contentTypeFor = (body) => {
  if (body.mode === "raw")
    return RAW_LANGUAGES.find((l) => l.id === body.language)?.contentType || "text/plain";
  if (body.mode === "urlencoded") return "application/x-www-form-urlencoded";
  if (body.mode === "graphql") return "application/json";
  if (body.mode === "binary") return body.file?.type || "application/octet-stream";
  return "";
};

/**
 * The exact request a draft describes.
 *
 * Every field is passed through the workspace variables, the auth block is
 * turned into its header or query parameter, and the body is encoded for
 * its mode. The result is what fetch() gets — and what the cURL is built
 * from, so the two cannot disagree.
 */
export const buildRequest = (draft, variables = null) => {
  const vars = variables || EMPTY_VARS;
  const unresolved = [];
  const warnings = [];
  const fill = (text) => {
    const out = resolveText(String(text ?? ""), vars);
    out.unresolved.forEach((name) => !unresolved.includes(name) && unresolved.push(name));
    return fillDynamic(out.text);
  };

  const method = String(draft.method || "GET").toUpperCase();

  // ── URL ──
  const template = fill(draft.url || "");
  // A URL that starts with an unresolved variable is not a relative path;
  // prefixing the origin would only hide the missing value.
  const withBase =
    isAbsolute(template) || startsWithVariable(template)
      ? template
      : joinBase(fill(draft.origin || ""), template);
  const pathValues = draft.pathValues || {};
  const resolvedPath = withBase.replace(PATH_VAR, (whole, braced, colon) => {
    const name = braced || colon;
    const value = pathValues[name];
    return value != null && String(value).trim()
      ? encodeURIComponent(fill(String(value).trim()))
      : whole;
  });
  const query = (draft.query || [])
    .filter((row) => row.enabled && String(row.key || "").trim())
    .map((row) => ({ key: fill(row.key), value: fill(row.value) }));

  // ── Headers ──
  const headers = [];
  const setHeader = (key, value) => {
    const idx = headers.findIndex((h) => h.key.toLowerCase() === key.toLowerCase());
    if (idx === -1) headers.push({ key, value });
    else headers[idx] = { key, value };
  };
  (draft.headers || [])
    .filter((h) => h.enabled !== false && String(h.key || "").trim())
    .forEach((h) => headers.push({ key: fill(h.key).trim(), value: fill(h.value) }));

  // ── Auth ──
  const auth = draft.auth || blankAuth();
  if (auth.type === "bearer") {
    const token = fill(auth.token).trim();
    if (token) setHeader("Authorization", `Bearer ${token}`);
    else warnings.push("No bearer token entered — the request is sent without one.");
  } else if (auth.type === "basic") {
    const user = fill(auth.username);
    const pass = fill(auth.password);
    if (user || pass) setHeader("Authorization", `Basic ${toBase64(`${user}:${pass}`)}`);
    else warnings.push("No username or password entered — the request is sent without them.");
  } else if (auth.type === "apikey") {
    const key = fill(auth.key).trim();
    const value = fill(auth.value);
    if (!key) warnings.push("The API key has no name — nothing was added.");
    else if (auth.addTo === "query") query.push({ key, value });
    else setHeader(key, value);
  }

  const url = joinQuery(
    resolvedPath,
    query.map((row) => `${row.key}=${row.value}`).join("&"),
  );

  // ── Body ──
  const bodyDraft = draft.body || blankBody();
  const allowsBody = BODY_METHODS.includes(method);
  let body;
  let bodyText = "";
  let curlBody = [];
  let contentType = "";

  if (bodyDraft.mode !== "none") {
    if (!allowsBody) {
      warnings.push(`${method} requests are sent without a body.`);
    } else if (bodyDraft.mode === "raw") {
      bodyText = fill(bodyDraft.raw);
      if (bodyText.trim()) {
        body = bodyText;
        contentType = contentTypeFor(bodyDraft);
        curlBody = [`--data-raw ${shellQuote(bodyText)}`];
      }
    } else if (bodyDraft.mode === "urlencoded") {
      const params = new URLSearchParams();
      bodyDraft.fields
        .filter((f) => f.enabled && f.key.trim())
        .forEach((f) => params.append(fill(f.key).trim(), fill(f.value)));
      bodyText = params.toString();
      if (bodyText) {
        body = bodyText;
        contentType = contentTypeFor(bodyDraft);
        curlBody = [...params.entries()].map(
          ([k, v]) => `--data-urlencode ${shellQuote(`${k}=${v}`)}`,
        );
      }
    } else if (bodyDraft.mode === "formdata") {
      const form = new FormData();
      const lines = [];
      bodyDraft.fields
        .filter((f) => f.enabled && f.key.trim())
        .forEach((f) => {
          const key = fill(f.key).trim();
          if (f.type === "file") {
            if (f.file) {
              form.append(key, f.file, f.file.name);
              lines.push(`${key}: (file) ${f.file.name}`);
              curlBody.push(`-F ${shellQuote(`${key}=@${f.file.name}`)}`);
            } else {
              warnings.push(`${key}: no file chosen, so the field was left out.`);
            }
          } else {
            const value = fill(f.value);
            form.append(key, value);
            lines.push(`${key}: ${value}`);
            curlBody.push(`-F ${shellQuote(`${key}=${value}`)}`);
          }
        });
      if (lines.length) {
        body = form;
        bodyText = lines.join("\n");
      }
      // The browser writes the multipart boundary into Content-Type itself;
      // a hand-written one has no boundary and the server rejects it.
      const idx = headers.findIndex(
        (h) => h.key.toLowerCase() === "content-type" && /^multipart\//i.test(h.value),
      );
      if (idx !== -1) headers.splice(idx, 1);
    } else if (bodyDraft.mode === "graphql") {
      const payload = { query: fill(bodyDraft.graphql.query) };
      const rawVars = fill(bodyDraft.graphql.variables).trim();
      if (rawVars) {
        try {
          payload.variables = JSON.parse(rawVars);
        } catch {
          warnings.push("GraphQL variables are not valid JSON, so they were left out.");
        }
      }
      if (payload.query.trim()) {
        bodyText = JSON.stringify(payload);
        body = bodyText;
        contentType = contentTypeFor(bodyDraft);
        curlBody = [`--data-raw ${shellQuote(bodyText)}`];
      } else {
        warnings.push("The GraphQL query is empty.");
      }
    } else if (bodyDraft.mode === "binary") {
      if (bodyDraft.file) {
        body = bodyDraft.file;
        bodyText = `(file) ${bodyDraft.file.name}`;
        contentType = contentTypeFor(bodyDraft);
        curlBody = [`--data-binary ${shellQuote(`@${bodyDraft.file.name}`)}`];
      } else {
        warnings.push("No file chosen for the binary body.");
      }
    }
  }

  if (contentType && !headers.some((h) => h.key.toLowerCase() === "content-type")) {
    headers.push({ key: "Content-Type", value: contentType });
  }

  return { method, url, headers, body, bodyText, curlBody, unresolved, warnings };
};

/** Every variable name the draft refers to, wherever it appears. */
export const variablesUsedBy = (draft) => {
  const names = [];
  const eat = (text) =>
    findVariables(String(text ?? "")).forEach((name) => {
      if (!name.startsWith("$") && !names.includes(name)) names.push(name);
    });
  eat(draft.url);
  eat(draft.origin);
  Object.values(draft.pathValues || {}).forEach(eat);
  (draft.query || []).forEach((row) => {
    eat(row.key);
    eat(row.value);
  });
  (draft.headers || []).forEach((row) => {
    eat(row.key);
    eat(row.value);
  });
  const auth = draft.auth || {};
  [auth.token, auth.username, auth.password, auth.key, auth.value].forEach(eat);
  const body = draft.body || {};
  if (body.mode === "raw") eat(body.raw);
  if (body.mode === "formdata" || body.mode === "urlencoded")
    (body.fields || []).forEach((f) => {
      eat(f.key);
      eat(f.value);
    });
  if (body.mode === "graphql") {
    eat(body.graphql?.query);
    eat(body.graphql?.variables);
  }
  return names;
};

export const toCurl = (built) => {
  const parts = [`curl -X ${built.method}`, `  ${shellQuote(built.url)}`];
  built.headers.forEach((h) => parts.push(`  -H ${shellQuote(`${h.key}: ${h.value}`)}`));
  built.curlBody.forEach((flag) => parts.push(`  ${flag}`));
  return parts.join(" \\\n");
};

// ─── Writing a draft back onto the node ──

/** The auth block in the shape the parsers produce, so the inspector agrees. */
export const authToNode = (auth) => {
  if (!auth || auth.type === "none") return [];
  if (auth.type === "bearer")
    return [
      {
        name: "bearer",
        type: "bearer",
        scheme: "bearer",
        location: "header",
        headerName: "Authorization",
        scopes: [],
        values: [{ key: "token", value: auth.token }],
      },
    ];
  if (auth.type === "basic")
    return [
      {
        name: "basic",
        type: "basic",
        scheme: "basic",
        location: "header",
        headerName: "Authorization",
        scopes: [],
        values: [
          { key: "username", value: auth.username },
          { key: "password", value: auth.password },
        ],
      },
    ];
  return [
    {
      name: "apikey",
      type: "apikey",
      scheme: "",
      location: auth.addTo,
      headerName: auth.key,
      scopes: [],
      values: [
        { key: "key", value: auth.key },
        { key: "value", value: auth.value },
        { key: "in", value: auth.addTo },
      ],
    },
  ];
};

/** The body fields in the shape the parsers produce. */
export const bodyToNode = (body) => {
  const base = {
    body: null,
    bodyMode: body.mode,
    rawBody: "",
    language: "",
    formFields: [],
    graphql: undefined,
  };
  if (body.mode === "raw") {
    let parsed = body.raw;
    if (body.raw.trim()) {
      try {
        parsed = JSON.parse(body.raw);
      } catch {
        parsed = body.raw;
      }
    }
    return {
      ...base,
      body: body.raw.trim() ? parsed : null,
      rawBody: body.raw,
      language: body.language,
    };
  }
  if (body.mode === "formdata" || body.mode === "urlencoded")
    return {
      ...base,
      formFields: body.fields
        .filter((f) => f.key.trim())
        .map((f) => ({
          key: f.key,
          value: f.type === "file" ? f.file?.name || "" : f.value,
          type: f.type,
          disabled: !f.enabled,
          description: "",
        })),
    };
  if (body.mode === "graphql") return { ...base, graphql: { ...body.graphql } };
  if (body.mode === "binary") return { ...base, bodyMode: "file", fileSrc: body.file?.name || "" };
  return { ...base, bodyMode: "none" };
};
