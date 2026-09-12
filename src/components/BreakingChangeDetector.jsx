import { useState, useMemo, useRef } from "react";
import { parseSpecText } from "../utils/readSpec";
import {
  ArrowLeft, AlertTriangle, ShieldAlert, ShieldCheck, Info,
  Upload, X, GitCompareArrows, Download, Copy, Check,
  ChevronDown, Filter, FileText,
} from "lucide-react";
import { HTTP_METHODS } from "../utils/constants";

const tryParse = parseSpecText;

const extractEndpoints = (data) => {
  const eps = [];
  if (!data || typeof data !== "object") return eps;
  if (data.openapi || data.swagger) {
    let base = "";
    if (data.servers?.[0]?.url) base = data.servers[0].url.replace(/\/+$/, "");
    Object.entries(data.paths || {}).forEach(([p, obj]) => {
      if (!obj) return;
      HTTP_METHODS.forEach((m) => {
        const op = obj[m];
        if (!op) return;
        const params = (op.parameters || []).map((pr) => ({ name: pr.name, in: pr.in, required: pr.required, type: pr.schema?.type }));
        let bodyFields = [];
        if (op.requestBody?.content?.["application/json"]?.schema?.properties) {
          bodyFields = Object.entries(op.requestBody.content["application/json"].schema.properties).map(([k, v]) => ({ name: k, type: v.type }));
        }
        let responseFields = [];
        const resp200 = op.responses?.["200"] || op.responses?.["201"];
        if (resp200?.content?.["application/json"]?.schema?.properties) {
          responseFields = Object.entries(resp200.content["application/json"].schema.properties).map(([k, v]) => ({ name: k, type: v.type }));
        }
        eps.push({ method: m.toUpperCase(), path: `${base}${p}`, name: op.summary || op.operationId || `${m.toUpperCase()} ${p}`, description: op.description || "", params, bodyFields, responseFields, tags: op.tags || [], deprecated: !!op.deprecated });
      });
    });
  } else if (data.info && data.item) {
    const walk = (items) => items.forEach((i) => {
      if (i.item) { walk(i.item); return; }
      const req = i.request || i;
      const url = typeof req.url === "string" ? req.url : req.url?.raw || "";
      eps.push({ method: (req.method || "GET").toUpperCase(), path: url, name: i.name || "", description: "", params: [], bodyFields: [], responseFields: [], tags: [], deprecated: false });
    });
    walk(data.item);
  }
  return eps;
};

const SEVERITY = {
  breaking: { icon: ShieldAlert, color: "#f43f5e", bg: "bg-[#f43f5e]/10", border: "border-[#f43f5e]/30", label: "Breaking" },
  warning:  { icon: AlertTriangle, color: "#fbbf24", bg: "bg-amber-500/10", border: "border-amber-500/30", label: "Warning" },
  info:     { icon: Info, color: "#60a5fa", bg: "bg-[#60a5fa]/10", border: "border-[#60a5fa]/30", label: "Info" },
  safe:     { icon: ShieldCheck, color: "#34d399", bg: "bg-emerald-500/10", border: "border-emerald-500/30", label: "Safe" },
};

