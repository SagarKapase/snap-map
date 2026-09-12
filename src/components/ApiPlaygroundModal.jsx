import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  X,
  Send,
  Plus,
  Trash2,
  RefreshCw,
  AlertCircle,
  Check,
  Copy,
  Terminal,
  Clock,
  Wifi,
  Save,
  Lock,
  Braces,
  Ban,
  WandSparkles,
} from "lucide-react";
import { methodColor } from "../utils/constants";
import { resolveText, findVariables } from "../utils/variables";
import JsonView from "./workspace/JsonView";
import { toJsonText } from "../utils/format";
import ExplainResponse from "./ai/ExplainResponse";
import { hasApiKey } from "../utils/ai/client";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
const BODY_METHODS = ["POST", "PUT", "PATCH", "DELETE"];
const PATH_VAR = /\{([^}/]+)\}|:([a-zA-Z_][a-zA-Z0-9_-]*)/g;

/** Names of the {placeholder} / :placeholder segments in a URL path. */
const pathVarsIn = (url) => {
  const names = [];
  let match;
  PATH_VAR.lastIndex = 0;
  while ((match = PATH_VAR.exec(String(url || ""))) !== null) {
    const name = match[1] || match[2];
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
};

/** Split "a=1&b=2" without re-encoding what the user typed. */
const parseQuery = (queryString) =>
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
const joinQuery = (url, query) => {
  if (!query) return url;
  return url.includes("?") ? `${url}&${query}` : `${url}?${query}`;
};

const serializeQuery = (rows) =>
  rows
    .filter((row) => row.enabled && row.key.trim())
    .map((row) => `${row.key}=${row.value}`)
    .join("&");

/** POSIX-safe single quoting — a quote cannot be backslash-escaped inside ''. */
const shellQuote = (value) => `'${String(value).replace(/'/g, "'\\''")}'`;

const formatBytes = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const statusTone = (status) => {
  if (!status) return "bg-white/6 text-vz-soft";
  if (status < 300) return "bg-vz-green/14 text-vz-green";
  if (status < 400) return "bg-vz-warn/14 text-vz-warn";
  return "bg-vz-red/14 text-[#fda4af]";
};

const Field = (props) => (
  <input
    {...props}
    className={`vz-mono vz-t h-8 min-w-0 rounded-lg border border-vz-line bg-vz-bg px-2.5 text-[12px] text-vz-text placeholder:text-vz-dim focus:border-vz-accent/50 ${props.className || ""}`}
  />
);

/** A URL the browser can actually send: scheme and host present. */
const isAbsolute = (url) => /^[a-zA-Z][\w+.-]*:\/\//.test(String(url || "").trim());

const joinBase = (origin, path) => {
  const base = String(origin || "").replace(/\/+$/, "");
  const rest = String(path || "");
  if (!base) return rest;
  return rest.startsWith("/") ? `${base}${rest}` : `${base}/${rest}`;
};

const ApiPlaygroundModal = ({
  node,
  onClose,
  onUpdate,
  onResponse,
  variables = null,
  servers = [],
  origin: originProp = "",
  onOriginChange,
  spec = null,
  onNeedAiKey,
}) => {
  const [method, setMethod] = useState(node?.method || "GET");

  /**
   * What the spec says the URL is, with everything it already knows filled in.
   *
   * A Postman collection writes "{{baseUrl}}/v1/customers" and an OpenAPI
   * document with no `servers` writes "/v1/customers" — neither can be sent
   * as written, and both used to arrive in the URL box exactly like that.
   */
  const resolvedPath = useMemo(() => {
    const raw = String(node?.path || "");
    return variables ? resolveText(raw, variables).text : raw;
  }, [node, variables]);

  // The URL box holds the path only; query parameters are edited as rows so
  // they can be toggled without rewriting the string.
  const [baseUrl, setBaseUrl] = useState(() => resolvedPath.split("?")[0]);
  const [queryRows, setQueryRows] = useState(() => parseQuery(resolvedPath.split("?")[1]));

  // Where a relative path is sent. Seeded from the servers the document
  // declares, and lifted to the workspace so it is not retyped per request.
  const [origin, setOrigin] = useState(
    () => originProp || servers.find((url) => isAbsolute(url)) || "",
  );
  const updateOrigin = (value) => {
    setOrigin(value);
    onOriginChange?.(value);
  };

  // Path placeholders are kept in the URL and substituted at send time, so
  // "Update endpoint" still stores the templated path.
  const [pathValues, setPathValues] = useState(() => {
    const seed = {};
    (node?.params || []).forEach((p) => {
      if (p.in === "path" && p.example != null) seed[p.name] = String(p.example);
    });
    return seed;
  });

  const [headers, setHeaders] = useState(() =>
    node?.headers?.length
      ? node.headers.map((h) => ({ key: h.key, value: h.value }))
      : [
          { key: "Content-Type", value: "application/json" },
          { key: "Accept", value: "*/*" },
        ],
  );
  const [body, setBody] = useState(node?.body ? JSON.stringify(node.body, null, 2) : "");

  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [reqError, setReqError] = useState("");
  const [curlCopied, setCurlCopied] = useState(false);
  const [responseCopied, setResponseCopied] = useState(false);
  const [updateSaved, setUpdateSaved] = useState(false);
  const [requestTab, setRequestTab] = useState("params");
  const [responseTab, setResponseTab] = useState("body");
  // The AI explanation is keyed on the response it explains, so a re-send
  // starts a fresh one rather than showing a stale verdict.
  const [explainKey, setExplainKey] = useState(null);
  const abortRef = useRef(null);

  const mc = methodColor(method);
  const pathVars = useMemo(() => pathVarsIn(baseUrl), [baseUrl]);
  const missingVars = pathVars.filter((name) => !String(pathValues[name] || "").trim());

  const specQuery = useMemo(
    () => (node?.params || []).filter((p) => p.in === "query"),
    [node],
  );

  /** What "Update endpoint" would store: template intact, query rebuilt. */
  const composedUrl = useMemo(
    () => joinQuery(baseUrl, serializeQuery(queryRows)),
    [baseUrl, queryRows],
  );

  /** What actually gets requested: base applied, placeholders resolved. */
  const effectiveUrl = useMemo(() => {
    const withBase = isAbsolute(baseUrl) ? baseUrl : joinBase(origin, baseUrl);
    const resolved = withBase.replace(PATH_VAR, (whole, braced, colon) => {
      const name = braced || colon;
      const value = pathValues[name];
      return value != null && String(value).trim()
        ? encodeURIComponent(String(value).trim())
        : whole;
    });
    return joinQuery(resolved, serializeQuery(queryRows));
  }, [baseUrl, origin, pathValues, queryRows]);

  // A relative URL would be sent to wherever Vizroute is hosted, which
  // returns this page rather than the API. Say so instead.
  const needsBase = !isAbsolute(baseUrl) && !isAbsolute(effectiveUrl);
  const unresolvedVars = useMemo(() => {
    const found = findVariables(effectiveUrl).filter((name) => !name.startsWith("$"));
    return [...new Set(found)];
  }, [effectiveUrl]);

  const hasChanges = useMemo(() => {
    if (!node) return false;
    if (method !== (node.method || "GET")) return true;
    if (composedUrl !== resolvedPath) return true;
    const originalBody = node.body ? JSON.stringify(node.body, null, 2) : "";
    return body !== originalBody;
  }, [method, composedUrl, body, node, resolvedPath]);

  const authHint = useMemo(() => {
    const auth = (node?.auth || [])[0];
    if (!auth) return null;
    const type = String(auth.type || auth.name || "").toLowerCase();
    if (type === "http" || type === "bearer")
      return auth.scheme === "basic"
        ? { label: "Basic authentication required", prefix: "Basic " }
        : { label: "Bearer token required", prefix: "Bearer " };
    if (type === "apikey")
      return { label: `API key required${auth.headerName ? ` (${auth.headerName})` : ""}`, prefix: "", key: auth.headerName || "X-API-Key" };
    return { label: `${auth.name || "Authentication"} required`, prefix: "" };
  }, [node]);

  const hasAuthHeader = headers.some(
    (h) => h.key.trim().toLowerCase() === (authHint?.key || "authorization").toLowerCase(),
  );

  const addQueryRow = () =>
    setQueryRows((rows) => [...rows, { key: "", value: "", enabled: true }]);
  const updateQueryRow = (i, patch) =>
    setQueryRows((rows) => rows.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const removeQueryRow = (i) =>
    setQueryRows((rows) => rows.filter((_, idx) => idx !== i));

  const addHeader = () => setHeaders((h) => [...h, { key: "", value: "" }]);
  const removeHeader = (i) => setHeaders((h) => h.filter((_, idx) => idx !== i));
  const updateHeader = (i, field, val) =>
    setHeaders((h) => h.map((row, idx) => (idx === i ? { ...row, [field]: val } : row)));

  const addAuthHeader = () => {
    setHeaders((h) => [
      ...h,
      { key: authHint?.key || "Authorization", value: authHint?.prefix || "" },
    ]);
    setRequestTab("headers");
  };

  const handleSend = useCallback(async () => {
    if (!effectiveUrl.trim()) {
      setReqError("URL is required");
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setReqError("");
    setResponse(null);
    setResponseTab("body");
    setExplainKey(null);

    try {
      const headerObject = {};
      headers.forEach((h) => {
        if (h.key.trim()) headerObject[h.key.trim()] = h.value;
      });
      if (!isAbsolute(effectiveUrl)) {
        throw new Error(
          "This URL has no host. Set a base URL above so the request has somewhere to go.",
        );
      }

      const options = { method, headers: headerObject, signal: controller.signal };
      if (BODY_METHODS.includes(method) && body.trim()) options.body = body;

      const startedAt = Date.now();
      const res = await fetch(effectiveUrl, options);
      const elapsed = Date.now() - startedAt;
      const text = await res.text();

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }

      const responseHeaders = [];
      res.headers.forEach((value, key) => responseHeaders.push({ key, value }));

      const result = {
        status: res.status,
        statusText: res.statusText,
        elapsed,
        data,
        isJson: typeof data === "object" && data !== null,
        size: new Blob([text]).size,
        headers: responseHeaders,
        url: effectiveUrl,
      };
      setResponse(result);
      if (node?.id) onResponse?.(node.id, { ...result, at: new Date().toISOString() });
    } catch (err) {
      if (err.name === "AbortError") setReqError("Request cancelled.");
      else
        setReqError(
          err.message.includes("Failed to fetch")
            ? "Network error — the host may not allow cross-origin requests from the browser."
            : err.message,
        );
    } finally {
      abortRef.current = null;
      setLoading(false);
    }
  }, [effectiveUrl, headers, method, body, node, onResponse]);

  // Ctrl/Cmd+Enter sends, like every other HTTP client
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        if (!loading) handleSend();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [handleSend, loading]);

  // Never leave a request running behind a closed modal
  useEffect(() => () => abortRef.current?.abort(), []);

  const handleUpdate = () => {
    if (!onUpdate || !node) return;
    let parsedBody = null;
    if (body.trim()) {
      try {
        parsedBody = JSON.parse(body);
      } catch {
        parsedBody = body;
      }
    }
    onUpdate(node.id, {
      method,
      path: composedUrl,
      body: parsedBody,
      headers: headers.filter((h) => h.key.trim()),
    });
    setUpdateSaved(true);
    setTimeout(() => setUpdateSaved(false), 2000);
  };

  const handleFormatBody = () => {
    if (!body.trim()) return;
    try {
      setBody(JSON.stringify(JSON.parse(body), null, 2));
    } catch {
      /* leave non-JSON bodies alone */
    }
  };

  const handleCopyCurl = () => {
    const parts = [`curl -X ${method}`, `  ${shellQuote(effectiveUrl)}`];
    headers
      .filter((h) => h.key.trim())
      .forEach((h) => parts.push(`  -H ${shellQuote(`${h.key}: ${h.value}`)}`));
    if (BODY_METHODS.includes(method) && body.trim())
      parts.push(`  --data-raw ${shellQuote(body)}`);
    navigator.clipboard?.writeText(parts.join(" \\\n"));
    setCurlCopied(true);
    setTimeout(() => setCurlCopied(false), 2000);
  };

  const responseText = response
    ? response.isJson
      ? toJsonText(response.data)
      : String(response.data ?? "")
    : "";

  const handleCopyResponse = () => {
    if (!response) return;
    navigator.clipboard?.writeText(responseText);
    setResponseCopied(true);
    setTimeout(() => setResponseCopied(false), 2000);
  };

  const paramCount = pathVars.length + queryRows.length;
  const headerCount = headers.filter((h) => h.key.trim()).length;

  const requestTabs = [
    { id: "params", label: "Params", count: paramCount, alert: missingVars.length > 0 },
    { id: "headers", label: "Headers", count: headerCount },
    { id: "body", label: "Body" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div
        className="playground-enter relative flex w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-vz-line bg-vz-panel shadow-[0_40px_80px_-16px_rgba(0,0,0,0.7)]"
        style={{ height: "min(95vh, 820px)" }}
        role="dialog"
        aria-modal="true"
        aria-label="API playground"
      >
        {/* ── Header ── */}
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-vz-line-soft px-4 py-3">
          <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg border border-vz-accent/25 bg-vz-accent/10 text-vz-accent-2">
            <Terminal size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-vz-text">API Playground</p>
            <p className="truncate text-[12px] text-vz-dim">{node?.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close playground"
            className="vz-t rounded-lg p-2 text-vz-dim hover:bg-white/6 hover:text-vz-text"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── URL bar ── */}
        <div className="flex-shrink-0 border-b border-vz-line-soft px-4 py-3">
          <div className="flex items-center gap-2">
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              aria-label="HTTP method"
              className={`vz-t h-10 flex-shrink-0 cursor-pointer rounded-lg border border-vz-line bg-vz-panel-2 px-2.5 text-[13px] font-bold uppercase focus:border-vz-accent/50 ${mc.text}`}
            >
              {METHODS.map((m) => (
                <option key={m} value={m} className="text-vz-text">
                  {m}
                </option>
              ))}
            </select>

            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.example.com/endpoint"
              aria-label="Request URL"
              className="vz-mono vz-t h-10 min-w-0 flex-1 rounded-lg border border-vz-line bg-vz-bg px-3 text-[13px] text-vz-text placeholder:text-vz-dim focus:border-vz-accent/50"
            />

            {loading ? (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                className="vz-t flex h-10 flex-shrink-0 items-center gap-2 rounded-lg border border-vz-line bg-vz-panel-2 px-4 text-[13px] font-semibold text-vz-soft hover:text-vz-text"
              >
                <Ban size={14} /> Cancel
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSend}
                className="vz-t flex h-10 flex-shrink-0 items-center gap-2 rounded-lg bg-gradient-to-r from-[#a855f7] to-[#c760ff] px-5 text-[13px] font-bold text-[#160a1d] hover:opacity-90"
              >
                <Send size={14} /> Send
              </button>
            )}
          </div>

          {/* The document did not say where this path lives, so it has to be
              asked for rather than guessed at — and once given it is reused
              for every request in this workspace. */}
          {needsBase && (
            <div className="mt-2.5 rounded-lg border border-vz-warn/25 bg-vz-warn/[0.06] px-3 py-2.5">
              <label
                htmlFor="pg-base-url"
                className="flex items-center gap-1.5 text-[11.5px] font-semibold text-vz-warn"
              >
                <AlertCircle size={12} />
                This path has no host
              </label>
              <p className="mt-1 text-[11.5px] leading-relaxed text-vz-soft">
                {servers.length
                  ? "The specification declares a relative server, so the host has to come from you."
                  : "The specification declares no server, so the host has to come from you."}
              </p>
              <input
                id="pg-base-url"
                value={origin}
                onChange={(e) => updateOrigin(e.target.value)}
                placeholder="https://api.example.com"
                list="pg-known-servers"
                spellCheck={false}
                className="vz-mono vz-t mt-2 h-9 w-full rounded-lg border border-vz-line bg-vz-bg px-2.5 text-[12.5px] text-vz-text placeholder:text-vz-dim focus:border-vz-accent/50"
              />
              {servers.length > 0 && (
                <datalist id="pg-known-servers">
                  {servers.map((url) => (
                    <option key={url} value={url} />
                  ))}
                </datalist>
              )}
            </div>
          )}

          {unresolvedVars.length > 0 && (
            <p className="mt-2 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-vz-warn">
              <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
              {unresolvedVars.map((name) => `{{${name}}}`).join(", ")} still{" "}
              {unresolvedVars.length === 1 ? "has" : "have"} no value. Pick an
              environment, or type the value into the URL.
            </p>
          )}

          {effectiveUrl !== baseUrl && (
            <p className="vz-mono mt-2 truncate text-[11px] text-vz-dim" title={effectiveUrl}>
              <span className="text-vz-soft">→</span> {effectiveUrl}
            </p>
          )}
        </div>

        {/* ── Request / response ── */}
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* Request */}
          <div className="flex min-h-0 flex-1 flex-col border-b border-vz-line-soft lg:w-1/2 lg:border-b-0 lg:border-r">
            <div className="flex flex-shrink-0 items-center gap-1 border-b border-vz-line-soft px-2">
              {requestTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setRequestTab(tab.id)}
                  className={`vz-t relative px-3 py-3 text-[12px] ${
                    requestTab === tab.id
                      ? "text-[#e6c4ff] after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-vz-accent-2"
                      : "text-vz-soft hover:text-vz-text"
                  }`}
                >
                  {tab.label}
                  {tab.count > 0 && (
                    <span className="ml-1.5 tabular-nums text-vz-dim">{tab.count}</span>
                  )}
                  {tab.alert && (
                    <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-vz-warn align-middle" />
                  )}
                </button>
              ))}
            </div>

            {requestTab === "params" && (
              <div className="vz-scroll min-h-0 flex-1 overflow-auto p-4">
                {pathVars.length > 0 && (
                  <section className="mb-5">
                    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-vz-dim">
                      Path variables
                    </h3>
                    <div className="space-y-2">
                      {pathVars.map((name) => {
                        const spec = (node?.params || []).find(
                          (p) => p.in === "path" && p.name === name,
                        );
                        return (
                          <div key={name} className="flex items-center gap-2">
                            <span className="vz-mono w-[34%] flex-shrink-0 truncate text-[12px] text-vz-soft">
                              {name}
                              {spec?.type ? (
                                <span className="ml-1.5 text-[11px] text-vz-blue">
                                  {spec.type}
                                </span>
                              ) : null}
                            </span>
                            <Field
                              value={pathValues[name] || ""}
                              onChange={(e) =>
                                setPathValues((v) => ({ ...v, [name]: e.target.value }))
                              }
                              placeholder="value"
                              aria-label={`Path variable ${name}`}
                              className="flex-1"
                            />
                          </div>
                        );
                      })}
                    </div>
                    {missingVars.length > 0 && (
                      <p className="mt-2 flex items-start gap-1.5 text-[11px] text-vz-warn">
                        <AlertCircle size={12} className="mt-px flex-shrink-0" />
                        {missingVars.join(", ")} {missingVars.length === 1 ? "has" : "have"} no
                        value — the placeholder will be sent as written.
                      </p>
                    )}
                  </section>
                )}

                <section>
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-vz-dim">
                    Query parameters
                  </h3>
                  {queryRows.length === 0 && (
                    <p className="mb-2 text-[12px] text-vz-dim">None.</p>
                  )}
                  <div className="space-y-2">
                    {queryRows.map((row, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={row.enabled}
                          onChange={(e) => updateQueryRow(i, { enabled: e.target.checked })}
                          aria-label={`Include ${row.key || "parameter"}`}
                          className="h-3.5 w-3.5 flex-shrink-0 accent-[#a855f7]"
                        />
                        <Field
                          value={row.key}
                          onChange={(e) => updateQueryRow(i, { key: e.target.value })}
                          placeholder="key"
                          className="flex-1"
                        />
                        <Field
                          value={row.value}
                          onChange={(e) => updateQueryRow(i, { value: e.target.value })}
                          placeholder="value"
                          className="flex-1"
                        />
                        <button
                          type="button"
                          onClick={() => removeQueryRow(i)}
                          aria-label="Remove parameter"
                          className="vz-t flex-shrink-0 rounded-lg p-1.5 text-vz-dim hover:bg-vz-red/10 hover:text-vz-red"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={addQueryRow}
                      className="vz-t flex items-center gap-1.5 text-[12px] text-vz-soft hover:text-vz-accent-2"
                    >
                      <Plus size={13} /> Add parameter
                    </button>
                    {specQuery
                      .filter((p) => !queryRows.some((row) => row.key === p.name))
                      .map((p) => (
                        <button
                          key={p.name}
                          type="button"
                          onClick={() =>
                            setQueryRows((rows) => [
                              ...rows,
                              {
                                key: p.name,
                                value: p.example != null ? String(p.example) : "",
                                enabled: true,
                              },
                            ])
                          }
                          title={p.description || `Add ${p.name} from the spec`}
                          className="vz-t vz-mono rounded-md border border-vz-line bg-vz-panel-2 px-2 py-1 text-[11px] text-vz-dim hover:text-vz-text"
                        >
                          + {p.name}
                        </button>
                      ))}
                  </div>
                </section>
              </div>
            )}

            {requestTab === "headers" && (
              <div className="vz-scroll min-h-0 flex-1 overflow-auto p-4">
                {authHint && !hasAuthHeader && (
                  <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-vz-accent/20 bg-vz-accent/[0.06] px-3 py-2.5">
                    <Lock size={13} className="flex-shrink-0 text-vz-accent-2" />
                    <span className="text-[12px] text-vz-soft">{authHint.label}</span>
                    <button
                      type="button"
                      onClick={addAuthHeader}
                      className="vz-t ml-auto rounded-md border border-vz-line bg-vz-panel-2 px-2 py-1 text-[11px] text-vz-soft hover:text-vz-text"
                    >
                      Add header
                    </button>
                  </div>
                )}

                <div className="space-y-2">
                  {headers.map((h, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Field
                        value={h.key}
                        onChange={(e) => updateHeader(i, "key", e.target.value)}
                        placeholder="Header"
                        className="flex-1"
                      />
                      <Field
                        value={h.value}
                        onChange={(e) => updateHeader(i, "value", e.target.value)}
                        placeholder="Value"
                        className="flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => removeHeader(i)}
                        aria-label="Remove header"
                        className="vz-t flex-shrink-0 rounded-lg p-1.5 text-vz-dim hover:bg-vz-red/10 hover:text-vz-red"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={addHeader}
                  className="vz-t mt-3 flex items-center gap-1.5 text-[12px] text-vz-soft hover:text-vz-accent-2"
                >
                  <Plus size={13} /> Add header
                </button>
              </div>
            )}

            {requestTab === "body" && (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex flex-shrink-0 items-center gap-3 border-b border-vz-line-soft px-3 py-2">
                  <span className="text-[11px] text-vz-dim">
                    {BODY_METHODS.includes(method)
                      ? "Sent as the request body"
                      : `${method} requests are sent without a body`}
                  </span>
                  <button
                    type="button"
                    onClick={handleFormatBody}
                    disabled={!body.trim()}
                    className="vz-t ml-auto flex items-center gap-1.5 text-[12px] text-vz-soft hover:text-vz-text disabled:opacity-35"
                  >
                    <Braces size={13} /> Format
                  </button>
                </div>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={'{\n  "key": "value"\n}'}
                  spellCheck={false}
                  aria-label="Request body"
                  className="vz-mono vz-scroll min-h-0 flex-1 resize-none bg-transparent p-4 text-[12.5px] text-vz-text placeholder:text-vz-dim focus:outline-none"
                  style={{ lineHeight: "1.7", caretColor: "#a855f7" }}
                />
              </div>
            )}
          </div>

          {/* Response */}
          <div className="flex min-h-0 flex-1 flex-col lg:w-1/2">
            <div className="flex flex-shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-vz-line-soft px-3 py-2">
              {response ? (
                <>
                  {["body", "headers"].map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setResponseTab(tab)}
                      className={`vz-t rounded-md px-2 py-1 text-[12px] capitalize ${
                        responseTab === tab
                          ? "bg-white/8 text-vz-text"
                          : "text-vz-soft hover:text-vz-text"
                      }`}
                    >
                      {tab}
                      {tab === "headers" && response.headers.length > 0 && (
                        <span className="ml-1.5 tabular-nums text-vz-dim">
                          {response.headers.length}
                        </span>
                      )}
                    </button>
                  ))}

                  <span
                    className={`ml-auto rounded-md px-2 py-1 text-[11px] font-bold ${statusTone(response.status)}`}
                  >
                    {response.status} {response.statusText}
                  </span>
                  <span className="vz-mono flex items-center gap-1 text-[11px] text-vz-dim">
                    <Clock size={11} /> {response.elapsed}ms
                  </span>
                  <span className="vz-mono text-[11px] text-vz-dim">
                    {formatBytes(response.size)}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyResponse}
                    className="vz-t flex items-center gap-1 text-[11px] text-vz-dim hover:text-vz-text"
                  >
                    {responseCopied ? (
                      <>
                        <Check size={11} className="text-vz-green" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy size={11} /> Copy
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!hasApiKey()) {
                        onNeedAiKey?.();
                        return;
                      }
                      setExplainKey((k) => (k ? null : `${response.status}-${response.elapsed}-${Date.now()}`));
                    }}
                    title="Explain this response with AI"
                    className={`vz-t flex items-center gap-1 text-[11px] hover:text-vz-text ${explainKey ? "text-vz-text" : "text-vz-accent-2"}`}
                  >
                    <WandSparkles size={11} /> Explain
                  </button>
                </>
              ) : (
                <span className="text-[11px] font-semibold uppercase tracking-wider text-vz-dim">
                  Response
                </span>
              )}
            </div>

            <div className="vz-scroll min-h-0 flex-1 overflow-auto">
              {loading && (
                <div className="flex h-full flex-col items-center justify-center gap-3">
                  <RefreshCw size={22} className="animate-spin text-vz-accent" />
                  <p className="text-[13px] text-vz-soft">Sending request…</p>
                  <p className="text-[12px] text-vz-dim">Cancel with the button above</p>
                </div>
              )}

              {!loading && reqError && (
                <div className="p-4">
                  <div className="flex items-start gap-3 rounded-xl border border-vz-red/20 bg-vz-red/[0.07] p-4">
                    <AlertCircle size={16} className="mt-0.5 flex-shrink-0 text-vz-red" />
                    <div>
                      <p className="text-[13px] font-semibold text-[#fda4af]">
                        Request failed
                      </p>
                      <p className="mt-1 text-[12px] leading-relaxed text-vz-soft">
                        {reqError}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {!loading && !reqError && response && explainKey && (
                <ExplainResponse
                  key={explainKey}
                  node={node}
                  spec={spec}
                  request={{
                    method,
                    url: effectiveUrl,
                    headers: headers.filter((h) => h.key.trim()),
                    body: BODY_METHODS.includes(method) && body.trim() ? body : "",
                  }}
                  response={response}
                  onClose={() => setExplainKey(null)}
                />
              )}

              {!loading && !reqError && response && responseTab === "body" && (
                <div className="p-4">
                  <JsonView value={responseText} className="text-[12px]" />
                </div>
              )}

              {!loading && !reqError && response && responseTab === "headers" && (
                <div className="p-4">
                  <div className="space-y-1.5">
                    {response.headers.map((h) => (
                      <div key={h.key} className="flex gap-3 text-[12px]">
                        <span className="vz-mono w-[38%] flex-shrink-0 break-all text-vz-soft">
                          {h.key}
                        </span>
                        <span className="vz-mono min-w-0 flex-1 break-all text-vz-dim">
                          {h.value}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 text-[11px] leading-relaxed text-vz-dim">
                    Browsers only expose CORS-safelisted response headers unless the
                    server sends Access-Control-Expose-Headers.
                  </p>
                </div>
              )}

              {!loading && !reqError && !response && (
                <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                  <span className="grid h-12 w-12 place-items-center rounded-xl border border-vz-line bg-vz-panel-2 text-vz-dim">
                    <Send size={20} />
                  </span>
                  <p className="text-[13px] text-vz-soft">Send the request to see the response</p>
                  <p className="text-[12px] text-vz-dim">
                    Status, timing, headers and body appear here
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex flex-shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-t border-vz-line-soft px-4 py-2.5">
          <button
            type="button"
            onClick={handleCopyCurl}
            className="vz-t flex items-center gap-2 text-[12px] text-vz-soft hover:text-vz-text"
          >
            {curlCopied ? (
              <>
                <Check size={13} className="text-vz-green" /> Copied
              </>
            ) : (
              <>
                <Copy size={13} /> Copy as cURL
              </>
            )}
          </button>

          <span className="hidden items-center gap-1.5 text-[11px] text-vz-dim sm:flex">
            <Wifi size={11} /> CORS restrictions may apply
          </span>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden items-center gap-1 sm:flex">
              {["Ctrl", "Enter"].map((key) => (
                <kbd
                  key={key}
                  className="vz-mono rounded border border-vz-line bg-vz-elev px-1.5 py-0.5 text-[10px] text-vz-dim"
                >
                  {key}
                </kbd>
              ))}
            </span>
            {hasChanges && onUpdate && (
              <button
                type="button"
                onClick={handleUpdate}
                className={`vz-t flex items-center gap-2 rounded-lg px-3.5 py-2 text-[12px] font-semibold ${
                  updateSaved
                    ? "bg-vz-green/15 text-vz-green"
                    : "bg-gradient-to-r from-[#a855f7] to-[#c760ff] text-[#160a1d] hover:opacity-90"
                }`}
              >
                {updateSaved ? (
                  <>
                    <Check size={13} /> Saved
                  </>
                ) : (
                  <>
                    <Save size={13} /> Update endpoint
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ApiPlaygroundModal;
