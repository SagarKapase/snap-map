import { useState, useMemo, useRef } from "react";
import { parseSpecText } from "../utils/readSpec";
import {
  ArrowLeft, Plus, Minus, RefreshCw, AlertCircle, ChevronDown,
  FileJson, Upload, Braces, GitCompareArrows, Check, X, Filter,
} from "lucide-react";
import { computeDiff } from "../utils/diff";
import { GLASS } from "../utils/constants";

const METHOD_BADGE = {
  GET: "bg-emerald-600/20 text-emerald-400",
  POST: "bg-amber-600/20 text-amber-400",
  PUT: "bg-blue-600/20 text-blue-400",
  PATCH: "bg-purple-600/20 text-purple-400",
  DELETE: "bg-red-600/20 text-red-400",
  HEAD: "bg-gray-600/20 text-gray-400",
  OPTIONS: "bg-gray-600/20 text-gray-400",
};

const CHANGE_META = {
  added:     { label: "Added",     color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", icon: Plus, dot: "bg-emerald-500" },
  removed:   { label: "Removed",   color: "text-[#f43f5e]",   bg: "bg-[#f43f5e]/10",   border: "border-[#f43f5e]/30",   icon: Minus, dot: "bg-[#f43f5e]" },
  modified:  { label: "Modified",  color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/30",   icon: RefreshCw, dot: "bg-amber-500" },
  unchanged: { label: "Unchanged", color: "text-[#6f7788]",   bg: "bg-[#121824]/50",   border: "border-[#222a39]/20",   icon: Check, dot: "bg-[#222a39]" },
};

const tryParse = parseSpecText;

const SpecEditor = ({ label, value, onChange, placeholder }) => {
  const fileRef = useRef(null);
  const handleFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => onChange(e.target.result);
    reader.readAsText(file);
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 rounded-xl overflow-hidden border border-[#222a39]/20" style={{ background: "rgba(12,14,18,0.7)" }}>
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#222a39]/15" style={{ background: "rgba(255,255,255,0.02)" }}>
        <span className="text-xs font-bold text-[#a4acbc] uppercase tracking-widest">{label}</span>
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1 text-[10px] font-bold text-[#6f7788] hover:text-[#a4acbc] uppercase tracking-wider transition-colors"
        >
          <Upload size={10} /> File
        </button>
        <input ref={fileRef} type="file" accept=".json,.yaml,.yml" className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])} />
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        className="flex-1 bg-transparent resize-none font-mono text-xs text-[#f8f9fe] p-4 focus:outline-none placeholder:text-[#222a39]"
        style={{ lineHeight: "1.75", caretColor: "#a855f7", minHeight: 200 }}
      />
    </div>
  );
};

