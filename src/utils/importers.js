/**
 * Importers for the two things people paste most often.
 *
 * Both produce a Postman v2.1 collection, so everything downstream — the
 * parser, the map, the audit, the converters — works on them unchanged.
 */

const POSTMAN_SCHEMA =
  "https://schema.getpostman.com/json/collection/v2.1.0/collection.json";

// ─── cURL ────────────────────────────────────

/**
 * Split a command line the way a shell would.
 *
 * Quotes group, backslash-newline continues, and `$'…'` is treated as a plain
 * single-quoted string. This is not a shell, but it covers what a browser's
 * "Copy as cURL" produces, which is the only input that matters here.
 */
const tokenize = (input) => {
  const text = String(input || "")
    .replace(/\\\r?\n/g, " ") // line continuations
    .replace(/\^\r?\n/g, " ") // the cmd.exe flavour
    .trim();

  const tokens = [];
  let current = "";
  let quote = null;
  let started = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (quote) {
      if (char === "\\" && quote === '"' && i + 1 < text.length) {
        i += 1;
        current += text[i];
        continue;
      }
      if (char === quote) {
        quote = null;
        continue;
      }
      current += char;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      started = true;
      continue;
    }
    if (/\s/.test(char)) {
      if (current || started) tokens.push(current);
      current = "";
      started = false;
      continue;
    }
    if (char === "\\" && i + 1 < text.length && /\s/.test(text[i + 1])) {
      i += 1;
      current += text[i];
      continue;
    }
    current += char;
  }
  if (current || started) tokens.push(current);
  return tokens;
};

const splitHeader = (raw) => {
  const idx = String(raw).indexOf(":");
  if (idx < 0) return null;
  return {
    key: String(raw).slice(0, idx).trim(),
    value: String(raw).slice(idx + 1).trim(),
  };
};

export const looksLikeCurl = (text) => /^\s*curl\s/i.test(String(text || ""));

