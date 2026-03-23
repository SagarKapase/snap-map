import { useState, useRef, useEffect, useMemo } from "react";
import yaml from "js-yaml";
import {
  Upload, Download, ChevronDown, X, Copy, Zap, AlertCircle, CheckCircle,
  Send, Globe, RefreshCw, Braces, Eye, Terminal, ChevronRight, Layers, FileJson,
  FolderOpen, GitCompareArrows, Wifi, ShieldAlert, Network,
} from "lucide-react";
import { GLASS, GLASS_SUBTLE, FEATURES, ACCEPTED_FORMATS, SAMPLES_META, HTTP_METHODS } from "../utils/constants";

const TypewriterText = ({ text, speed = 60, className = "" }) => {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => {
    setDisplayed(""); setDone(false);
    let i = 0;
    const interval = setInterval(() => { i++; setDisplayed(text.slice(0, i)); if (i >= text.length) { clearInterval(interval); setDone(true); } }, speed);
    return () => clearInterval(interval);
  }, [text, speed]);
  return <span className={className}>{displayed}{!done && <span className="typewriter-cursor" />}</span>;
};

const FloatingIcon = ({ children, className, style }) => (
  <div className={`absolute pointer-events-none select-none opacity-[0.03] ${className}`} style={style}>{children}</div>
);