const detectChanges = (specA, specB) => {
  const epsA = extractEndpoints(specA);
  const epsB = extractEndpoints(specB);
  const keyOf = (e) => `${e.method} ${e.path}`;
  const mapA = new Map(epsA.map((e) => [keyOf(e), e]));
  const mapB = new Map(epsB.map((e) => [keyOf(e), e]));
  const changes = [];

  // Removed endpoints → BREAKING
  mapA.forEach((epA, key) => {
    if (!mapB.has(key)) {
      changes.push({ severity: "breaking", endpoint: key, title: "Endpoint removed", detail: `${epA.name} has been removed entirely`, epA, epB: null });
    }
  });

  // Added endpoints → SAFE
  mapB.forEach((epB, key) => {
    if (!mapA.has(key)) {
      changes.push({ severity: "safe", endpoint: key, title: "New endpoint added", detail: `${epB.name} is a new endpoint`, epA: null, epB });
    }
  });

  // Modified endpoints
  mapB.forEach((epB, key) => {
    const epA = mapA.get(key);
    if (!epA) return;

    // Required params added → BREAKING
    const oldParamNames = new Set(epA.params.map((p) => p.name));
    epB.params.forEach((p) => {
      if (p.required && !oldParamNames.has(p.name)) {
        changes.push({ severity: "breaking", endpoint: key, title: "New required parameter", detail: `Parameter "${p.name}" (${p.in}) is now required`, epA, epB });
      }
    });

    // Params removed → WARNING
    const newParamNames = new Set(epB.params.map((p) => p.name));
    epA.params.forEach((p) => {
      if (!newParamNames.has(p.name)) {
        changes.push({ severity: "warning", endpoint: key, title: "Parameter removed", detail: `Parameter "${p.name}" was removed`, epA, epB });
      }
    });

    // Response fields removed → BREAKING
    const oldRespFields = new Set(epA.responseFields.map((f) => f.name));
    const newRespFields = new Set(epB.responseFields.map((f) => f.name));
    epA.responseFields.forEach((f) => {
      if (!newRespFields.has(f.name)) {
        changes.push({ severity: "breaking", endpoint: key, title: "Response field removed", detail: `Field "${f.name}" removed from response body`, epA, epB });
      }
    });
    epB.responseFields.forEach((f) => {
      if (!oldRespFields.has(f.name)) {
        changes.push({ severity: "info", endpoint: key, title: "Response field added", detail: `New field "${f.name}" in response body`, epA, epB });
      }
    });

    // Type changes → BREAKING
    epB.responseFields.forEach((fB) => {
      const fA = epA.responseFields.find((f) => f.name === fB.name);
      if (fA && fA.type && fB.type && fA.type !== fB.type) {
        changes.push({ severity: "breaking", endpoint: key, title: "Field type changed", detail: `"${fB.name}" changed from ${fA.type} → ${fB.type}`, epA, epB });
      }
    });

    // Deprecated → WARNING
    if (!epA.deprecated && epB.deprecated) {
      changes.push({ severity: "warning", endpoint: key, title: "Endpoint deprecated", detail: `${epB.name} is now marked as deprecated`, epA, epB });
    }

    // Description changed → INFO
    if (epA.description && epB.description && epA.description !== epB.description) {
      changes.push({ severity: "info", endpoint: key, title: "Description updated", detail: `Documentation for ${epB.name} was updated`, epA, epB });
    }
  });

  return changes.sort((a, b) => {
    const order = { breaking: 0, warning: 1, info: 2, safe: 3 };
    return (order[a.severity] ?? 2) - (order[b.severity] ?? 2);
  });
};

const generateReport = (changes, specAName, specBName) => {
  const breaking = changes.filter((c) => c.severity === "breaking");
  const warnings = changes.filter((c) => c.severity === "warning");
  const infos = changes.filter((c) => c.severity === "info");
  const safe = changes.filter((c) => c.severity === "safe");

  let md = `# API Breaking Change Report\n\n`;
  md += `**Base:** ${specAName}  \n**New:** ${specBName}  \n**Generated:** ${new Date().toISOString()}\n\n`;
  md += `## Summary\n\n`;
  md += `| Severity | Count |\n|----------|-------|\n`;
  md += `| 🔴 Breaking | ${breaking.length} |\n`;
  md += `| 🟡 Warning | ${warnings.length} |\n`;
  md += `| 🔵 Info | ${infos.length} |\n`;
  md += `| 🟢 Safe | ${safe.length} |\n\n`;

  if (breaking.length) {
    md += `## 🔴 Breaking Changes\n\n`;
    breaking.forEach((c) => { md += `- **${c.endpoint}** — ${c.title}: ${c.detail}\n`; });
    md += "\n";
  }
  if (warnings.length) {
    md += `## 🟡 Warnings\n\n`;
    warnings.forEach((c) => { md += `- **${c.endpoint}** — ${c.title}: ${c.detail}\n`; });
    md += "\n";
  }
  if (infos.length) {
    md += `## 🔵 Info\n\n`;
    infos.forEach((c) => { md += `- **${c.endpoint}** — ${c.title}: ${c.detail}\n`; });
    md += "\n";
  }
  if (safe.length) {
    md += `## 🟢 New Endpoints\n\n`;
    safe.forEach((c) => { md += `- **${c.endpoint}** — ${c.detail}\n`; });
  }
  return md;
};