/** One cURL command → one Postman item. */
export const parseCurl = (command) => {
  const tokens = tokenize(command);
  if (!tokens.length || !/^curl$/i.test(tokens[0])) {
    throw new Error("That does not start with `curl`.");
  }

  let url = "";
  let method = "";
  const headers = [];
  const dataParts = [];
  const formParts = [];
  let user = "";
  let mode = "";

  for (let i = 1; i < tokens.length; i += 1) {
    const token = tokens[i];
    const next = () => tokens[(i += 1)] ?? "";

    if (token === "-X" || token === "--request") {
      method = next().toUpperCase();
    } else if (token === "-H" || token === "--header") {
      const header = splitHeader(next());
      if (header && header.key) headers.push(header);
    } else if (
      token === "-d" ||
      token === "--data" ||
      token === "--data-raw" ||
      token === "--data-binary" ||
      token === "--data-ascii"
    ) {
      dataParts.push(next());
      mode = mode || "raw";
    } else if (token === "--data-urlencode") {
      dataParts.push(next());
      mode = "urlencoded";
    } else if (token === "-F" || token === "--form") {
      formParts.push(next());
      mode = "formdata";
    } else if (token === "-u" || token === "--user") {
      user = next();
    } else if (token === "--url") {
      url = next();
    } else if (token === "-b" || token === "--cookie") {
      const cookie = next();
      if (cookie.includes("=")) headers.push({ key: "Cookie", value: cookie });
    } else if (token === "-A" || token === "--user-agent") {
      headers.push({ key: "User-Agent", value: next() });
    } else if (token === "-e" || token === "--referer") {
      headers.push({ key: "Referer", value: next() });
    } else if (token.startsWith("-")) {
      // Flags that take no value (--compressed, -k, -L, -s …) are ignored.
      continue;
    } else if (!url) {
      url = token;
    }
  }

  if (!url) throw new Error("No URL found in that cURL command.");

  const request = {
    method: method || (dataParts.length || formParts.length ? "POST" : "GET"),
    header: headers,
    url,
  };

  if (user) {
    const [username, ...rest] = user.split(":");
    request.auth = {
      type: "basic",
      basic: [
        { key: "username", value: username, type: "string" },
        { key: "password", value: rest.join(":"), type: "string" },
      ],
    };
  }

  if (formParts.length) {
    request.body = {
      mode: "formdata",
      formdata: formParts.map((part) => {
        const idx = part.indexOf("=");
        const key = idx > 0 ? part.slice(0, idx) : part;
        const value = idx > 0 ? part.slice(idx + 1) : "";
        return value.startsWith("@")
          ? { key, type: "file", src: value.slice(1) }
          : { key, type: "text", value };
      }),
    };
  } else if (dataParts.length) {
    const raw = dataParts.join(mode === "urlencoded" ? "&" : "");
    if (mode === "urlencoded") {
      request.body = {
        mode: "urlencoded",
        urlencoded: raw.split("&").filter(Boolean).map((pair) => {
          const idx = pair.indexOf("=");
          return idx > 0
            ? { key: pair.slice(0, idx), value: pair.slice(idx + 1), type: "text" }
            : { key: pair, value: "", type: "text" };
        }),
      };
    } else {
      request.body = { mode: "raw", raw, options: { raw: { language: "json" } } };
    }
  }

  let name = url;
  try {
    const path = url.replace(/^[a-zA-Z][\w+.-]*:\/\/[^/?#]+/, "") || "/";
    name = `${request.method} ${path.split("?")[0]}`;
  } catch {
    /* the raw URL is a fine name */
  }

  return { name, request };
};

/** A pasted block may hold several commands, one per `curl`. */
export const curlToCollection = (text, name = "Imported from cURL") => {
  const source = String(text || "");
  const commands = source
    .split(/\n(?=\s*curl\s)/)
    .map((c) => c.trim())
    .filter((c) => /^curl\s/i.test(c));

  const list = commands.length ? commands : [source.trim()];
  const items = list.map((command) => parseCurl(command));

  return {
    info: { name, schema: POSTMAN_SCHEMA },
    item: items,
  };
};

// ─── HAR ─────────────────────────────────────

export const looksLikeHar = (data) =>
  !!data && typeof data === "object" && !!data.log && Array.isArray(data.log.entries);

// A HAR straight out of a browser is mostly page assets; those are not API
// calls and burying 40 real requests among 900 of them helps nobody.
const ASSET_EXTENSION = /\.(css|js|mjs|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|eot|map|mp4|webm)(\?|$)/i;
const API_MIME = /(json|xml|graphql|x-www-form-urlencoded|protobuf)/i;

const isApiEntry = (entry) => {
  const request = entry?.request;
  if (!request?.url) return false;
  if (ASSET_EXTENSION.test(request.url)) return false;

  const resourceType = String(entry._resourceType || "").toLowerCase();
  if (resourceType === "xhr" || resourceType === "fetch") return true;
  if (resourceType && resourceType !== "other" && resourceType !== "document") return false;

  const accept = (request.headers || []).find(
    (h) => String(h.key || h.name).toLowerCase() === "accept",
  );
  if (accept && API_MIME.test(accept.value || "")) return true;
  if (request.postData && API_MIME.test(request.postData.mimeType || "")) return true;

  const responseMime = entry?.response?.content?.mimeType || "";
  return API_MIME.test(responseMime);
};

const hostOf = (url) => {
  const match = String(url).match(/^[a-zA-Z][\w+.-]*:\/\/([^/?#]+)/);
  return match ? match[1] : "other";
};

const harItem = (entry) => {
  const request = entry.request || {};
  const url = request.url || "";
  const path = url.replace(/^[a-zA-Z][\w+.-]*:\/\/[^/?#]+/, "").split("?")[0] || "/";

  const item = {
    name: `${request.method || "GET"} ${path}`,
    request: {
      method: request.method || "GET",
      header: (request.headers || [])
        .map((h) => ({ key: h.key || h.name, value: String(h.value ?? "") }))
        // Browser-generated pseudo-headers are not part of the API contract.
        .filter((h) => h.key && !h.key.startsWith(":")),
      url,
    },
  };

  const postData = request.postData;
  if (postData?.text) {
    item.request.body = {
      mode: "raw",
      raw: postData.text,
      options: { raw: { language: /json/i.test(postData.mimeType || "") ? "json" : "text" } },
    };
  } else if (postData?.params?.length) {
    item.request.body = {
      mode: "urlencoded",
      urlencoded: postData.params.map((p) => ({
        key: p.name,
        value: String(p.value ?? ""),
        type: "text",
      })),
    };
  }

  // The captured response becomes a saved example — this is the real value of
  // a HAR: the collection arrives already documented with genuine responses.
  const response = entry.response;
  if (response && response.status) {
    const body = response.content?.text;
    item.response = [
      {
        name: `${response.status} ${response.statusText || ""}`.trim(),
        originalRequest: item.request,
        code: response.status,
        status: response.statusText || "",
        header: (response.headers || [])
          .map((h) => ({ key: h.key || h.name, value: String(h.value ?? "") }))
          .filter((h) => h.key && !h.key.startsWith(":")),
        body: typeof body === "string" ? body : "",
        _postman_previewlanguage: /json/i.test(response.content?.mimeType || "")
          ? "json"
          : "text",
      },
    ];
  }

  return item;
};

/**
 * A HAR → a collection grouped by host, with the captured responses kept as
 * examples. Returns the collection plus what was filtered out, so the import
 * screen can say so rather than silently dropping most of the file.
 */
export const harToCollection = (data, name = "Imported from HAR") => {
  const entries = data?.log?.entries || [];
  const kept = entries.filter(isApiEntry);

  const byHost = new Map();
  kept.forEach((entry) => {
    const host = hostOf(entry.request?.url);
    if (!byHost.has(host)) byHost.set(host, []);
    byHost.get(host).push(harItem(entry));
  });

  // Requests to the same method and path repeat constantly in a recording.
  const dedupe = (items) => {
    const seen = new Set();
    return items.filter((item) => {
      if (seen.has(item.name)) return false;
      seen.add(item.name);
      return true;
    });
  };

  const folders = [...byHost.entries()].map(([host, items]) => ({
    name: host,
    item: dedupe(items),
  }));

  const collection = {
    info: {
      name: data?.log?.pages?.[0]?.title ? `${name} · ${data.log.pages[0].title}` : name,
      schema: POSTMAN_SCHEMA,
    },
    item: folders.length === 1 ? folders[0].item : folders,
  };

  const total = folders.reduce((n, f) => n + f.item.length, 0);
  return {
    collection,
    stats: {
      entries: entries.length,
      apiCalls: kept.length,
      imported: total,
      skipped: entries.length - kept.length,
      duplicates: kept.length - total,
    },
  };
};