const EndpointRow = ({ ep, type }) => {
  const meta = CHANGE_META[type];
  const Icon = meta.icon;
  const badge = METHOD_BADGE[ep.method] || METHOD_BADGE.GET;

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${meta.border} ${meta.bg} transition-all duration-200 hover:brightness-110`}
      style={{ animation: "slideInUp 0.25s ease-out both" }}
    >
      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${meta.bg}`}>
        <Icon size={12} className={meta.color} />
      </div>
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase flex-shrink-0 ${badge}`}>
        {ep.method}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{ep.name}</p>
        <p className="text-xs text-[#6f7788] font-mono truncate mt-0.5">{ep.path}</p>
      </div>
      <span className={`text-[10px] font-bold uppercase tracking-widest ${meta.color} flex-shrink-0`}>
        {meta.label}
      </span>
    </div>
  );
};

const DiffView = ({ onBack }) => {
  const [specAText, setSpecAText] = useState("");
  const [specBText, setSpecBText] = useState("");
  const [error, setError] = useState("");
  const [diff, setDiff] = useState(null);
  const [filterType, setFilterType] = useState("all"); // all | added | removed | modified | unchanged

  const handleCompare = () => {
    setError("");
    const a = tryParse(specAText);
    const b = tryParse(specBText);
    if (!a) { setError("Version A is invalid JSON/YAML"); return; }
    if (!b) { setError("Version B is invalid JSON/YAML"); return; }
    setDiff(computeDiff(a, b));
  };

  const allEntries = useMemo(() => {
    if (!diff) return [];
    const entries = [
      ...diff.added.map((ep) => ({ ...ep, _type: "added" })),
      ...diff.removed.map((ep) => ({ ...ep, _type: "removed" })),
      ...diff.modified.map((ep) => ({ ...ep, _type: "modified" })),
      ...diff.unchanged.map((ep) => ({ ...ep, _type: "unchanged" })),
    ];
    if (filterType !== "all") return entries.filter((e) => e._type === filterType);
    return entries;
  }, [diff, filterType]);

  return (
    <div className="flex-1 overflow-auto" style={{ animation: "fadeIn 0.3s ease-out both", minHeight: "100dvh" }}>
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none mesh-gradient-bg" style={{ zIndex: 0 }} />

      <div className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={onBack}
            className="p-2 hover:bg-[#121824] rounded-lg text-[#a4acbc] hover:text-white transition-all group"
          >
            <ArrowLeft size={18} className="group-hover:-translate-x-0.5 transition-transform" />
          </button>
          <div>
            <h1 className="text-2xl font-extrabold text-white flex items-center gap-3">
              <GitCompareArrows size={24} className="text-[#a855f7]" />
              API Diff Visualizer
            </h1>
            <p className="text-sm text-[#6f7788] mt-1">Compare two API specs side-by-side. See added, removed, and modified endpoints.</p>
          </div>
        </div>

        {/* Two editors side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          <SpecEditor
            label="Version A (Base)"
            value={specAText}
            onChange={setSpecAText}
            placeholder='Paste your base API spec here (JSON/YAML)...'
          />
          <SpecEditor
            label="Version B (New)"
            value={specBText}
            onChange={setSpecBText}
            placeholder='Paste the updated API spec here (JSON/YAML)...'
          />
        </div>

        {/* Compare button + error */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={handleCompare}
            disabled={!specAText.trim() || !specBText.trim()}
            className="px-8 py-3 rounded-xl text-sm font-bold uppercase tracking-widest transition-all duration-200 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed btn-shimmer flex items-center gap-2"
            style={
              specAText.trim() && specBText.trim()
                ? { background: "#a855f7", color: "#080b12", boxShadow: "0 12px 24px -6px rgba(224,142,254,0.3)" }
                : { background: "rgba(255,255,255,0.03)", color: "#6f7788", border: "1px solid rgba(70,72,76,0.2)" }
            }
          >
            <GitCompareArrows size={16} />
            Compare Specs
          </button>
          {error && (
            <div className="flex items-center gap-2 text-[#f43f5e] text-sm">
              <AlertCircle size={14} /> {error}
            </div>
          )}
        </div>

        {/* Results */}
        {diff && (
          <div style={{ animation: "slideInUp 0.3s ease-out both" }}>
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {[
                { key: "added", count: diff.added.length },
                { key: "removed", count: diff.removed.length },
                { key: "modified", count: diff.modified.length },
                { key: "unchanged", count: diff.unchanged.length },
              ].map(({ key, count }, i) => {
                const meta = CHANGE_META[key];
                const Icon = meta.icon;
                return (
                  <button
                    key={key}
                    onClick={() => setFilterType(filterType === key ? "all" : key)}
                    className={`p-4 rounded-xl border transition-all duration-200 text-left ${
                      filterType === key
                        ? `${meta.border} ${meta.bg} shadow-lg`
                        : "border-[#222a39]/20 bg-[#0f141d]/40 hover:bg-[#0f141d]/60"
                    }`}
                    style={{ animation: `slideInUp 0.3s ease-out ${i * 60}ms both` }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-[#a4acbc]">{meta.label}</span>
                    </div>
                    <span className={`text-2xl font-extrabold ${meta.color}`}>{count}</span>
                  </button>
                );
              })}
            </div>

            {/* Totals row */}
            <div className="flex items-center gap-6 mb-6 px-1 text-xs text-[#6f7788]">
              <span>Version A: <strong className="text-white">{diff.totalA}</strong> endpoints</span>
              <span>Version B: <strong className="text-white">{diff.totalB}</strong> endpoints</span>
              {filterType !== "all" && (
                <button onClick={() => setFilterType("all")} className="flex items-center gap-1 text-[#a855f7] hover:underline">
                  <X size={10} /> Clear filter
                </button>
              )}
            </div>

            {/* Endpoint list */}
            <div className="space-y-2">
              {allEntries.length === 0 ? (
                <div className="text-center py-12 text-[#6f7788]">
                  <Filter size={32} className="mx-auto mb-3 text-[#222a39]" />
                  <p className="text-sm">No endpoints match this filter</p>
                </div>
              ) : (
                allEntries.map((ep, i) => (
                  <div key={`${ep._type}-${ep.method}-${ep.path}-${i}`} style={{ animationDelay: `${i * 20}ms` }}>
                    <EndpointRow ep={ep} type={ep._type} />
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DiffView;