const BreakingChangeDetector = ({ onBack }) => {
  const [specAText, setSpecAText] = useState("");
  const [specBText, setSpecBText] = useState("");
  const [error, setError] = useState("");
  const [changes, setChanges] = useState(null);
  const [filterSev, setFilterSev] = useState("all");
  const [copied, setCopied] = useState(false);
  const fileRefA = useRef(null);
  const fileRefB = useRef(null);

  const handleAnalyze = () => {
    setError("");
    const a = tryParse(specAText), b = tryParse(specBText);
    if (!a) { setError("Base spec is invalid"); return; }
    if (!b) { setError("New spec is invalid"); return; }
    setChanges(detectChanges(a, b));
  };

  const filtered = useMemo(() => {
    if (!changes) return [];
    return filterSev === "all" ? changes : changes.filter((c) => c.severity === filterSev);
  }, [changes, filterSev]);

  const summary = useMemo(() => {
    if (!changes) return {};
    return { breaking: changes.filter((c) => c.severity === "breaking").length, warning: changes.filter((c) => c.severity === "warning").length, info: changes.filter((c) => c.severity === "info").length, safe: changes.filter((c) => c.severity === "safe").length };
  }, [changes]);

  const handleExportMd = () => {
    if (!changes) return;
    const md = generateReport(changes, "Base Spec", "New Spec");
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "breaking-change-report.md"; a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyPRComment = () => {
    if (!changes) return;
    const breaking = changes.filter((c) => c.severity === "breaking");
    let comment = `## ⚠️ API Breaking Change Detection\n\n`;
    if (breaking.length === 0) {
      comment += `✅ **No breaking changes detected.** This PR is safe to merge.\n`;
    } else {
      comment += `🔴 **${breaking.length} breaking change(s) found:**\n\n`;
      breaking.forEach((c) => { comment += `- \`${c.endpoint}\` — ${c.title}: ${c.detail}\n`; });
      comment += `\n> ⛔ Review required before merging.\n`;
    }
    comment += `\n---\n*Generated by Vizroute Breaking Change Detector*`;
    navigator.clipboard.writeText(comment);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const loadFile = (setter) => (file) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = (e) => setter(e.target.result);
    r.readAsText(file);
  };

  return (
    <div className="flex-1 overflow-auto" style={{ animation: "fadeIn 0.3s ease-out both", minHeight: "100dvh" }}>
      <div className="fixed inset-0 pointer-events-none mesh-gradient-bg" style={{ zIndex: 0 }} />
      <div className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-4 mb-8">
          <button onClick={onBack} className="p-2 hover:bg-[#121824] rounded-lg text-[#a4acbc] hover:text-white transition-all group">
            <ArrowLeft size={18} className="group-hover:-translate-x-0.5 transition-transform" />
          </button>
          <div>
            <h1 className="text-2xl font-extrabold text-white flex items-center gap-3">
              <ShieldAlert size={24} className="text-[#f43f5e]" /> Breaking Change Detector
            </h1>
            <p className="text-sm text-[#6f7788] mt-1">Analyze two API spec versions for breaking changes with severity classification.</p>
          </div>
        </div>

        {/* Editors */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {[{ label: "Base Spec (Current)", val: specAText, set: setSpecAText, ref: fileRefA }, { label: "New Spec (PR/Updated)", val: specBText, set: setSpecBText, ref: fileRefB }].map(({ label, val, set, ref }) => (
            <div key={label} className="flex flex-col rounded-xl overflow-hidden border border-[#222a39]/20" style={{ background: "rgba(12,14,18,0.7)" }}>
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#222a39]/15" style={{ background: "rgba(255,255,255,0.02)" }}>
                <span className="text-xs font-bold text-[#a4acbc] uppercase tracking-widest">{label}</span>
                <button onClick={() => ref.current?.click()} className="text-[10px] font-bold text-[#6f7788] hover:text-[#a4acbc] uppercase tracking-wider flex items-center gap-1"><Upload size={10} /> File</button>
                <input ref={ref} type="file" accept=".json,.yaml,.yml" className="hidden" onChange={(e) => loadFile(set)(e.target.files?.[0])} />
              </div>
              <textarea value={val} onChange={(e) => set(e.target.value)} placeholder="Paste API spec (JSON/YAML)..." spellCheck={false}
                className="flex-1 bg-transparent resize-none font-mono text-xs text-[#f8f9fe] p-4 focus:outline-none placeholder:text-[#222a39]" style={{ lineHeight: "1.75", caretColor: "#a855f7", minHeight: 180 }} />
            </div>
          ))}
        </div>

        <div className="flex items-center gap-4 mb-8">
          <button onClick={handleAnalyze} disabled={!specAText.trim() || !specBText.trim()}
            className="px-8 py-3 rounded-xl text-sm font-bold uppercase tracking-widest transition-all active:scale-[0.97] disabled:opacity-40 btn-shimmer flex items-center gap-2"
            style={specAText.trim() && specBText.trim() ? { background: "#f43f5e", color: "#080b12", boxShadow: "0 12px 24px -6px rgba(255,110,132,0.3)" } : { background: "rgba(255,255,255,0.03)", color: "#6f7788", border: "1px solid rgba(70,72,76,0.2)" }}>
            <ShieldAlert size={16} /> Detect Breaking Changes
          </button>
          {error && <div className="flex items-center gap-2 text-[#f43f5e] text-sm"><AlertTriangle size={14} /> {error}</div>}
        </div>

        {changes && (
          <div style={{ animation: "slideInUp 0.3s ease-out both" }}>
            {/* Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {(["breaking", "warning", "info", "safe"]).map((key, i) => {
                const s = SEVERITY[key]; const Icon = s.icon;
                return (
                  <button key={key} onClick={() => setFilterSev(filterSev === key ? "all" : key)}
                    className={`p-4 rounded-xl border transition-all text-left ${filterSev === key ? `${s.border} ${s.bg} shadow-lg` : "border-[#222a39]/20 bg-[#0f141d]/40 hover:bg-[#0f141d]/60"}`}
                    style={{ animation: `slideInUp 0.3s ease-out ${i * 60}ms both` }}>
                    <div className="flex items-center gap-2 mb-2"><Icon size={14} style={{ color: s.color }} /><span className="text-[10px] font-bold uppercase tracking-widest text-[#a4acbc]">{s.label}</span></div>
                    <span className="text-2xl font-extrabold" style={{ color: s.color }}>{summary[key] || 0}</span>
                  </button>
                );
              })}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 mb-6">
              <button onClick={handleExportMd} className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold text-[#a4acbc] hover:text-white hover:bg-[#121824] border border-[#222a39]/20 transition-all">
                <Download size={13} /> Export Report (.md)
              </button>
              <button onClick={handleCopyPRComment} className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold text-[#a4acbc] hover:text-white hover:bg-[#121824] border border-[#222a39]/20 transition-all">
                {copied ? <><Check size={13} className="text-[#60a5fa]" /> Copied!</> : <><Copy size={13} /> Copy PR Comment</>}
              </button>
              {filterSev !== "all" && <button onClick={() => setFilterSev("all")} className="text-xs text-[#a855f7] flex items-center gap-1"><X size={10} /> Clear filter</button>}
            </div>

            {/* Changes list */}
            <div className="space-y-2">
              {filtered.map((c, i) => {
                const s = SEVERITY[c.severity]; const Icon = s.icon;
                return (
                  <div key={`${c.endpoint}-${c.title}-${i}`} className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${s.border} ${s.bg}`}
                    style={{ animation: `slideInUp 0.2s ease-out ${i * 15}ms both` }}>
                    <Icon size={16} style={{ color: s.color }} className="flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-mono font-bold text-white">{c.endpoint}</span>
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ color: s.color, background: `${s.color}15` }}>{s.label}</span>
                      </div>
                      <p className="text-sm font-semibold text-[#f8f9fe]">{c.title}</p>
                      <p className="text-xs text-[#6f7788] mt-0.5">{c.detail}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Verdict */}
            <div className={`mt-8 p-6 rounded-2xl border text-center ${summary.breaking > 0 ? "border-[#f43f5e]/30 bg-[#f43f5e]/5" : "border-emerald-500/30 bg-emerald-500/5"}`}>
              {summary.breaking > 0 ? (
                <><ShieldAlert size={32} className="mx-auto mb-2 text-[#f43f5e]" /><p className="text-lg font-bold text-[#f43f5e]">⛔ {summary.breaking} Breaking Change{summary.breaking > 1 ? "s" : ""} Detected</p><p className="text-sm text-[#6f7788] mt-1">Review required before merging this PR.</p></>
              ) : (
                <><ShieldCheck size={32} className="mx-auto mb-2 text-emerald-400" /><p className="text-lg font-bold text-emerald-400">✅ No Breaking Changes</p><p className="text-sm text-[#6f7788] mt-1">This update is safe to merge.</p></>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BreakingChangeDetector;
