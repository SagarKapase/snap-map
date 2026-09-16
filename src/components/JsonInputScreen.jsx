import { useState, useRef, useEffect, useMemo } from "react";
import yaml from "js-yaml";
import { curlToCollection, harToCollection, looksLikeCurl, looksLikeHar } from "../utils/importers";
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
  Trash2,
} from "lucide-react";
import { HTTP_METHODS } from "../utils/constants";
import ImportHero from "./import/ImportHero";
import SupportedFormats from "./import/SupportedFormats";
import SampleSpecifications from "./import/SampleSpecifications";
import "../importscreen.css";

const SOURCES = [
  { id: "editor", icon: Braces, label: "Paste" },
  { id: "upload", icon: Upload, label: "Upload" },
  { id: "url", icon: Globe, label: "Remote URL" },
];

const PUBLIC_EXAMPLES = [
  { label: "Petstore 3.0", url: "https://petstore3.swagger.io/api/v3/openapi.json" },
  { label: "Petstore 2.0", url: "https://petstore.swagger.io/v2/swagger.json" },
];

// What the file picker and the drop zone accept; HAR is JSON underneath.
const FILE_EXTENSIONS = [".json", ".yaml", ".yml", ".har"];

// Beyond this many characters the editor is bypassed entirely.
const EDITOR_LIMIT = 600_000;
// The gutter never renders more numbers than this, however long the file is.
const MAX_GUTTER_LINES = 5_000;

/**
 * The import screen: one editor with three ways in (paste, file, URL), the
 * formats it reads beside it, and the samples and recent imports below.
 * All parsing happens here in the browser; `onVisualize` receives the
 * parsed document.
 */
