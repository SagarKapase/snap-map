import { useState, useRef, useEffect, useMemo } from "react";
import yaml from "js-yaml";
import {
  Upload,
  Globe,
  Send,
  RefreshCw,
  Braces,
  Copy,
  Check,
  AlertCircle,
  FileJson,
  X,
  FolderOpen,
  GitCompareArrows,
  Wifi,
  ShieldAlert,
  Network,
  ClipboardPaste,
  ArrowRight,
} from "lucide-react";
import { SAMPLES_META, HTTP_METHODS } from "../utils/constants";
import { OpenApiIcon, PostmanIcon, JsonIcon } from "./icons/BrandIcons";

const SOURCES = [
  { id: "editor", icon: Braces, label: "Paste", short: "Paste" },
  { id: "upload", icon: Upload, label: "Upload", short: "Upload" },
  { id: "url", icon: Globe, label: "Remote URL", short: "URL" },
];

const PUBLIC_EXAMPLES = [
  { label: "Petstore 3.0", url: "https://petstore3.swagger.io/api/v3/openapi.json" },
  { label: "Petstore 2.0", url: "https://petstore.swagger.io/v2/swagger.json" },
];

const SAMPLE_ICONS = { postman: PostmanIcon, openapi: OpenApiIcon, custom: JsonIcon };