const JsonInputScreen = ({ onVisualize, onLoadSample, onOpenCollections, onOpenDiff, onOpenAutoImport, onOpenBreaking, onOpenMultiService }) => {
  const [jsonText, setJsonText] = useState("");
  const [error, setError] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [isFormatting, setIsFormatting] = useState(false);
  const [showTabSample, setShowTabSample] = useState(false);
  const [showEditorSample, setShowEditorSample] = useState(false);
  const [activeTab, setActiveTab] = useState("editor");
  const [urlInput, setUrlInput] = useState("");
  const [urlError, setUrlError] = useState("");
  const [isFetching, setIsFetching] = useState(false);
  const [loadedFileName, setLoadedFileName] = useState("");
  const [isCopied, setIsCopied] = useState(false);
  const [tiltX, setTiltX] = useState(0);
  const [tiltY, setTiltY] = useState(0);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const lineNumRef = useRef(null);
  const editorCardRef = useRef(null);

  const tryParse = (text) => { try { return JSON.parse(text); } catch {} try { return yaml.load(text); } catch {} return null; };
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
      let ops = 0; const tags = new Set(); const pathCount = Object.keys(p.paths || {}).length;
      Object.values(p.paths || {}).forEach((po) => { HTTP_METHODS.forEach((m) => { if (po[m]) { ops++; (po[m].tags || []).forEach((t) => tags.add(t)); } }); });
      return [{ label: "Paths", value: pathCount }, { label: "Operations", value: ops }, ...(tags.size ? [{ label: "Tags", value: tags.size }] : []), ...(p.info?.version ? [{ label: "Version", value: p.info.version }] : [])];
    }
    if (p.info && p.item && Array.isArray(p.item)) {
      let reqs = 0, folders = 0; const walk = (items) => items.forEach((i) => { if (i.item) { folders++; walk(i.item); } else reqs++; }); walk(p.item);
      return [{ label: "Requests", value: reqs }, { label: "Folders", value: folders }, ...(p.info?.version ? [{ label: "Version", value: p.info.version }] : [])];
    }
    if (Array.isArray(p)) return [{ label: "Endpoints", value: p.length }];
    const groups = Object.entries(p).filter(([k, v]) => Array.isArray(v) && !["name","title","version","description","baseUrl"].includes(k));
    if (groups.length) { const total = groups.reduce((a, [, v]) => a + v.length, 0); return [{ label: "Endpoints", value: total }, { label: "Groups", value: groups.length }]; }
    return null;
  }, [jsonText]);

  const handleVisualize = () => { if (!jsonText.trim()) { setError("Paste or upload an API specification first."); return; } const data = tryParse(jsonText); if (data && typeof data === "object") { setError(""); onVisualize(data); } else { setError("Invalid JSON/YAML — cannot parse"); } };
  const handleFormat = () => { if (!jsonText.trim()) return; setIsFormatting(true); const parsed = tryParse(jsonText); if (parsed && typeof parsed === "object") { setJsonText(JSON.stringify(parsed, null, 2)); setError(""); } else { setError("Cannot format — invalid JSON/YAML"); } setTimeout(() => setIsFormatting(false), 400); };
  const handleFileRead = (file) => { const validExts = [".json", ".yaml", ".yml"]; if (!file || !validExts.some((ext) => file.name.toLowerCase().endsWith(ext))) { setError("Upload a .json, .yaml, or .yml file"); return; } const reader = new FileReader(); reader.onload = (e) => { const text = e.target.result; const parsed = tryParse(text); if (parsed && typeof parsed === "object") { setJsonText(text); setLoadedFileName(file.name); setError(""); setActiveTab("editor"); } else { setError("Invalid file"); } }; reader.readAsText(file); };
  const handleDrop = (e) => { e.preventDefault(); setIsDragOver(false); handleFileRead(e.dataTransfer.files?.[0]); };

  const handleUrlFetch = async () => {
    if (!urlInput.trim()) { setUrlError("Enter a URL to fetch"); return; }
    setIsFetching(true); setUrlError("");
    try { const res = await fetch(urlInput.trim()); if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`); const text = await res.text(); const parsed = tryParse(text); if (!parsed || typeof parsed !== "object") throw new Error("Response is not valid JSON or YAML"); setJsonText(typeof text === "string" ? text : JSON.stringify(parsed, null, 2)); setLoadedFileName(urlInput.split("/").pop() || "remote-spec"); setActiveTab("editor"); setUrlError(""); }
    catch (e) { const msg = e.message || ""; setUrlError(msg.includes("fetch") || msg.includes("NetworkError") || msg.includes("Failed") ? "CORS blocked — use a public spec or download the file locally" : msg); }
    finally { setIsFetching(false); }
  };

  const handlePasteClipboard = async () => { try { const text = await navigator.clipboard.readText(); if (text.trim()) { setJsonText(text); setError(""); setLoadedFileName(""); } } catch { setError("Clipboard access denied — paste manually with Ctrl+V"); } };
  const handleCopyContent = () => { if (!jsonText.trim()) return; navigator.clipboard.writeText(jsonText); setIsCopied(true); setTimeout(() => setIsCopied(false), 2000); };

  useEffect(() => { const h = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && jsonText.trim()) { e.preventDefault(); handleVisualize(); } }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); });
  const handleTextareaScroll = () => { if (lineNumRef.current && textareaRef.current) lineNumRef.current.scrollTop = textareaRef.current.scrollTop; };

  const handleMouseMove = (e) => { if (!editorCardRef.current) return; const rect = editorCardRef.current.getBoundingClientRect(); const x = (e.clientX - rect.left) / rect.width - 0.5; const y = (e.clientY - rect.top) / rect.height - 0.5; setTiltX(y * -4); setTiltY(x * 4); };
  const handleMouseLeave = () => { setTiltX(0); setTiltY(0); };

  const lineCount = jsonText.split("\n").length;
  const charCount = jsonText.length;
  const isValid = jsonText.trim() && validate(jsonText);

  return (
    <div className="flex-1 overflow-auto" style={{ animation: "fadeIn 0.3s ease-out both", minHeight: "100dvh" }}>
      {/* Animated mesh gradient bg — purple + blue */}
      <div className="fixed inset-0 pointer-events-none mesh-gradient-bg" style={{ zIndex: 0 }} />
      {/* Extra ambient blurs from reference */}
      <div className="fixed pointer-events-none" style={{ top: "-10%", left: "-10%", width: "40%", height: "40%", background: "rgba(224,142,254,0.04)", filter: "blur(120px)", borderRadius: "50%", zIndex: 0 }} />
      <div className="fixed pointer-events-none" style={{ top: "60%", left: "70%", width: "30%", height: "30%", background: "rgba(58,162,255,0.04)", filter: "blur(100px)", borderRadius: "50%", zIndex: 0 }} />

      <FloatingIcon className="animate-float-slow" style={{ top: "12%", left: "8%", fontSize: 48 }}><Braces size={48} /></FloatingIcon>
      <FloatingIcon className="animate-float-med" style={{ top: "25%", right: "12%", fontSize: 36 }}><Globe size={36} /></FloatingIcon>
      <FloatingIcon className="animate-float-slow" style={{ bottom: "20%", left: "15%", fontSize: 32 }}><Send size={32} /></FloatingIcon>
      <FloatingIcon className="animate-float-med" style={{ bottom: "30%", right: "8%", fontSize: 40 }}><Layers size={40} /></FloatingIcon>
      <FloatingIcon className="animate-float-slow" style={{ top: "60%", left: "5%", fontSize: 28 }}><Terminal size={28} /></FloatingIcon>

      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8" style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        {/* Mobile hero */}
        <div className="lg:hidden mb-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold text-[#e08efe] uppercase tracking-widest" style={{ background: "rgba(224,142,254,0.08)", border: "1px solid rgba(224,142,254,0.15)" }}>
              <span className="w-1.5 h-1.5 rounded-full bg-[#e08efe] animate-pulse" />Live
            </div>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight text-white mb-2">
            Build API{" "}<span className="text-[#e08efe]"><TypewriterText text="Maps." speed={80} /></span>
          </h1>
          <p className="text-sm text-[#a9abb0] leading-relaxed max-w-lg">Transform any API specification into a navigable visual graph.</p>
          <div className="flex gap-2 mt-4 flex-wrap">
            {FEATURES.map(({ icon: Icon, label }) => (<span key={label} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs text-[#73757a] font-medium" style={GLASS_SUBTLE}><span className="text-[#e08efe]/60"><Icon size={15} /></span>{label}</span>))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-start">
          {/* Left panel (desktop) */}
          <div className="hidden lg:flex lg:col-span-4 flex-col gap-7 lg:sticky lg:top-6" style={{ animation: "slideInLeft 0.5s cubic-bezier(0.22,1,0.36,1) both" }}>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full w-fit" style={{ background: "rgba(224,142,254,0.08)", border: "1px solid rgba(224,142,254,0.15)" }}>
              <span className="w-1.5 h-1.5 rounded-full bg-[#e08efe] animate-pulse" />
              <span className="text-xs font-bold text-[#e08efe] uppercase tracking-widest">System Active</span>
            </div>

            <div className="space-y-3">
              <h1 className="text-5xl font-extrabold tracking-tight leading-[1.1] text-white">
                Build API<br /><span className="text-[#e08efe]"><TypewriterText text="Maps." speed={80} /></span>
              </h1>
              <p className="text-sm text-[#a9abb0] leading-relaxed font-light">Transform any API specification into a navigable visual graph. Paste, upload, or fetch a remote spec.</p>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {FEATURES.map(({ icon: Icon, label, sub }, i) => (
                <div key={label} className="p-3.5 rounded-2xl space-y-2 cursor-default group transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-[#e08efe]/5"
                  style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(70,72,76,0.15)", animation: `slideInUp 0.4s cubic-bezier(0.22,1,0.36,1) ${200 + i * 80}ms both` }}>
                  <span className="text-[#e08efe] group-hover:text-[#ce7eec] transition-colors"><Icon size={15} /></span>
                  <p className="text-xs font-bold text-[#a9abb0] uppercase tracking-widest">{label}</p>
                  <p className="text-xs text-[#73757a]">{sub}</p>
                </div>
              ))}
            </div>

            <button onClick={handleVisualize} disabled={!jsonText.trim()}
              className={`w-full group flex items-center justify-center gap-2.5 py-3.5 rounded-2xl font-bold text-sm tracking-wide uppercase transition-all duration-200 active:scale-[0.97] ${jsonText.trim() ? "text-[#0c0e12] hover:opacity-90 btn-shimmer" : "text-[#73757a] cursor-not-allowed"}`}
              style={jsonText.trim() ? { background: "#e08efe", boxShadow: "0 16px 32px -8px rgba(224,142,254,0.35)" } : { background: "rgba(255,255,255,0.02)", border: "1px solid rgba(70,72,76,0.15)" }}>
              <Eye size={15} className={jsonText.trim() ? "" : "opacity-30"} /> Initialize Visualization
              {jsonText.trim() && <ChevronRight size={14} className="opacity-60 group-hover:translate-x-0.5 transition-transform" />}
            </button>

            <div className="space-y-2.5">
              <p className="text-xs font-bold text-[#46484c] uppercase tracking-widest">Accepts</p>
              {ACCEPTED_FORMATS.map(({ name, icon: Icon }) => (<div key={name} className="flex items-center gap-2.5"><span className="text-[#73757a]"><Icon size={12} /></span><span className="text-xs text-[#a9abb0]">{name}</span></div>))}
            </div>
          </div>

          {/* Right: Glass editor */}
          <div className="col-span-1 lg:col-span-8" style={{ animation: "slideInRight 0.5s cubic-bezier(0.22,1,0.36,1) both" }} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
            <div ref={editorCardRef} className="rounded-2xl sm:rounded-3xl overflow-hidden flex flex-col"
              style={{ ...GLASS, height: "clamp(420px, 60vh, 600px)", transform: `perspective(1000px) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`, transition: "transform 0.15s ease-out" }}>

              {/* Tab bar */}
              <div className="flex items-center justify-between px-4 sm:px-6 py-3 flex-shrink-0" style={{ borderBottom: "1px solid rgba(70,72,76,0.15)", background: "rgba(255,255,255,0.02)" }}>
                <div className="flex items-center gap-1 sm:gap-5">
                  {[{ id: "editor", icon: Terminal, label: "Editor" }, { id: "upload", icon: Upload, label: "Upload" }, { id: "url", icon: Globe, label: "Remote URL" }].map(({ id, icon: Icon, label }) => (
                    <button key={id} onClick={() => setActiveTab(id)}
                      className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider px-2 sm:px-0 py-2 transition-all duration-200 border-b-2 ${activeTab === id ? "text-[#e08efe] border-[#e08efe]" : "text-[#73757a] border-transparent hover:text-[#a9abb0] hover:border-[#46484c]"}`}>
                      <Icon size={13} /><span className="hidden sm:inline">{label}</span>
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="relative">
                    <button onClick={() => { setShowTabSample((v) => !v); setShowEditorSample(false); }} className="flex items-center gap-1 text-xs font-bold text-[#73757a] hover:text-[#a9abb0] uppercase tracking-wider transition-colors">
                      <Download size={12} /><span className="hidden sm:inline">Sample</span><ChevronDown size={10} className={`transition-transform duration-200 ${showTabSample ? "rotate-180" : ""}`} />
                    </button>
                    {showTabSample && (
                      <div className="absolute right-0 top-full mt-2 w-52 rounded-xl overflow-hidden z-50" style={{ ...GLASS, animation: "scaleIn 0.12s ease-out both" }}>
                        {SAMPLES_META.map(({ key, label, desc }) => (<button key={key} onClick={() => { onLoadSample(key); setShowTabSample(false); }} className="w-full px-4 py-2.5 text-left flex items-center justify-between hover:bg-white/5 transition-colors"><span className="text-xs font-medium text-[#f8f9fe]">{label}</span><span className="text-xs text-[#73757a]">{desc}</span></button>))}
                      </div>
                    )}
                  </div>
                  <div className="w-px h-3.5" style={{ background: "rgba(70,72,76,0.2)" }} />
                  <button onClick={handleFormat} disabled={!jsonText.trim()} className="flex items-center gap-1 text-xs font-bold text-[#73757a] hover:text-[#a9abb0] disabled:opacity-30 uppercase tracking-wider transition-colors">
                    <RefreshCw size={12} className={isFormatting ? "animate-spin" : ""} /><span className="hidden sm:inline">Format</span>
                  </button>
                  <div className="w-px h-3.5" style={{ background: "rgba(70,72,76,0.2)" }} />
                  <button onClick={handleCopyContent} disabled={!jsonText.trim()} className="flex items-center gap-1 text-xs font-bold disabled:opacity-30 uppercase tracking-wider transition-colors" style={{ color: isCopied ? "#e08efe" : undefined }}>
                    {isCopied ? <CheckCircle size={12} /> : <Copy size={12} />}
                    <span className="hidden sm:inline" style={{ color: isCopied ? "#e08efe" : "#73757a" }}>{isCopied ? "Copied" : "Copy"}</span>
                  </button>
                  <div className="w-px h-3.5 hidden sm:block" style={{ background: "rgba(70,72,76,0.2)" }} />
                  <span className="hidden sm:inline text-xs font-mono text-[#46484c]">{lineCount}L · {charCount}C</span>
                </div>
              </div>

              {/* Editor body */}
              <div className="flex-1 flex overflow-hidden">
                {activeTab === "editor" && (
                  <>
                    <div ref={lineNumRef} className="hidden sm:flex flex-shrink-0 w-12 overflow-hidden select-none py-5 flex-col" style={{ background: "rgba(0,0,0,0.25)", borderRight: "1px solid rgba(70,72,76,0.1)" }}>
                      {Array.from({ length: Math.max(lineCount, 22) }, (_, i) => (<div key={i} className="text-right pr-3 text-xs font-mono leading-[1.75]" style={{ color: "rgba(255,255,255,0.08)" }}>{i + 1}</div>))}
                    </div>
                    <div className="flex-1 relative min-w-0">
                      {!jsonText.trim() && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 sm:px-12 pointer-events-none z-10" style={{ animation: "fadeIn 0.35s ease-out both" }}>
                          <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4 animate-float" style={{ background: "rgba(224,142,254,0.06)" }}>
                            <Braces size={24} style={{ color: "rgba(224,142,254,0.35)" }} />
                          </div>
                          <h3 className="text-sm font-bold text-[#a9abb0] mb-1.5 tracking-wide">Input Specification</h3>
                          <p className="text-xs text-[#73757a] max-w-xs leading-relaxed">Paste OpenAPI, Swagger, Postman or custom JSON/YAML — or use a sample below.</p>
                          <div className="mt-6 flex flex-wrap items-center justify-center gap-2 pointer-events-auto">
                            <div className="relative">
                              <button onClick={() => { setShowEditorSample((v) => !v); setShowTabSample(false); }} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-white/10 transition-colors" style={GLASS_SUBTLE}>
                                <Download size={11} /> Sample <ChevronDown size={10} className={`transition-transform duration-200 ${showEditorSample ? "rotate-180" : ""}`} />
                              </button>
                              {showEditorSample && (
                                <div className="absolute left-0 top-full mt-1.5 w-48 rounded-xl overflow-hidden z-50" style={{ ...GLASS, animation: "scaleIn 0.12s ease-out both" }}>
                                  {SAMPLES_META.map(({ key, label }) => (<button key={key} onClick={() => { onLoadSample(key); setShowEditorSample(false); }} className="w-full px-4 py-2.5 text-left text-xs font-medium text-[#f8f9fe] hover:bg-white/5 transition-colors">{label}</button>))}
                                </div>
                              )}
                            </div>
                            <button onClick={handlePasteClipboard} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-white/10 transition-colors" style={GLASS_SUBTLE}><Copy size={11} /> Paste</button>
                            <button onClick={() => setActiveTab("upload")} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-white/10 transition-colors" style={GLASS_SUBTLE}><Upload size={11} /> Upload File</button>
                            <button onClick={() => setActiveTab("url")} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-white/10 transition-colors" style={GLASS_SUBTLE}><Globe size={11} /> Remote URL</button>
                          </div>
                        </div>
                      )}
                      {loadedFileName && jsonText.trim() && (
                        <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-[#a9abb0]" style={{ background: "rgba(224,142,254,0.08)", border: "1px solid rgba(224,142,254,0.15)" }}>
                          <FileJson size={10} className="text-[#e08efe]" />{loadedFileName}
                          <button onClick={() => setLoadedFileName("")} className="text-[#73757a] hover:text-[#a9abb0] transition-colors ml-0.5"><X size={9} /></button>
                        </div>
                      )}
                      <textarea ref={textareaRef} value={jsonText} onChange={(e) => { setJsonText(e.target.value); setError(""); setLoadedFileName(""); }} onScroll={handleTextareaScroll} placeholder="" spellCheck={false}
                        className="w-full h-full bg-transparent resize-none font-mono text-sm text-[#f8f9fe] p-5 sm:p-7 focus:outline-none" style={{ lineHeight: "1.75", caretColor: "#e08efe" }} />
                    </div>
                  </>
                )}

                {activeTab === "upload" && (
                  <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10" onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }} onDragLeave={() => setIsDragOver(false)} onDrop={handleDrop}>
                    <div className="w-full max-w-md flex flex-col items-center justify-center rounded-2xl py-12 sm:py-16 cursor-pointer transition-all duration-300"
                      style={{ border: isDragOver ? "2px dashed rgba(224,142,254,0.6)" : "2px dashed rgba(70,72,76,0.25)", background: isDragOver ? "rgba(224,142,254,0.05)" : "rgba(255,255,255,0.01)", transform: isDragOver ? "scale(1.01)" : "scale(1)" }}
                      onClick={() => fileInputRef.current?.click()}>
                      <div className="p-4 rounded-2xl mb-4 transition-colors" style={{ background: isDragOver ? "rgba(224,142,254,0.12)" : "rgba(255,255,255,0.03)" }}>
                        <Upload size={28} style={{ color: isDragOver ? "#e08efe" : "rgba(255,255,255,0.15)" }} />
                      </div>
                      <p className="text-sm font-semibold text-[#a9abb0] mb-1">{isDragOver ? "Release to upload" : "Drop your file here"}</p>
                      <p className="text-xs text-[#73757a] mb-4">or click to browse</p>
                      <div className="flex gap-2">{[".json", ".yaml", ".yml"].map((ext) => (<span key={ext} className="px-2.5 py-1 rounded-lg text-xs font-mono text-[#73757a] font-bold" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(70,72,76,0.15)" }}>{ext}</span>))}</div>
                    </div>
                    <input ref={fileInputRef} type="file" accept=".json,.yaml,.yml" className="hidden" onChange={(e) => handleFileRead(e.target.files?.[0])} />
                  </div>
                )}

                {activeTab === "url" && (
                  <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12">
                    <div className="w-full max-w-lg space-y-5">
                      <div className="text-center">
                        <Globe size={28} className="mx-auto mb-3" style={{ color: "rgba(224,142,254,0.4)" }} />
                        <h3 className="text-sm font-bold text-[#a9abb0] mb-1 tracking-wide uppercase">Fetch Remote Spec</h3>
                        <p className="text-xs text-[#73757a]">Fetch an OpenAPI or Swagger spec from a public URL</p>
                      </div>
                      <div className="flex gap-2">
                        <input type="url" value={urlInput} onChange={(e) => { setUrlInput(e.target.value); setUrlError(""); }} onKeyDown={(e) => e.key === "Enter" && handleUrlFetch()} placeholder="https://petstore3.swagger.io/api/v3/openapi.json"
                          className="flex-1 min-w-0 text-sm font-mono text-[#f8f9fe] px-4 py-2.5 rounded-xl focus:outline-none transition-all duration-200"
                          style={{ background: "rgba(255,255,255,0.03)", border: urlError ? "1px solid rgba(255,110,132,0.4)" : "1px solid rgba(70,72,76,0.2)", caretColor: "#e08efe" }} />
                        <button onClick={handleUrlFetch} disabled={isFetching}
                          className="flex-shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider text-[#0c0e12] transition-all duration-200 active:scale-[0.97] disabled:opacity-60 btn-shimmer"
                          style={{ background: "#e08efe", boxShadow: "0 8px 20px -4px rgba(224,142,254,0.35)" }}>
                          {isFetching ? <RefreshCw size={13} className="animate-spin" /> : <Send size={13} />}{isFetching ? "Fetching..." : "Fetch"}
                        </button>
                      </div>
                      {urlError && (<div className="flex items-start gap-2 px-3.5 py-2.5 rounded-xl" style={{ background: "rgba(255,110,132,0.06)", border: "1px solid rgba(255,110,132,0.12)" }}><AlertCircle size={13} className="text-[#ff6e84] flex-shrink-0 mt-0.5" /><p className="text-xs text-[#ff6e84]">{urlError}</p></div>)}
                      <div className="space-y-2">
                        <p className="text-xs font-bold text-[#46484c] uppercase tracking-widest">Public Examples</p>
                        {[{ label: "Petstore 3.0", url: "https://petstore3.swagger.io/api/v3/openapi.json" }, { label: "Petstore 2.0", url: "https://petstore.swagger.io/v2/swagger.json" }].map(({ label, url }) => (
                          <button key={url} onClick={() => setUrlInput(url)} className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-left hover:bg-white/5 transition-colors group" style={{ background: "rgba(255,255,255,0.015)", border: "1px solid rgba(70,72,76,0.1)" }}>
                            <span className="text-xs font-medium text-[#a9abb0] group-hover:text-[#f8f9fe] transition-colors">{label}</span>
                            <span className="text-xs font-mono text-[#46484c] truncate max-w-[220px] group-hover:text-[#73757a] transition-colors">{url}</span>
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-[#46484c] text-center leading-relaxed">Only CORS-enabled endpoints are supported. Use <span className="text-[#73757a] font-mono">File Upload</span> for local files.</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Quick stats bar */}
              {isValid && quickStats && (
                <div className="flex-shrink-0 flex items-center gap-4 px-5 py-2 overflow-x-auto" style={{ borderTop: "1px solid rgba(70,72,76,0.1)", background: "rgba(224,142,254,0.03)", animation: "slideInUp 0.25s ease-out both" }}>
                  <span className="text-xs font-bold text-[#e08efe]/70 uppercase tracking-widest flex-shrink-0">Schema</span>
                  {quickStats.map(({ label, value }) => (<div key={label} className="flex items-center gap-1.5 flex-shrink-0"><span className="text-xs font-bold text-white/80">{value}</span><span className="text-xs text-[#73757a] uppercase tracking-wider">{label}</span></div>))}
                  <div className="ml-auto flex-shrink-0"><CheckCircle size={12} className="text-[#81ecff]" /></div>
                </div>
              )}

              {/* Status bar */}
              <div className="flex-shrink-0 flex items-center justify-between px-4 sm:px-6 py-2.5 gap-3" style={{ borderTop: "1px solid rgba(70,72,76,0.12)", background: "rgba(0,0,0,0.3)" }}>
                <div className="flex items-center gap-3 sm:gap-5 min-w-0 overflow-hidden">
                  <div className="flex items-center gap-1.5 flex-shrink-0"><span className="w-1.5 h-1.5 rounded-full bg-[#81ecff]" /><span className="text-xs font-bold text-[#73757a] uppercase tracking-widest hidden sm:inline">Ready</span></div>
                  {detectedInputFormat && (<span className="text-xs font-bold text-[#e08efe]/80 uppercase tracking-widest flex-shrink-0" style={{ animation: "fadeIn 0.2s ease-out both" }}>{detectedInputFormat}</span>)}
                  {error && (<div className="flex items-center gap-1 min-w-0"><AlertCircle size={10} className="text-[#ff6e84]/70 flex-shrink-0" /><span className="text-xs text-[#ff6e84]/70 truncate">{error}</span></div>)}
                </div>
                <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                  <div className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(70,72,76,0.15)" }}>
                    <span className="text-xs font-mono text-[#73757a] px-1 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.05)" }}>Ctrl</span>
                    <span className="text-xs font-mono text-[#73757a] px-1 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.05)" }}>Enter</span>
                  </div>
                  <button onClick={handleVisualize} disabled={!jsonText.trim()}
                    className={`px-4 sm:px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all duration-200 active:scale-[0.97] ${jsonText.trim() ? "text-[#0c0e12] hover:opacity-90 btn-shimmer" : "text-[#46484c] cursor-not-allowed"}`}
                    style={jsonText.trim() ? { background: "#e08efe", boxShadow: "0 6px 16px -4px rgba(224,142,254,0.4)" } : { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(70,72,76,0.15)" }}>
                    Build Map
                  </button>
                </div>
              </div>
            </div>

            {/* Quick action buttons */}
            <div className="mt-5 flex items-center justify-center gap-3">
              {onOpenCollections && (
                <button onClick={onOpenCollections}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 hover:bg-[#22262b] border border-[#46484c]/20 text-[#a9abb0] hover:text-white hover:border-[#46484c]/40">
                  <FolderOpen size={14} className="text-[#e08efe]" /> My Collections
                </button>
              )}
              {onOpenDiff && (
                <button onClick={onOpenDiff}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 hover:bg-[#22262b] border border-[#46484c]/20 text-[#a9abb0] hover:text-white hover:border-[#46484c]/40">
                  <GitCompareArrows size={14} className="text-[#81ecff]" /> API Diff
                </button>
              )}
              {onOpenAutoImport && (
                <button onClick={onOpenAutoImport}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 hover:bg-[#22262b] border border-[#46484c]/20 text-[#a9abb0] hover:text-white hover:border-[#46484c]/40">
                  <Wifi size={14} className="text-[#3aa2ff]" /> Auto-Import
                </button>
              )}
              {onOpenBreaking && (
                <button onClick={onOpenBreaking}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 hover:bg-[#22262b] border border-[#46484c]/20 text-[#a9abb0] hover:text-white hover:border-[#46484c]/40">
                  <ShieldAlert size={14} className="text-[#ff6e84]" /> Breaking Changes
                </button>
              )}
              {onOpenMultiService && (
                <button onClick={onOpenMultiService}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 hover:bg-[#22262b] border border-[#46484c]/20 text-[#a9abb0] hover:text-white hover:border-[#46484c]/40">
                  <Network size={14} className="text-[#e08efe]" /> Multi-Service
                </button>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-2">
              {[{ icon: CheckCircle, label: "Local Only · No Data Sent" }, { icon: Zap, label: "Instant Render" }, { icon: Layers, label: "JSON · YAML · Postman" }].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-1.5 text-xs font-bold text-[#46484c] uppercase tracking-widest"><Icon size={12} />{label}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default JsonInputScreen;
