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
  FilePlus2,
  Upload,
  RotateCcw,
  Globe,
  Search,
} from "lucide-react";
import { methodColor } from "../utils/constants";
import {
  METHODS,
  BODY_METHODS,
  AUTH_TYPES,
  BODY_MODES,
  RAW_LANGUAGES,
  DEFAULT_SETTINGS,
  pathVarsIn,
  isAbsolute,
  startsWithVariable,
  variablesUsedBy,
  parseQuery,
  joinQuery,
  serializeQuery,
  seedAuth,
  seedBody,
  seedHeaders,
  describeAuth,
  blankField,
  buildRequest,
  toCurl,
  authToNode,
  bodyToNode,
} from "../utils/playground";
import JsonView from "./workspace/JsonView";
import { toJsonText } from "../utils/format";
import ExplainResponse from "./ai/ExplainResponse";
import { hasApiKey } from "../utils/ai/client";

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

const SectionTitle = ({ children }) => (
  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-vz-dim">
    {children}
  </h3>
);

const Hint = ({ children, tone = "dim" }) => (
  <p
    className={`mt-2 flex items-start gap-1.5 text-[11.5px] leading-relaxed ${
      tone === "warn" ? "text-vz-warn" : "text-vz-dim"
    }`}
  >
    {tone === "warn" && <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />}
    <span>{children}</span>
  </p>
);

/** A row of mutually exclusive choices — auth type, body mode, and so on. */
const Segmented = ({ options, value, onChange, label }) => (
  <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
    {options.map((option) => (
      <button
        key={option.id}
        type="button"
        role="radio"
        aria-checked={value === option.id}
        onClick={() => onChange(option.id)}
        className={`vz-t rounded-md border px-2.5 py-1 text-[11.5px] ${
          value === option.id
            ? "border-vz-accent/40 bg-vz-accent/12 text-[#e6c4ff]"
            : "border-vz-line bg-vz-panel-2 text-vz-soft hover:text-vz-text"
        }`}
      >
        {option.label}
      </button>
    ))}
  </div>
);

const FilePicker = ({ file, onChange, label }) => (
  <label className="vz-t flex h-8 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-vz-line bg-vz-bg px-2.5 text-[12px] text-vz-soft hover:border-vz-accent/40 hover:text-vz-text">
    <Upload size={12} className="flex-shrink-0 text-vz-dim" />
    <span className="vz-mono truncate">{file ? `${file.name} · ${formatBytes(file.size)}` : "Choose file…"}</span>
    <input
      type="file"
      aria-label={label}
      className="sr-only"
      onChange={(e) => onChange(e.target.files?.[0] || null)}
    />
  </label>
);

/**
 * Key/value rows with an on/off switch each, as used for query parameters,
 * headers and form fields. Rows that also carry a file get a picker.
 */