const JsonInputScreen = ({
  onVisualize,
  onLoadSample,
  onOpenCollections,
  onOpenDiff,
  onOpenAutoImport,
  onOpenBreaking,
  onOpenMultiService,
  recents = [],
  onOpenRecent,
  query = "",
}) => {
  // A 6.4 MB spec is 205,525 lines. Holding that in a controlled textarea
  // means React re-renders the whole value on every keystroke, the gutter
  // mounts one element per line, and the validity memos re-parse megabytes.
  // Past this size the editor is skipped and the parsed spec is held aside.
  const [jsonText, setJsonText] = useState("");
  const [bigSpec, setBigSpec] = useState(null); // { data, name, chars }
  const [error, setError] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [isFormatting, setIsFormatting] = useState(false);
  const [activeTab, setActiveTab] = useState("editor");
  const [urlInput, setUrlInput] = useState("");
  const [urlError, setUrlError] = useState("");
  // Where the current text was fetched from, when it came from a URL. A
  // relative server in the spec is resolved against it.
  const [sourceUrl, setSourceUrl] = useState("");
  const [isFetching, setIsFetching] = useState(false);
  const [loadedFileName, setLoadedFileName] = useState("");
  const [isCopied, setIsCopied] = useState(false);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const lineNumRef = useRef(null);
  const editorRef = useRef(null);
  // Drag events fire for every child crossed; count them so the overlay
  // does not flicker on the way to the drop.
  const dragDepth = useRef(0);

  const tryParse = (text) => {
    // A pasted cURL command is not a document at all, but it is one of the two
    // things developers reach for the clipboard to move, so it is read first.
    if (looksLikeCurl(text)) {
      try {
        return curlToCollection(text);
      } catch {
        return null;
      }
    }
    let value = null;
    try {
      value = JSON.parse(text);
    } catch {
      /* not JSON — fall through to YAML */
    }
    if (value === null) {
      try {
        value = yaml.load(text);
      } catch {
        /* not YAML either */
      }
    }
    // A browser network recording is valid JSON that means something entirely
    // different from a specification.
    if (looksLikeHar(value)) return harToCollection(value).collection;
    return value;
  };

  // Parsed once per change of the text, rather than once per derived value.
  const parsedInput = useMemo(() => {
    if (bigSpec) return bigSpec.data;
    if (!jsonText.trim()) return null;
    const value = tryParse(jsonText);
    return value && typeof value === "object" ? value : null;
  }, [jsonText, bigSpec]);

  const detectedInputFormat = useMemo(() => {
    const p = parsedInput;
    if (!p || typeof p !== "object") return null;
    if (p.openapi) return `OpenAPI ${p.openapi}`;
    if (p.swagger) return `Swagger ${p.swagger}`;
    if (p.info && p.item && Array.isArray(p.item)) return "Postman";
    if (!p.item && Array.isArray(p.requests)) return "Postman v1";
    if (Array.isArray(p)) return "Custom Array";
    return "Custom JSON";
  }, [parsedInput]);

  const quickStats = useMemo(() => {
    const p = parsedInput;
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
  }, [parsedInput]);

  const handleVisualize = () => {
    if (!bigSpec && !jsonText.trim()) {
      setError("Paste or upload an API specification first.");
      return;
    }
    if (parsedInput) {
      setError("");
      onVisualize(parsedInput, { sourceUrl });
    } else {
      setError("Invalid JSON/YAML — cannot parse");
    }
  };

  const clearInput = () => {
    setBigSpec(null);
    setJsonText("");
    setSourceUrl("");
    setLoadedFileName("");
    setError("");
  };

  const handleFormat = () => {
    if (bigSpec || !jsonText.trim()) return;
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

  /**
   * Take a specification that has already parsed. Small documents go into the
   * editor as before; large ones are held as parsed data with a summary card,
   * which is what keeps a multi-megabyte import from locking the tab.
   */
  const acceptText = (text, parsed, name, from = "") => {
    setError("");
    setActiveTab("editor");
    setSourceUrl(from);
    setLoadedFileName(name || "");
    if (text.length > EDITOR_LIMIT) {
      setJsonText("");
      setBigSpec({
        data: parsed,
        name: name || "specification",
        chars: text.length,
      });
    } else {
      setBigSpec(null);
      setJsonText(text);
    }
  };

  const handleFileRead = (file) => {
    if (!file || !FILE_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext))) {
      setError("Upload a .json, .yaml, .yml or .har file");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = String(e.target.result || "");
      const parsed = tryParse(text);
      if (!parsed || typeof parsed !== "object") {
        setError("Invalid file");
        return;
      }
      acceptText(text, parsed, file.name);
    };
    reader.readAsText(file);
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    dragDepth.current += 1;
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    dragDepth.current = 0;
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
      acceptText(
        typeof text === "string" ? text : JSON.stringify(parsed, null, 2),
        parsed,
        urlInput.split("/").pop() || "remote-spec",
        urlInput.trim(),
      );
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
        const parsed = tryParse(text);
        if (parsed && typeof parsed === "object") acceptText(text, parsed, "");
        else {
          setBigSpec(null);
          setJsonText(text);
          setSourceUrl("");
          setError("");
          setLoadedFileName("");
        }
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

  // Ctrl/⌘ Enter builds the map — from the editor, or with nothing focused.
  // Typing in the top-bar search or any other field must not trigger it.
  useEffect(() => {
    const h = (e) => {
      if (!((e.ctrlKey || e.metaKey) && e.key === "Enter")) return;
      const focus = document.activeElement;
      const inEditor = editorRef.current?.contains(focus);
      if (!inEditor && focus && focus !== document.body) return;
      if (bigSpec || jsonText.trim()) {
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

  const lineCount = useMemo(
    () => (jsonText ? jsonText.split("\n").length : 0),
    [jsonText],
  );
  const charCount = bigSpec ? bigSpec.chars : jsonText.length;
  const isValid = Boolean(parsedInput);
  const hasText = Boolean(bigSpec) || Boolean(jsonText.trim());

  // The footer reports what the parser knows right now — parsing is
  // synchronous, so there is no "detecting" state to invent.
  const status = error
    ? { kind: "error", text: error }
    : isFetching
      ? { kind: "busy", text: "Fetching the URL…" }
      : isFormatting
        ? { kind: "busy", text: "Formatting…" }
        : isValid
          ? { kind: "valid", text: "Valid specification" }
          : hasText
            ? { kind: "idle", text: "Not a specification yet — keep typing, or paste a whole document" }
            : { kind: "idle", text: "Ready for input" };

  const tools = [
    { label: "Collections", icon: FolderOpen, run: onOpenCollections },
    { label: "Auto-import from URL", icon: Wifi, run: onOpenAutoImport },
    { label: "API diff", icon: GitCompareArrows, run: onOpenDiff },
    { label: "Breaking changes", icon: ShieldAlert, run: onOpenBreaking },
    { label: "Contract Graph", icon: Network, run: onOpenMultiService },
  ].filter((tool) => Boolean(tool.run));

  return (
    <div className="imp">
      <ImportHero />

      <div className="imp-grid">
        {/* ── Editor ── */}
        <section
          ref={editorRef}
          className={`imp-editor${isDragOver ? " is-dragging" : ""}`}
          aria-label="Specification editor"
          onDragEnter={handleDragEnter}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="imp-toolbar">
            <div className="imp-tabs" role="tablist" aria-label="Specification source">
              {SOURCES.map((source) => (
                <button
                  key={source.id}
                  type="button"
                  role="tab"
                  id={`imp-tab-${source.id}`}
                  aria-selected={activeTab === source.id}
                  aria-controls={`imp-pane-${source.id}`}
                  tabIndex={activeTab === source.id ? 0 : -1}
                  title={source.label}
                  onClick={() => setActiveTab(source.id)}
                  onKeyDown={(e) => {
                    // Arrow keys move between tabs, as a tablist should.
                    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                    e.preventDefault();
                    const i = SOURCES.findIndex((s) => s.id === activeTab);
                    const next = SOURCES[(i + (e.key === "ArrowRight" ? 1 : SOURCES.length - 1)) % SOURCES.length];
                    setActiveTab(next.id);
                    document.getElementById(`imp-tab-${next.id}`)?.focus();
                  }}
                  className="imp-tab"
                >
                  <source.icon size={14} aria-hidden="true" />
                  <span>{source.label}</span>
                </button>
              ))}
            </div>

            <div className="imp-tools">
              <button type="button" className="imp-tool" onClick={handleFormat} disabled={!jsonText.trim()} title="Re-indent as JSON" aria-label="Format">
                <RefreshCw size={13} className={isFormatting ? "animate-spin" : ""} aria-hidden="true" />
                <span>Format</span>
              </button>
              <button type="button" className="imp-tool" onClick={handleCopyContent} disabled={!jsonText.trim()} title="Copy the text" aria-label={isCopied ? "Copied" : "Copy"}>
                {isCopied ? <Check size={13} style={{ color: "var(--success)" }} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
                <span>{isCopied ? "Copied" : "Copy"}</span>
              </button>
              <button type="button" className="imp-tool" onClick={clearInput} disabled={!hasText} title="Clear the editor" aria-label="Clear">
                <Trash2 size={13} aria-hidden="true" />
                <span>Clear</span>
              </button>
              <span className="imp-count vz-mono" aria-label={`${lineCount} lines, ${charCount} characters`}>
                {lineCount}L · {charCount}C
              </span>
            </div>
          </div>

          <div className="imp-body">
            {isDragOver && (
              <div className="imp-drop" aria-live="polite">Drop your specification here</div>
            )}

            {activeTab === "editor" && bigSpec ? (
              <div className="imp-big" id="imp-pane-editor" role="tabpanel" aria-labelledby="imp-tab-editor">
                <div className="imp-big-card">
                  <span className="imp-empty-icon" style={{ margin: "0 auto 14px", borderStyle: "solid" }}>
                    <FileJson size={20} />
                  </span>
                  <p style={{ fontSize: 14, fontWeight: 600 }}>{bigSpec.name}</p>
                  <p className="imp-note" style={{ marginTop: 6 }}>
                    {(bigSpec.chars / 1_048_576).toFixed(1)} MB parsed and ready. The text editor is skipped for files this large — it would have to re-render megabytes on every keystroke.
                  </p>
                  {quickStats && (
                    <div className="imp-stats">
                      {quickStats.map((stat) => (
                        <span key={stat.label} className="imp-stat">
                          <strong>{stat.value.toLocaleString()}</strong> {stat.label}
                        </span>
                      ))}
                    </div>
                  )}
                  <button type="button" onClick={clearInput} className="imp-btn" style={{ marginTop: 16 }}>
                    <X size={12} /> Choose a different file
                  </button>
                </div>
              </div>
            ) : activeTab === "editor" ? (
              <div style={{ display: "flex", height: "100%" }} id="imp-pane-editor" role="tabpanel" aria-labelledby="imp-tab-editor" className={loadedFileName && jsonText.trim() ? "has-chip" : undefined}>
                <div ref={lineNumRef} aria-hidden="true" className="imp-gutter vz-mono">
                  {Array.from({ length: Math.min(Math.max(lineCount, 24), MAX_GUTTER_LINES) }, (_, i) => (
                    <div key={i}>{i + 1}</div>
                  ))}
                </div>

                <div style={{ position: "relative", minWidth: 0, flex: 1 }}>
                  {loadedFileName && jsonText.trim() && (
                    <div className="imp-filechip" title={loadedFileName}>
                      <FileJson size={11} style={{ color: "var(--primary-hover)", flexShrink: 0 }} />
                      <span>{loadedFileName}</span>
                      <button type="button" onClick={() => setLoadedFileName("")} aria-label="Clear file name" className="hm-icon-btn" style={{ width: 18, height: 18 }}>
                        <X size={10} />
                      </button>
                    </div>
                  )}

                  {!jsonText.trim() && !isDragOver && (
                    <div className="imp-empty">
                      <div className="imp-empty-icon"><Braces size={20} /></div>
                      <h3>Paste a specification, or drop a file anywhere here</h3>
                      <p>OpenAPI · Swagger · Postman · HAR · cURL · JSON · YAML</p>
                      <div className="imp-empty-actions">
                        <button type="button" className="imp-btn" onClick={handlePasteClipboard}>
                          <ClipboardPaste size={13} /> Paste from clipboard
                        </button>
                        <button type="button" className="imp-btn" onClick={() => setActiveTab("upload")}>
                          <Upload size={13} /> Upload a file
                        </button>
                        <button type="button" className="imp-btn" onClick={() => setActiveTab("url")}>
                          <Globe size={13} /> Remote URL
                        </button>
                      </div>
                    </div>
                  )}

                  <textarea
                    ref={textareaRef}
                    value={jsonText}
                    onChange={(e) => {
                      setBigSpec(null);
                      setJsonText(e.target.value);
                      setError("");
                      setLoadedFileName("");
                    }}
                    onScroll={handleTextareaScroll}
                    spellCheck={false}
                    aria-label="API specification"
                    className="imp-textarea vz-mono vz-scroll"
                  />
                </div>
              </div>
            ) : null}

            {activeTab === "upload" && (
              <div className="imp-pane" id="imp-pane-upload" role="tabpanel" aria-labelledby="imp-tab-upload">
                <button type="button" onClick={() => fileInputRef.current?.click()} className="imp-upload">
                  <span className="imp-empty-icon"><Upload size={20} /></span>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{isDragOver ? "Release to upload" : "Drop a specification file"}</span>
                  <span style={{ marginTop: 4, fontSize: 12, color: "var(--text-muted)" }}>or click to browse</span>
                  <span className="imp-ext vz-mono">
                    {FILE_EXTENSIONS.map((ext) => <span key={ext}>{ext}</span>)}
                  </span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={FILE_EXTENSIONS.join(",")}
                  className="hidden"
                  aria-label="Specification file"
                  onChange={(e) => { handleFileRead(e.target.files?.[0]); e.target.value = ""; }}
                />
              </div>
            )}

            {activeTab === "url" && (
              <div className="imp-pane vz-scroll" id="imp-pane-url" role="tabpanel" aria-labelledby="imp-tab-url">
                <div className="imp-pane-inner">
                  <label htmlFor="spec-url" className="imp-label">Specification URL</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      id="spec-url"
                      type="url"
                      value={urlInput}
                      onChange={(e) => { setUrlInput(e.target.value); setUrlError(""); }}
                      onKeyDown={(e) => e.key === "Enter" && handleUrlFetch()}
                      placeholder="https://petstore3.swagger.io/api/v3/openapi.json"
                      className={`imp-input vz-mono${urlError ? " is-invalid" : ""}`}
                    />
                    <button type="button" onClick={handleUrlFetch} disabled={isFetching} className="imp-primary" style={{ height: 38, padding: "0 14px" }}>
                      {isFetching ? <RefreshCw size={14} className="animate-spin" aria-hidden="true" /> : <Send size={14} aria-hidden="true" />}
                      {isFetching ? "Fetching" : "Fetch"}
                    </button>
                  </div>

                  {urlError && (
                    <p className="imp-alert" role="alert">
                      <AlertCircle size={13} style={{ marginTop: 1, flexShrink: 0 }} />
                      {urlError}
                    </p>
                  )}

                  <p className="imp-label" style={{ marginTop: 18 }}>Public examples</p>
                  <div className="imp-examples">
                    {PUBLIC_EXAMPLES.map((example) => (
                      <button key={example.url} type="button" onClick={() => setUrlInput(example.url)} className="imp-example">
                        <span>{example.label}</span>
                        <code>{example.url}</code>
                      </button>
                    ))}
                  </div>

                  <p className="imp-note">The request runs from your browser, so the host must send CORS headers. Otherwise download the file and upload it.</p>
                </div>
              </div>
            )}
          </div>

          <div className="imp-footer">
            <span className={`imp-status is-${status.kind}`} role="status" aria-live="polite">
              <span className="imp-dot" aria-hidden="true" />
              {status.text}
            </span>
            {!error && detectedInputFormat && <span className="imp-format">{detectedInputFormat}</span>}
            {!error && quickStats && (
              <span className="imp-quick">
                {quickStats.map((stat) => (
                  <span key={stat.label}><strong>{stat.value}</strong> {stat.label}</span>
                ))}
              </span>
            )}
            <div className="imp-build">
              <span className="imp-keys" aria-hidden="true"><kbd>Ctrl</kbd><kbd>Enter</kbd></span>
              <button type="button" onClick={handleVisualize} disabled={!isValid} className="imp-primary" aria-keyshortcuts="Control+Enter">
                Build map <ArrowRight size={15} aria-hidden="true" />
              </button>
            </div>
          </div>
        </section>

        {/* ── Side panel ── */}
        <aside className="imp-side">
          <SupportedFormats />
          {tools.length > 0 && (
            <section className="imp-panel" aria-labelledby="imp-tools">
              <h3 id="imp-tools">Without a spec loaded</h3>
              <div className="imp-toollist">
                {tools.map((tool) => (
                  <button key={tool.label} type="button" onClick={tool.run}>
                    <tool.icon size={14} aria-hidden="true" />
                    {tool.label}
                  </button>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>

      <SampleSpecifications onLoadSample={onLoadSample} recents={recents} onOpenRecent={onOpenRecent} query={query} />
    </div>
  );
};

export default JsonInputScreen;