const JsonInputScreen = ({
  onVisualize,
  onLoadSample,
  onOpenCollections,
  onOpenDiff,
  onOpenAutoImport,
  onOpenBreaking,
  onOpenMultiService,
}) => {
  const [jsonText, setJsonText] = useState("");
  const [error, setError] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [isFormatting, setIsFormatting] = useState(false);
  const [activeTab, setActiveTab] = useState("editor");
  const [urlInput, setUrlInput] = useState("");
  const [urlError, setUrlError] = useState("");
  const [isFetching, setIsFetching] = useState(false);
  const [loadedFileName, setLoadedFileName] = useState("");
  const [isCopied, setIsCopied] = useState(false);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const lineNumRef = useRef(null);

  const tryParse = (text) => {
    try {
      return JSON.parse(text);
    } catch {
      /* not JSON — fall through to YAML */
    }
    try {
      return yaml.load(text);
    } catch {
      /* not YAML either */
    }
    return null;
  };
  const validate = (text) => tryParse(text) !== null;

  const detectedInputFormat = useMemo(() => {
    if (!jsonText.trim()) return null;
    const p = tryParse(jsonText);
    if (!p || typeof p !== "object") return null;
    if (p.openapi) return `OpenAPI ${p.openapi}`;
    if (p.swagger) return `Swagger ${p.swagger}`;
    if (p.info && p.item && Array.isArray(p.item)) return "Postman";
    if (Array.isArray(p)) return "Custom Array";
    return "Custom JSON";
  }, [jsonText]);

  const quickStats = useMemo(() => {
    if (!jsonText.trim()) return null;
    const p = tryParse(jsonText);
    if (!p || typeof p !== "object") return null;
    if (p.openapi || p.swagger) {
      let ops = 0;
      const tags = new Set();
      const pathCount = Object.keys(p.paths || {}).length;
      Object.values(p.paths || {}).forEach((po) => {
        HTTP_METHODS.forEach((m) => {
          if (po[m]) {
            ops++;
            (po[m].tags || []).forEach((t) => tags.add(t));
          }
        });
      });
      return [
        { label: "paths", value: pathCount },
        { label: "operations", value: ops },
        ...(tags.size ? [{ label: "tags", value: tags.size }] : []),
      ];
    }
    if (p.info && p.item && Array.isArray(p.item)) {
      let reqs = 0;
      let folders = 0;
      const walk = (items) =>
        items.forEach((i) => {
          if (i.item) {
            folders++;
            walk(i.item);
          } else reqs++;
        });
      walk(p.item);
      return [
        { label: "requests", value: reqs },
        { label: "folders", value: folders },
      ];
    }
    if (Array.isArray(p)) return [{ label: "endpoints", value: p.length }];
    const groups = Object.entries(p).filter(
      ([k, v]) =>
        Array.isArray(v) &&
        !["name", "title", "version", "description", "baseUrl"].includes(k),
    );
    if (groups.length) {
      const total = groups.reduce((a, [, v]) => a + v.length, 0);
      return [
        { label: "endpoints", value: total },
        { label: "groups", value: groups.length },
      ];
    }
    return null;
  }, [jsonText]);

  const handleVisualize = () => {
    if (!jsonText.trim()) {
      setError("Paste or upload an API specification first.");
      return;
    }
    const data = tryParse(jsonText);
    if (data && typeof data === "object") {
      setError("");
      onVisualize(data);
    } else {
      setError("Invalid JSON/YAML — cannot parse");
    }
  };

  const handleFormat = () => {
    if (!jsonText.trim()) return;
    setIsFormatting(true);
    const parsed = tryParse(jsonText);
    if (parsed && typeof parsed === "object") {
      setJsonText(JSON.stringify(parsed, null, 2));
      setError("");
    } else {
      setError("Cannot format — invalid JSON/YAML");
    }
    setTimeout(() => setIsFormatting(false), 400);
  };

  const handleFileRead = (file) => {
    const validExts = [".json", ".yaml", ".yml"];
    if (!file || !validExts.some((ext) => file.name.toLowerCase().endsWith(ext))) {
      setError("Upload a .json, .yaml, or .yml file");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const parsed = tryParse(text);
      if (parsed && typeof parsed === "object") {
        setJsonText(text);
        setLoadedFileName(file.name);
        setError("");
        setActiveTab("editor");
      } else {
        setError("Invalid file");
      }
    };
    reader.readAsText(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFileRead(e.dataTransfer.files?.[0]);
  };

  const handleUrlFetch = async () => {
    if (!urlInput.trim()) {
      setUrlError("Enter a URL to fetch");
      return;
    }
    setIsFetching(true);
    setUrlError("");
    try {
      const res = await fetch(urlInput.trim());
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const text = await res.text();
      const parsed = tryParse(text);
      if (!parsed || typeof parsed !== "object")
        throw new Error("Response is not valid JSON or YAML");
      setJsonText(typeof text === "string" ? text : JSON.stringify(parsed, null, 2));
      setLoadedFileName(urlInput.split("/").pop() || "remote-spec");
      setActiveTab("editor");
      setUrlError("");
    } catch (e) {
      const msg = e.message || "";
      setUrlError(
        msg.includes("fetch") || msg.includes("NetworkError") || msg.includes("Failed")
          ? "CORS blocked — use a public spec or download the file locally"
          : msg,
      );
    } finally {
      setIsFetching(false);
    }
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        setJsonText(text);
        setError("");
        setLoadedFileName("");
      }
    } catch {
      setError("Clipboard access denied — paste manually with Ctrl+V");
    }
  };

  const handleCopyContent = () => {
    if (!jsonText.trim()) return;
    navigator.clipboard.writeText(jsonText);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  useEffect(() => {
    const h = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && jsonText.trim()) {
        e.preventDefault();
        handleVisualize();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const handleTextareaScroll = () => {
    if (lineNumRef.current && textareaRef.current)
      lineNumRef.current.scrollTop = textareaRef.current.scrollTop;
  };

  const lineCount = jsonText.split("\n").length;
  const charCount = jsonText.length;
  const isValid = jsonText.trim() && validate(jsonText);

  const tools = [
    { label: "Collections", icon: FolderOpen, run: onOpenCollections },
    { label: "API diff", icon: GitCompareArrows, run: onOpenDiff },
    { label: "Auto-import", icon: Wifi, run: onOpenAutoImport },
    { label: "Breaking changes", icon: ShieldAlert, run: onOpenBreaking },
    { label: "Multi-service", icon: Network, run: onOpenMultiService },
  ].filter((tool) => Boolean(tool.run));

  return (
    <div className="vz-scroll relative flex-1 overflow-auto bg-vz-bg">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px]"
        style={{
          background:
            "radial-gradient(circle at 50% 0%, rgba(168,85,247,0.07), transparent 60%)",
        }}
      />

      <div className="relative mx-auto w-full max-w-[1080px] px-5 py-10 sm:px-8 lg:py-14">
        <h1 className="text-[clamp(1.6rem,2.4vw,2rem)] font-bold tracking-[-0.02em] text-vz-text">
          Import a specification
        </h1>
        <p className="mt-2 max-w-[620px] text-[14px] leading-[1.65] text-vz-soft">
          Paste it, drop a file, or fetch a URL. Vizroute detects OpenAPI,
          Swagger, Postman collections and plain JSON or YAML, then builds the
          map.
        </p>

        {/* ── Source panel ─────────────────────────── */}
        <div
          className={`vz-t mt-7 overflow-hidden rounded-[14px] border bg-vz-panel ${
            isDragOver ? "border-vz-accent/60 bg-vz-accent/[0.04]" : "border-vz-line"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
        >
          {/* Toolbar */}
          <div className="flex h-[46px] items-center gap-2 border-b border-vz-line-soft px-2.5">
            <div
              className="flex items-center gap-1 rounded-[9px] border border-vz-line-soft bg-vz-bg p-1"
              role="tablist"
              aria-label="Specification source"
            >
              {SOURCES.map((source) => (
                <button
                  key={source.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === source.id}
                  onClick={() => setActiveTab(source.id)}
                  className={`vz-t flex items-center gap-1.5 whitespace-nowrap rounded-[7px] px-2.5 py-[6px] text-[12px] ${
                    activeTab === source.id
                      ? "bg-vz-accent/18 text-vz-text"
                      : "text-vz-soft hover:text-vz-text"
                  }`}
                >
                  <source.icon size={13} aria-hidden="true" />
                  <span className="sm:hidden">{source.short}</span>
                  <span className="hidden sm:inline">{source.label}</span>
                </button>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={handleFormat}
                disabled={!jsonText.trim()}
                className="vz-t flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] text-vz-soft hover:bg-white/5 hover:text-vz-text disabled:opacity-35"
              >
                <RefreshCw size={13} className={isFormatting ? "animate-spin" : ""} />
                <span className="hidden sm:inline">Format</span>
              </button>
              <button
                type="button"
                onClick={handleCopyContent}
                disabled={!jsonText.trim()}
                className="vz-t flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] text-vz-soft hover:bg-white/5 hover:text-vz-text disabled:opacity-35"
              >
                {isCopied ? (
                  <Check size={13} className="text-vz-green" />
                ) : (
                  <Copy size={13} />
                )}
                <span className="hidden sm:inline">{isCopied ? "Copied" : "Copy"}</span>
              </button>
              <span className="vz-mono ml-1 hidden text-[11px] tabular-nums text-vz-dim md:inline">
                {lineCount}L · {charCount}C
              </span>
            </div>
          </div>

          {/* Body */}
          <div className="relative h-[clamp(300px,46vh,460px)]">
            {activeTab === "editor" && (
              <div className="flex h-full">
                <div
                  ref={lineNumRef}
                  aria-hidden="true"
                  className="hidden w-11 flex-shrink-0 select-none overflow-hidden border-r border-vz-line-soft bg-black/20 py-4 sm:block"
                >
                  {Array.from({ length: Math.max(lineCount, 24) }, (_, i) => (
                    <div
                      key={i}
                      className="vz-mono pr-2.5 text-right text-[11px] leading-[1.7] text-vz-line"
                    >
                      {i + 1}
                    </div>
                  ))}
                </div>

                <div className="relative min-w-0 flex-1">
                  {loadedFileName && jsonText.trim() && (
                    <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-lg border border-vz-accent/25 bg-vz-accent/10 px-2 py-1 text-[11px] text-vz-soft">
                      <FileJson size={11} className="text-vz-accent-2" />
                      {loadedFileName}
                      <button
                        type="button"
                        onClick={() => setLoadedFileName("")}
                        aria-label="Clear file name"
                        className="vz-t text-vz-dim hover:text-vz-text"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  )}

                  {!jsonText.trim() && (
                    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center px-6 text-center">
                      <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl border border-vz-line bg-vz-panel-2 text-vz-dim">
                        <Braces size={20} />
                      </div>
                      <p className="text-[13px] font-medium text-vz-soft">
                        Paste a specification, or drop a file anywhere here
                      </p>
                      <p className="mt-1 text-[12px] text-vz-dim">
                        JSON or YAML · OpenAPI, Swagger, Postman, custom
                      </p>
                      <div className="pointer-events-auto mt-5 flex flex-wrap items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={handlePasteClipboard}
                          className="vz-t flex h-9 items-center gap-1.5 rounded-lg border border-vz-line bg-vz-panel-2 px-3 text-[12px] text-vz-soft hover:text-vz-text"
                        >
                          <ClipboardPaste size={13} /> Paste from clipboard
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTab("upload")}
                          className="vz-t flex h-9 items-center gap-1.5 rounded-lg border border-vz-line bg-vz-panel-2 px-3 text-[12px] text-vz-soft hover:text-vz-text"
                        >
                          <Upload size={13} /> Upload a file
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTab("url")}
                          className="vz-t flex h-9 items-center gap-1.5 rounded-lg border border-vz-line bg-vz-panel-2 px-3 text-[12px] text-vz-soft hover:text-vz-text"
                        >
                          <Globe size={13} /> Remote URL
                        </button>
                      </div>
                    </div>
                  )}

                  <textarea
                    ref={textareaRef}
                    value={jsonText}
                    onChange={(e) => {
                      setJsonText(e.target.value);
                      setError("");
                      setLoadedFileName("");
                    }}
                    onScroll={handleTextareaScroll}
                    spellCheck={false}
                    aria-label="API specification"
                    className="vz-mono vz-scroll h-full w-full resize-none bg-transparent px-4 py-4 text-[12.5px] text-vz-text focus:outline-none"
                    style={{ lineHeight: "1.7", caretColor: "#a855f7" }}
                  />
                </div>
              </div>
            )}

            {activeTab === "upload" && (
              <div className="flex h-full items-center justify-center p-6">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={`vz-t flex h-full w-full max-w-[520px] flex-col items-center justify-center rounded-xl border-2 border-dashed ${
                    isDragOver
                      ? "border-vz-accent/60 bg-vz-accent/[0.05]"
                      : "border-vz-line bg-white/[0.015] hover:border-[#2c3548]"
                  }`}
                >
                  <span className="mb-4 grid h-12 w-12 place-items-center rounded-xl border border-vz-line bg-vz-panel-2 text-vz-dim">
                    <Upload size={20} />
                  </span>
                  <span className="text-[13px] font-medium text-vz-soft">
                    {isDragOver ? "Release to upload" : "Drop a specification file"}
                  </span>
                  <span className="mt-1 text-[12px] text-vz-dim">
                    or click to browse
                  </span>
                  <span className="mt-4 flex gap-1.5">
                    {[".json", ".yaml", ".yml"].map((ext) => (
                      <span
                        key={ext}
                        className="vz-mono rounded border border-vz-line bg-vz-panel-2 px-1.5 py-0.5 text-[11px] text-vz-dim"
                      >
                        {ext}
                      </span>
                    ))}
                  </span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,.yaml,.yml"
                  className="hidden"
                  onChange={(e) => handleFileRead(e.target.files?.[0])}
                />
              </div>
            )}

            {activeTab === "url" && (
              <div className="vz-scroll flex h-full items-start justify-center overflow-auto p-6 pt-8">
                <div className="w-full max-w-[560px]">
                  <label
                    htmlFor="spec-url"
                    className="mb-2 block text-[12px] font-medium text-vz-soft"
                  >
                    Specification URL
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="spec-url"
                      type="url"
                      value={urlInput}
                      onChange={(e) => {
                        setUrlInput(e.target.value);
                        setUrlError("");
                      }}
                      onKeyDown={(e) => e.key === "Enter" && handleUrlFetch()}
                      placeholder="https://petstore3.swagger.io/api/v3/openapi.json"
                      className={`vz-mono vz-t h-10 min-w-0 flex-1 rounded-lg border bg-vz-bg px-3 text-[12.5px] text-vz-text placeholder:text-vz-dim focus:border-vz-accent/50 ${
                        urlError ? "border-vz-red/50" : "border-vz-line"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={handleUrlFetch}
                      disabled={isFetching}
                      className="vz-t flex h-10 flex-shrink-0 items-center gap-2 rounded-lg bg-gradient-to-r from-[#a855f7] to-[#c760ff] px-4 text-[13px] font-semibold text-[#160a1d] hover:opacity-90 disabled:opacity-60"
                    >
                      {isFetching ? (
                        <RefreshCw size={14} className="animate-spin" />
                      ) : (
                        <Send size={14} />
                      )}
                      {isFetching ? "Fetching" : "Fetch"}
                    </button>
                  </div>

                  {urlError && (
                    <p className="mt-2.5 flex items-start gap-2 rounded-lg border border-vz-red/20 bg-vz-red/[0.07] px-3 py-2 text-[12px] text-[#fda4af]">
                      <AlertCircle size={13} className="mt-px flex-shrink-0" />
                      {urlError}
                    </p>
                  )}

                  <p className="mt-5 mb-2 text-[11px] font-semibold uppercase tracking-wider text-vz-dim">
                    Public examples
                  </p>
                  <div className="space-y-1.5">
                    {PUBLIC_EXAMPLES.map((example) => (
                      <button
                        key={example.url}
                        type="button"
                        onClick={() => setUrlInput(example.url)}
                        className="vz-t flex w-full items-center justify-between gap-3 rounded-lg border border-vz-line-soft bg-vz-panel-2 px-3 py-2 text-left hover:border-vz-line"
                      >
                        <span className="text-[12px] text-vz-soft">
                          {example.label}
                        </span>
                        <span className="vz-mono truncate text-[11px] text-vz-dim">
                          {example.url}
                        </span>
                      </button>
                    ))}
                  </div>

                  <p className="mt-4 text-[11px] leading-relaxed text-vz-dim">
                    The request runs from your browser, so the host must send
                    CORS headers. Otherwise download the file and upload it.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex min-h-[52px] flex-wrap items-center gap-x-4 gap-y-2 border-t border-vz-line-soft bg-vz-panel-2/60 px-3.5 py-2.5">
            <span className="flex items-center gap-2 text-[12px]">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  error ? "bg-vz-red" : isValid ? "bg-vz-green" : "bg-vz-dim"
                }`}
              />
              <span className={error ? "text-[#fda4af]" : "text-vz-soft"}>
                {error || (isValid ? "Valid specification" : "Waiting for input")}
              </span>
            </span>

            {!error && detectedInputFormat && (
              <span className="text-[12px] font-medium text-vz-accent-2">
                {detectedInputFormat}
              </span>
            )}

            {!error && quickStats && (
              <span className="hidden items-center gap-3 text-[12px] text-vz-dim sm:flex">
                {quickStats.map((stat) => (
                  <span key={stat.label}>
                    <span className="tabular-nums text-vz-soft">{stat.value}</span>{" "}
                    {stat.label}
                  </span>
                ))}
              </span>
            )}

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
              <button
                type="button"
                onClick={handleVisualize}
                disabled={!jsonText.trim()}
                className="vz-t flex h-10 items-center gap-2 rounded-lg bg-gradient-to-r from-[#a855f7] to-[#c760ff] px-5 text-[13px] font-bold text-[#160a1d] hover:opacity-90 disabled:cursor-not-allowed disabled:border disabled:border-vz-line disabled:bg-none disabled:bg-vz-panel-2 disabled:text-vz-dim"
              >
                Build map
                <ArrowRight size={15} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        {/* ── Samples ──────────────────────────────── */}
        <section className="mt-10">
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-vz-dim">
            Start from a sample
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {SAMPLES_META.map(({ key, label, desc }) => {
              const Icon = SAMPLE_ICONS[key] || JsonIcon;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onLoadSample(key)}
                  className="vz-t group flex items-center gap-3 rounded-[12px] border border-vz-line bg-vz-panel p-3.5 text-left hover:border-[#2c3548] hover:bg-vz-panel-2"
                >
                  <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-[10px] border border-vz-line bg-vz-panel-2 text-vz-accent-2">
                    <Icon size={15} aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium text-vz-text">
                      {label}
                    </span>
                    <span className="block truncate text-[12px] text-vz-dim">
                      {desc}
                    </span>
                  </span>
                  <ArrowRight
                    size={14}
                    aria-hidden="true"
                    className="ml-auto flex-shrink-0 text-vz-dim opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                  />
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Other tools ──────────────────────────── */}
        {tools.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-vz-dim">
              Without a spec loaded
            </h2>
            <div className="flex flex-wrap gap-2">
              {tools.map((tool) => (
                <button
                  key={tool.label}
                  type="button"
                  onClick={tool.run}
                  className="vz-t flex h-9 items-center gap-2 rounded-lg border border-vz-line bg-vz-panel px-3 text-[12.5px] text-vz-soft hover:border-[#2c3548] hover:text-vz-text"
                >
                  <tool.icon size={14} aria-hidden="true" className="text-vz-dim" />
                  {tool.label}
                </button>
              ))}
            </div>
          </section>
        )}

        <p className="mt-10 text-[12px] text-vz-dim">
          Specifications are parsed in this browser — there is no backend and
          nothing is uploaded.
        </p>
      </div>
    </div>
  );
};

export default JsonInputScreen;