const KeyValueRows = ({ rows, onChange, keyPlaceholder, valuePlaceholder, addLabel, withType = false, noun }) => {
  const update = (i, patch) =>
    onChange(rows.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const remove = (i) => onChange(rows.filter((_, idx) => idx !== i));
  const add = () => onChange([...rows, blankField()]);

  return (
    <>
      {rows.length === 0 && <p className="mb-2 text-[12px] text-vz-dim">None.</p>}
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={row.enabled !== false}
              onChange={(e) => update(i, { enabled: e.target.checked })}
              aria-label={`Include ${row.key || noun}`}
              className="h-3.5 w-3.5 flex-shrink-0 accent-[#a855f7]"
            />
            <Field
              value={row.key}
              onChange={(e) => update(i, { key: e.target.value })}
              placeholder={keyPlaceholder}
              className={`flex-1 ${row.enabled === false ? "opacity-50" : ""}`}
            />
            {withType && row.type === "file" ? (
              <FilePicker
                file={row.file}
                onChange={(file) => update(i, { file })}
                label={`File for ${row.key || noun}`}
              />
            ) : (
              <Field
                value={row.value}
                onChange={(e) => update(i, { value: e.target.value })}
                placeholder={valuePlaceholder}
                className={`flex-1 ${row.enabled === false ? "opacity-50" : ""}`}
              />
            )}
            {withType && (
              <select
                value={row.type || "text"}
                onChange={(e) => update(i, { type: e.target.value })}
                aria-label={`Type of ${row.key || noun}`}
                className="vz-t h-8 flex-shrink-0 cursor-pointer rounded-lg border border-vz-line bg-vz-panel-2 px-1.5 text-[11px] text-vz-soft focus:border-vz-accent/50"
              >
                <option value="text">Text</option>
                <option value="file">File</option>
              </select>
            )}
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label={`Remove ${noun}`}
              className="vz-t flex-shrink-0 rounded-lg p-1.5 text-vz-dim hover:bg-vz-red/10 hover:text-vz-red"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={add}
        className="vz-t mt-3 flex items-center gap-1.5 text-[12px] text-vz-soft hover:text-vz-accent-2"
      >
        <Plus size={13} /> {addLabel}
      </button>
    </>
  );
};

/**
 * The workspace's variables, editable in place. A row is a declared value
 * until it is typed over; then it is an override, with a way back.
 */
const VariableTable = ({ rows, onChange, onReset }) => (
  <div className="space-y-2">
    {rows.map((row) => (
      <div key={row.key} className="flex items-center gap-2">
        <span
          className="vz-mono w-[34%] flex-shrink-0 truncate text-[12px] text-vz-soft"
          title={row.key}
        >
          {row.key}
        </span>
        <Field
          type={row.secret && !row.overridden ? "password" : "text"}
          value={row.value}
          onChange={(e) => onChange?.(row.key, e.target.value)}
          placeholder={row.missing ? "no value — type one" : "empty"}
          aria-label={`Value of ${row.key}`}
          spellCheck={false}
          className={`flex-1 ${row.missing ? "border-vz-warn/40" : row.overridden ? "border-vz-accent/40" : ""}`}
        />
        <span
          className={`w-24 flex-shrink-0 truncate text-[10.5px] ${
            row.missing ? "text-vz-warn" : row.overridden ? "text-vz-accent-2" : "text-vz-dim"
          }`}
          title={row.source}
        >
          {row.source}
        </span>
        <button
          type="button"
          onClick={() => onReset?.(row.key)}
          disabled={!row.overridden}
          aria-label={`Reset ${row.key} to its declared value`}
          title="Back to the declared value"
          className="vz-t flex-shrink-0 rounded-lg p-1.5 text-vz-dim hover:bg-white/6 hover:text-vz-text disabled:invisible"
        >
          <RotateCcw size={12} />
        </button>
      </div>
    ))}
  </div>
);

/** Query rows the document declares, beyond what the URL string carries. */
const seedQuery = (resolvedPath, node) => {
  const rows = parseQuery(resolvedPath.split("?")[1]);
  (node?.params || [])
    .filter((p) => p.in === "query" && !rows.some((row) => row.key === p.name))
    .forEach((p) => {
      // A switched-off Postman parameter and a required OpenAPI one both
      // belong in the list; optional ones stay one click away instead.
      if (p.disabled || p.required) {
        rows.push({
          key: p.name,
          value: p.example != null ? String(p.example) : "",
          enabled: !p.disabled,
        });
      }
    });
  return rows;
};

const ApiPlaygroundModal = ({
  node,
  onClose,
  onUpdate,
  onResponse,
  onNewRequest,
  variables = null,
  overrides = {},
  onVariableChange,
  onVariableReset,
  environmentName = null,
  onOpenEnvironments,
  servers = [],
  origin: originProp = "",
  onOriginChange,
  spec = null,
  onNeedAiKey,
}) => {
  const [method, setMethod] = useState(node?.method || "GET");

  /**
   * The URL as the document writes it — "{{baseUrl}}/v1/customers" — so it
   * is plain where the host comes from. The resolved URL is shown beneath
   * and is what gets sent; the variable itself is edited in the Variables
   * tab, where it changes every request at once.
   */
  const templatePath = String(node?.path || "");

  // The URL box holds the path only; query parameters are edited as rows so
  // they can be toggled without rewriting the string.
  const [baseUrl, setBaseUrl] = useState(() => templatePath.split("?")[0]);
  const [queryRows, setQueryRows] = useState(() => seedQuery(templatePath, node));

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

  // Headers, auth and body keep their {{variables}} as written; they are
  // resolved when the request is built, so changing environment changes
  // what is sent without retyping anything.
  const [headers, setHeaders] = useState(() => seedHeaders(node));
  const [auth, setAuth] = useState(() => seedAuth(node));
  const [bodyState, setBodyState] = useState(() => seedBody(node, spec));
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

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

  const declaredAuth = useMemo(() => describeAuth(node), [node]);

  /** What "Update endpoint" would store: template intact, query rebuilt. */
  const composedUrl = useMemo(
    () => joinQuery(baseUrl, serializeQuery(queryRows)),
    [baseUrl, queryRows],
  );

  /** Everything the request is made of, in one place. */
  const draft = useMemo(
    () => ({ method, url: baseUrl, origin, pathValues, query: queryRows, headers, auth, body: bodyState }),
    [method, baseUrl, origin, pathValues, queryRows, headers, auth, bodyState],
  );

  /** What actually gets requested — variables filled, auth applied, body encoded. */
  const built = useMemo(() => buildRequest(draft, variables), [draft, variables]);
  const effectiveUrl = built.url;

  // A relative URL would be sent to wherever Vizroute is hosted, which
  // returns this page rather than the API. Say so instead. A URL that opens
  // with a variable is a different problem — the variable needs a value.
  const hostFromVariable = startsWithVariable(baseUrl);
  const needsBase = !hostFromVariable && !isAbsolute(baseUrl) && !isAbsolute(effectiveUrl);

  /** Names this request refers to, in the order they are met. */
  const usedVariables = useMemo(() => variablesUsedBy(draft), [draft]);
  const [variableFilter, setVariableFilter] = useState("");
  const [newVariable, setNewVariable] = useState({ key: "", value: "" });

  // A snapshot of what came from the document, to know when it was edited.
  const snapshot = useCallback(
    () =>
      JSON.stringify({
        method,
        url: composedUrl,
        headers: headers.map((h) => [h.key, h.value, h.enabled !== false]),
        auth,
        body: { ...bodyState, file: bodyState.file?.name || null, fields: bodyState.fields.map((f) => ({ ...f, file: f.file?.name || null })) },
      }),
    [method, composedUrl, headers, auth, bodyState],
  );
  const [initialSnapshot] = useState(snapshot);
  const [initialAuth] = useState(auth);
  const hasChanges = Boolean(node) && snapshot() !== initialSnapshot;

  const addAuthFromHint = () => {
    setAuth(seedAuth(node));
    setRequestTab("auth");
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

    const timeout =
      settings.timeoutMs > 0
        ? setTimeout(
            () => controller.abort(new DOMException("Timed out", "TimeoutError")),
            settings.timeoutMs,
          )
        : null;

    try {
      if (!isAbsolute(effectiveUrl)) {
        throw new Error(
          "This URL has no host. Set a base URL above so the request has somewhere to go.",
        );
      }

      const headerObject = {};
      built.headers.forEach((h) => {
        headerObject[h.key] = h.value;
      });
      const options = {
        method: built.method,
        headers: headerObject,
        signal: controller.signal,
        credentials: settings.credentials ? "include" : "same-origin",
      };
      if (built.body !== undefined) options.body = built.body;

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
      if (err.name === "TimeoutError")
        setReqError(`No response after ${settings.timeoutMs / 1000}s. Raise the timeout in Settings if the API is slow.`);
      else if (err.name === "AbortError") setReqError("Request cancelled.");
      else
        setReqError(
          err.message.includes("Failed to fetch")
            ? "Network error — the host may not allow cross-origin requests from the browser."
            : err.message,
        );
    } finally {
      if (timeout) clearTimeout(timeout);
      abortRef.current = null;
      setLoading(false);
    }
  }, [effectiveUrl, built, settings, node, onResponse]);

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
    const authChanged = JSON.stringify(auth) !== JSON.stringify(initialAuth);
    onUpdate(node.id, {
      method,
      path: composedUrl,
      headers: headers
        .filter((h) => h.key.trim() && h.enabled !== false)
        .map((h) => ({ key: h.key, value: h.value })),
      disabledHeaders: headers
        .filter((h) => h.key.trim() && h.enabled === false)
        .map((h) => ({ key: h.key, value: h.value, disabled: true })),
      // Untouched auth keeps what the parser knew, such as where it was inherited from.
      auth: authChanged ? authToNode(auth) : node.auth,
      ...bodyToNode(bodyState),
    });
    setUpdateSaved(true);
    setTimeout(() => setUpdateSaved(false), 2000);
  };

  const setBody = (patch) => setBodyState((b) => ({ ...b, ...patch }));

  const handleFormatBody = () => {
    if (!bodyState.raw.trim()) return;
    try {
      setBody({ raw: JSON.stringify(JSON.parse(bodyState.raw), null, 2) });
    } catch {
      /* leave non-JSON bodies alone */
    }
  };

  const handleCopyCurl = () => {
    navigator.clipboard?.writeText(toCurl(built));
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

  const paramCount = pathVars.length + queryRows.filter((r) => r.enabled !== false).length;
  const headerCount = headers.filter((h) => h.key.trim() && h.enabled !== false).length;
  const bodyLabel = BODY_MODES.find((m) => m.id === bodyState.mode)?.label;
  const authLabel = AUTH_TYPES.find((a) => a.id === auth.type)?.label;
  const bodyAllowed = BODY_METHODS.includes(method);

  const requestTabs = [
    { id: "params", label: "Params", count: paramCount, alert: missingVars.length > 0 },
    { id: "auth", label: "Auth", detail: auth.type !== "none" ? authLabel : null, alert: Boolean(declaredAuth) && auth.type === "none" },
    { id: "headers", label: "Headers", count: headerCount },
    { id: "body", label: "Body", detail: bodyState.mode !== "none" ? bodyLabel : null, alert: bodyState.mode !== "none" && !bodyAllowed },
    { id: "variables", label: "Variables", count: usedVariables.length, alert: built.unresolved.length > 0 },
    { id: "settings", label: "Settings" },
  ];

  const allVariables = useMemo(() => (variables ? [...variables.values()] : []), [variables]);
  const variableRow = (name) => {
    const hit = variables?.get(name);
    return {
      key: name,
      value: hit ? hit.value : "",
      source: hit ? hit.source : "not defined",
      secret: Boolean(hit?.secret),
      overridden: overrides[name] !== undefined,
      missing: !hit,
    };
  };
  const usedRows = usedVariables.map(variableRow);
  const otherRows = allVariables
    .filter((v) => !usedVariables.includes(v.key))
    .map((v) => variableRow(v.key))
    .filter((row) => !variableFilter.trim() || row.key.toLowerCase().includes(variableFilter.trim().toLowerCase()));

  const addVariable = () => {
    const key = newVariable.key.trim();
    if (!key || !onVariableChange) return;
    onVariableChange(key, newVariable.value);
    setNewVariable({ key: "", value: "" });
  };

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
            <p className="truncate text-[12px] text-vz-dim">
              {node ? node.name : "New request — any URL, any method"}
            </p>
          </div>
          {onNewRequest && node && (
            <button
              type="button"
              onClick={onNewRequest}
              title="Start a blank request to test any API"
              className="vz-t flex h-8 items-center gap-1.5 rounded-lg border border-vz-line bg-vz-panel-2 px-2.5 text-[12px] text-vz-soft hover:text-vz-text"
            >
              <FilePlus2 size={13} />
              <span className="hidden sm:inline">New request</span>
            </button>
          )}
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
              autoFocus={!node}
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
          {needsBase && baseUrl.trim() && (
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
                  : node
                    ? "The specification declares no server, so the host has to come from you."
                    : "Type a full URL, or give a base URL here and keep the path above."}
                {" "}It is kept for every request in this workspace, and can be changed later under Variables.
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

          {built.unresolved.length > 0 && (
            <Hint tone="warn">
              {built.unresolved.map((name) => `{{${name}}}`).join(", ")} still{" "}
              {built.unresolved.length === 1 ? "has" : "have"} no value.{" "}
              <button
                type="button"
                onClick={() => setRequestTab("variables")}
                className="vz-t underline decoration-vz-warn/50 underline-offset-2 hover:text-vz-text"
              >
                Set it in Variables
              </button>
              , or pick an environment.
            </Hint>
          )}

          {built.warnings.map((warning) => (
            <Hint key={warning} tone="warn">
              {warning}
            </Hint>
          ))}

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
            <div className="vz-scroll flex flex-shrink-0 items-center gap-1 overflow-x-auto border-b border-vz-line-soft px-2">
              {requestTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setRequestTab(tab.id)}
                  className={`vz-t relative flex-shrink-0 px-3 py-3 text-[12px] ${
                    requestTab === tab.id
                      ? "text-[#e6c4ff] after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-vz-accent-2"
                      : "text-vz-soft hover:text-vz-text"
                  }`}
                >
                  {tab.label}
                  {tab.count > 0 && (
                    <span className="ml-1.5 tabular-nums text-vz-dim">{tab.count}</span>
                  )}
                  {tab.detail && (
                    <span className="ml-1.5 text-[11px] text-vz-dim">{tab.detail}</span>
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
                    <SectionTitle>Path variables</SectionTitle>
                    <div className="space-y-2">
                      {pathVars.map((name) => {
                        const declared = (node?.params || []).find(
                          (p) => p.in === "path" && p.name === name,
                        );
                        return (
                          <div key={name} className="flex items-center gap-2">
                            <span className="vz-mono w-[34%] flex-shrink-0 truncate text-[12px] text-vz-soft">
                              {name}
                              {declared?.type ? (
                                <span className="ml-1.5 text-[11px] text-vz-blue">
                                  {declared.type}
                                </span>
                              ) : null}
                            </span>
                            <Field
                              value={pathValues[name] || ""}
                              onChange={(e) =>
                                setPathValues((v) => ({ ...v, [name]: e.target.value }))
                              }
                              placeholder={declared?.description || "value"}
                              aria-label={`Path variable ${name}`}
                              className="flex-1"
                            />
                          </div>
                        );
                      })}
                    </div>
                    {missingVars.length > 0 && (
                      <Hint tone="warn">
                        {missingVars.join(", ")} {missingVars.length === 1 ? "has" : "have"} no
                        value — the placeholder will be sent as written.
                      </Hint>
                    )}
                  </section>
                )}

                <section>
                  <SectionTitle>Query parameters</SectionTitle>
                  <KeyValueRows
                    rows={queryRows}
                    onChange={setQueryRows}
                    keyPlaceholder="key"
                    valuePlaceholder="value"
                    addLabel="Add parameter"
                    noun="parameter"
                  />
                  {specQuery.some((p) => !queryRows.some((row) => row.key === p.name)) && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="text-[11px] text-vz-dim">From the spec:</span>
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
                  )}
                </section>
              </div>
            )}

            {requestTab === "auth" && (
              <div className="vz-scroll min-h-0 flex-1 overflow-auto p-4">
                {declaredAuth && (
                  <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-vz-accent/20 bg-vz-accent/[0.06] px-3 py-2.5">
                    <Lock size={13} className="flex-shrink-0 text-vz-accent-2" />
                    <span className="text-[12px] text-vz-soft">
                      The spec declares: {declaredAuth.label}
                    </span>
                    {auth.type === "none" && seedAuth(node).type !== "none" && (
                      <button
                        type="button"
                        onClick={addAuthFromHint}
                        className="vz-t ml-auto rounded-md border border-vz-line bg-vz-panel-2 px-2 py-1 text-[11px] text-vz-soft hover:text-vz-text"
                      >
                        Use it
                      </button>
                    )}
                  </div>
                )}

                <SectionTitle>Type</SectionTitle>
                <Segmented
                  options={AUTH_TYPES}
                  value={auth.type}
                  onChange={(type) => setAuth((a) => ({ ...a, type }))}
                  label="Authentication type"
                />

                <div className="mt-4 space-y-2.5">
                  {auth.type === "none" && (
                    <p className="text-[12px] text-vz-dim">
                      Nothing is added. Headers set in the Headers tab are still sent.
                    </p>
                  )}

                  {auth.type === "bearer" && (
                    <label className="block">
                      <span className="mb-1 block text-[11.5px] text-vz-soft">Token</span>
                      <Field
                        value={auth.token}
                        onChange={(e) => setAuth((a) => ({ ...a, token: e.target.value }))}
                        placeholder="{{token}} or the token itself"
                        spellCheck={false}
                        className="w-full"
                      />
                      <Hint>Sent as <span className="vz-mono">Authorization: Bearer …</span></Hint>
                    </label>
                  )}

                  {auth.type === "basic" && (
                    <>
                      <label className="block">
                        <span className="mb-1 block text-[11.5px] text-vz-soft">Username</span>
                        <Field
                          value={auth.username}
                          onChange={(e) => setAuth((a) => ({ ...a, username: e.target.value }))}
                          spellCheck={false}
                          className="w-full"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[11.5px] text-vz-soft">Password</span>
                        <Field
                          type="password"
                          value={auth.password}
                          onChange={(e) => setAuth((a) => ({ ...a, password: e.target.value }))}
                          className="w-full"
                        />
                      </label>
                      <Hint>Sent as <span className="vz-mono">Authorization: Basic</span> with the pair base64-encoded.</Hint>
                    </>
                  )}

                  {auth.type === "apikey" && (
                    <>
                      <label className="block">
                        <span className="mb-1 block text-[11.5px] text-vz-soft">Key name</span>
                        <Field
                          value={auth.key}
                          onChange={(e) => setAuth((a) => ({ ...a, key: e.target.value }))}
                          placeholder="X-API-Key"
                          spellCheck={false}
                          className="w-full"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[11.5px] text-vz-soft">Value</span>
                        <Field
                          value={auth.value}
                          onChange={(e) => setAuth((a) => ({ ...a, value: e.target.value }))}
                          placeholder="{{apiKey}} or the key itself"
                          spellCheck={false}
                          className="w-full"
                        />
                      </label>
                      <div>
                        <span className="mb-1.5 block text-[11.5px] text-vz-soft">Add to</span>
                        <Segmented
                          options={[
                            { id: "header", label: "Header" },
                            { id: "query", label: "Query parameter" },
                          ]}
                          value={auth.addTo}
                          onChange={(addTo) => setAuth((a) => ({ ...a, addTo }))}
                          label="Where the API key goes"
                        />
                      </div>
                      {declaredAuth?.cookie && (
                        <Hint tone="warn">
                          The spec puts this key in a cookie, which a browser will not let a page set. It is sent as a header here.
                        </Hint>
                      )}
                    </>
                  )}

                  {auth.type !== "none" && (
                    <Hint>
                      Values may use <span className="vz-mono">{"{{variables}}"}</span> from the active environment. This replaces any header of the same name in the Headers tab.
                    </Hint>
                  )}
                </div>
              </div>
            )}

            {requestTab === "headers" && (
              <div className="vz-scroll min-h-0 flex-1 overflow-auto p-4">
                <KeyValueRows
                  rows={headers}
                  onChange={setHeaders}
                  keyPlaceholder="Header"
                  valuePlaceholder="Value"
                  addLabel="Add header"
                  noun="header"
                />
                {built.headers.some(
                  (h) => !headers.some((row) => row.enabled !== false && row.key.trim().toLowerCase() === h.key.toLowerCase()),
                ) && (
                  <div className="mt-4">
                    <SectionTitle>Added automatically</SectionTitle>
                    <div className="space-y-1.5">
                      {built.headers
                        .filter(
                          (h) => !headers.some((row) => row.enabled !== false && row.key.trim().toLowerCase() === h.key.toLowerCase()),
                        )
                        .map((h) => (
                          <div key={h.key} className="flex gap-3 text-[12px]">
                            <span className="vz-mono w-[38%] flex-shrink-0 break-all text-vz-soft">{h.key}</span>
                            <span className="vz-mono min-w-0 flex-1 break-all text-vz-dim">{h.value}</span>
                          </div>
                        ))}
                    </div>
                    <Hint>From the Auth tab and the body type. Add a header of the same name to override it.</Hint>
                  </div>
                )}
              </div>
            )}

            {requestTab === "body" && (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex flex-shrink-0 flex-wrap items-center gap-3 border-b border-vz-line-soft px-3 py-2">
                  <Segmented
                    options={BODY_MODES}
                    value={bodyState.mode}
                    onChange={(mode) => setBody({ mode })}
                    label="Body type"
                  />
                  {bodyState.mode === "raw" && (
                    <>
                      <select
                        value={bodyState.language}
                        onChange={(e) => setBody({ language: e.target.value })}
                        aria-label="Raw body format"
                        className="vz-t h-7 cursor-pointer rounded-md border border-vz-line bg-vz-panel-2 px-1.5 text-[11px] text-vz-soft focus:border-vz-accent/50"
                      >
                        {RAW_LANGUAGES.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.label}
                          </option>
                        ))}
                      </select>
                      {bodyState.language === "json" && (
                        <button
                          type="button"
                          onClick={handleFormatBody}
                          disabled={!bodyState.raw.trim()}
                          className="vz-t ml-auto flex items-center gap-1.5 text-[12px] text-vz-soft hover:text-vz-text disabled:opacity-35"
                        >
                          <Braces size={13} /> Format
                        </button>
                      )}
                    </>
                  )}
                </div>

                {bodyState.mode !== "none" && !bodyAllowed && (
                  <div className="px-4 pt-3">
                    <Hint tone="warn">
                      {method} requests are sent without a body. Switch to POST, PUT, PATCH or DELETE to send it.
                    </Hint>
                  </div>
                )}

                {bodyState.mode === "none" && (
                  <div className="flex flex-1 items-center justify-center p-6 text-center text-[12px] text-vz-dim">
                    No body is sent. Pick a type above to add one.
                  </div>
                )}

                {bodyState.mode === "raw" && (
                  <>
                    {bodyState.fromSchema && (
                      <div className="px-4 pt-3">
                        <Hint>
                          The spec has no example for this body, so this is the shape its schema describes. Fill in the values.
                        </Hint>
                      </div>
                    )}
                    <textarea
                      value={bodyState.raw}
                      onChange={(e) => setBody({ raw: e.target.value, fromSchema: false })}
                      placeholder={bodyState.language === "json" ? '{\n  "key": "value"\n}' : "Request body"}
                      spellCheck={false}
                      aria-label="Request body"
                      className="vz-mono vz-scroll min-h-0 flex-1 resize-none bg-transparent p-4 text-[12.5px] text-vz-text placeholder:text-vz-dim focus:outline-none"
                      style={{ lineHeight: "1.7", caretColor: "#a855f7" }}
                    />
                  </>
                )}

                {(bodyState.mode === "formdata" || bodyState.mode === "urlencoded") && (
                  <div className="vz-scroll min-h-0 flex-1 overflow-auto p-4">
                    <KeyValueRows
                      rows={bodyState.fields}
                      onChange={(fields) => setBody({ fields })}
                      keyPlaceholder="field"
                      valuePlaceholder="value"
                      addLabel="Add field"
                      noun="field"
                      withType={bodyState.mode === "formdata"}
                    />
                    <Hint>
                      {bodyState.mode === "formdata"
                        ? "Sent as multipart/form-data; the browser sets the boundary. File fields upload the chosen file."
                        : "Sent as application/x-www-form-urlencoded."}
                    </Hint>
                  </div>
                )}

                {bodyState.mode === "graphql" && (
                  <div className="flex min-h-0 flex-1 flex-col">
                    <textarea
                      value={bodyState.graphql.query}
                      onChange={(e) => setBody({ graphql: { ...bodyState.graphql, query: e.target.value } })}
                      placeholder={"query {\n  viewer { id }\n}"}
                      spellCheck={false}
                      aria-label="GraphQL query"
                      className="vz-mono vz-scroll min-h-0 flex-[3] resize-none bg-transparent p-4 text-[12.5px] text-vz-text placeholder:text-vz-dim focus:outline-none"
                      style={{ lineHeight: "1.7", caretColor: "#a855f7" }}
                    />
                    <div className="flex-shrink-0 border-t border-vz-line-soft px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-vz-dim">
                      Variables
                    </div>
                    <textarea
                      value={bodyState.graphql.variables}
                      onChange={(e) => setBody({ graphql: { ...bodyState.graphql, variables: e.target.value } })}
                      placeholder={'{\n  "id": "…"\n}'}
                      spellCheck={false}
                      aria-label="GraphQL variables"
                      className="vz-mono vz-scroll min-h-0 flex-[2] resize-none bg-transparent px-4 py-2 text-[12.5px] text-vz-text placeholder:text-vz-dim focus:outline-none"
                      style={{ lineHeight: "1.7", caretColor: "#a855f7" }}
                    />
                  </div>
                )}

                {bodyState.mode === "binary" && (
                  <div className="p-4">
                    <SectionTitle>File</SectionTitle>
                    <div className="flex">
                      <FilePicker
                        file={bodyState.file}
                        onChange={(file) => setBody({ file })}
                        label="Binary body file"
                      />
                    </div>
                    <Hint>
                      Sent as the whole request body, with the file's own content type unless a Content-Type header is set.
                    </Hint>
                  </div>
                )}
              </div>
            )}

            {requestTab === "variables" && (
              <div className="vz-scroll min-h-0 flex-1 space-y-5 overflow-auto p-4">
                <section>
                  <SectionTitle>Base URL</SectionTitle>
                  {hostFromVariable ? (
                    <p className="text-[12px] leading-relaxed text-vz-soft">
                      The host comes from{" "}
                      <span className="vz-mono text-vz-text">{`{{${usedVariables[0] || ""}}}`}</span>
                      {built.unresolved.includes(usedVariables[0]) ? (
                        <span className="text-vz-warn">, which has no value yet — give it one below.</span>
                      ) : (
                        <>
                          , so the request goes to{" "}
                          <span className="vz-mono break-all text-vz-text">{effectiveUrl}</span>
                        </>
                      )}
                    </p>
                  ) : isAbsolute(baseUrl) ? (
                    <p className="text-[12px] leading-relaxed text-vz-soft">
                      The URL carries its own host:{" "}
                      <span className="vz-mono break-all text-vz-text">{effectiveUrl}</span>
                    </p>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <Globe size={13} className="flex-shrink-0 text-vz-dim" />
                        <Field
                          value={origin}
                          onChange={(e) => updateOrigin(e.target.value)}
                          placeholder="https://api.example.com"
                          list="pg-known-servers-tab"
                          spellCheck={false}
                          aria-label="Base URL"
                          className="flex-1"
                        />
                        {servers.length > 0 && (
                          <datalist id="pg-known-servers-tab">
                            {servers.map((url) => (
                              <option key={url} value={url} />
                            ))}
                          </datalist>
                        )}
                      </div>
                      <Hint>
                        {servers.length
                          ? `The specification declares ${servers.length === 1 ? "a relative server" : "relative servers"} (${servers.join(", ")}), so the host has to come from you. `
                          : "The specification declares no server, so the host has to come from you. "}
                        {origin ? (
                          <>
                            Requests go to <span className="vz-mono break-all text-vz-soft">{effectiveUrl}</span>.
                          </>
                        ) : (
                          "It is reused for every relative path in this workspace."
                        )}
                      </Hint>
                    </>
                  )}
                </section>

                <section>
                  <SectionTitle>Used by this request</SectionTitle>
                  {usedRows.length === 0 ? (
                    <p className="text-[12px] text-vz-dim">
                      This request has no <span className="vz-mono">{"{{variables}}"}</span>.
                    </p>
                  ) : (
                    <VariableTable rows={usedRows} onChange={onVariableChange} onReset={onVariableReset} />
                  )}
                </section>

                <section>
                  <div className="mb-2 flex items-center gap-2">
                    <SectionTitle>
                      All variables
                      <span className="ml-1.5 normal-case tracking-normal text-vz-dim">
                        {allVariables.length}
                        {environmentName ? ` · environment: ${environmentName}` : ""}
                      </span>
                    </SectionTitle>
                    {allVariables.length > 8 && (
                      <label className="relative ml-auto">
                        <Search size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-vz-dim" />
                        <Field
                          value={variableFilter}
                          onChange={(e) => setVariableFilter(e.target.value)}
                          placeholder="Filter"
                          aria-label="Filter variables"
                          className="h-7 w-36 pl-7"
                        />
                      </label>
                    )}
                  </div>
                  {otherRows.length === 0 ? (
                    <p className="text-[12px] text-vz-dim">
                      {allVariables.length === 0
                        ? "The document declares no variables. Add one below to use it as {{name}} anywhere in the request."
                        : variableFilter
                          ? "Nothing matches."
                          : "Every declared variable is used by this request."}
                    </p>
                  ) : (
                    <VariableTable rows={otherRows} onChange={onVariableChange} onReset={onVariableReset} />
                  )}

                  <div className="mt-3 flex items-center gap-2">
                    <Field
                      value={newVariable.key}
                      onChange={(e) => setNewVariable((v) => ({ ...v, key: e.target.value }))}
                      onKeyDown={(e) => e.key === "Enter" && addVariable()}
                      placeholder="name"
                      aria-label="New variable name"
                      spellCheck={false}
                      className="w-[34%]"
                    />
                    <Field
                      value={newVariable.value}
                      onChange={(e) => setNewVariable((v) => ({ ...v, value: e.target.value }))}
                      onKeyDown={(e) => e.key === "Enter" && addVariable()}
                      placeholder="value"
                      aria-label="New variable value"
                      spellCheck={false}
                      className="flex-1"
                    />
                    <button
                      type="button"
                      onClick={addVariable}
                      disabled={!newVariable.key.trim()}
                      className="vz-t flex h-8 flex-shrink-0 items-center gap-1.5 rounded-lg border border-vz-line bg-vz-panel-2 px-2.5 text-[12px] text-vz-soft hover:text-vz-text disabled:opacity-40"
                    >
                      <Plus size={13} /> Add
                    </button>
                  </div>

                  <Hint>
                    Edits apply to every request in this workspace until the next import.
                    {onOpenEnvironments && (
                      <>
                        {" "}To keep values across sessions, put them in an{" "}
                        <button
                          type="button"
                          onClick={onOpenEnvironments}
                          className="vz-t underline decoration-vz-line underline-offset-2 hover:text-vz-text"
                        >
                          environment
                        </button>
                        .
                      </>
                    )}
                  </Hint>
                </section>
              </div>
            )}

            {requestTab === "settings" && (
              <div className="vz-scroll min-h-0 flex-1 space-y-5 overflow-auto p-4">
                <section>
                  <SectionTitle>Timeout</SectionTitle>
                  <div className="flex items-center gap-2">
                    <Field
                      type="number"
                      min={0}
                      step={1}
                      value={settings.timeoutMs / 1000}
                      onChange={(e) =>
                        setSettings((s) => ({ ...s, timeoutMs: Math.max(0, Number(e.target.value) || 0) * 1000 }))
                      }
                      aria-label="Timeout in seconds"
                      className="w-24"
                    />
                    <span className="text-[12px] text-vz-soft">seconds</span>
                  </div>
                  <Hint>The request is cancelled if no response arrives in time. 0 waits indefinitely.</Hint>
                </section>

                <section>
                  <SectionTitle>Cookies</SectionTitle>
                  <label className="flex items-start gap-2 text-[12px] text-vz-soft">
                    <input
                      type="checkbox"
                      checked={settings.credentials}
                      onChange={(e) => setSettings((s) => ({ ...s, credentials: e.target.checked }))}
                      className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 accent-[#a855f7]"
                    />
                    <span>
                      Send the browser's cookies for the API's domain
                      <span className="mt-0.5 block text-[11.5px] text-vz-dim">
                        Needs the server to answer with <span className="vz-mono">Access-Control-Allow-Credentials: true</span> and an explicit origin.
                      </span>
                    </span>
                  </label>
                </section>

                <section>
                  <SectionTitle>Limits of a browser client</SectionTitle>
                  <ul className="list-disc space-y-1 pl-4 text-[11.5px] leading-relaxed text-vz-dim">
                    <li>The API must allow cross-origin requests, or the request never leaves the browser.</li>
                    <li>Cookie, Host, Origin and a few other headers are set by the browser and cannot be overridden.</li>
                    <li>GET and HEAD requests cannot carry a body.</li>
                  </ul>
                </section>
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
                    method: built.method,
                    url: built.url,
                    headers: built.headers,
                    body: built.bodyText,
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
