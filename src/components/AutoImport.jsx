import { useState, useEffect, useRef } from "react";
import {
  Globe, RefreshCw, AlertCircle, Check, Link2, Github,
  Clock, X, Loader2, Wifi, WifiOff, Play, Pause,
} from "lucide-react";
import yaml from "js-yaml";

const tryParse = (text) => {
  try { return JSON.parse(text); } catch {}
  try { return yaml.load(text); } catch {}
  return null;
};

const PRESETS = [
  { label: "Petstore 3.0", url: "https://petstore3.swagger.io/api/v3/openapi.json", type: "OpenAPI" },
  { label: "Petstore 2.0", url: "https://petstore.swagger.io/v2/swagger.json", type: "Swagger" },
];

const STORAGE_KEY = "vizroute_auto_imports";

const getSavedSources = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
};
const saveSources = (sources) => localStorage.setItem(STORAGE_KEY, JSON.stringify(sources));

const AutoImportPanel = ({ onImport, onClose }) => {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [fetching, setFetching] = useState(false);
  const [sources, setSources] = useState(getSavedSources());
  const [autoSync, setAutoSync] = useState(false);
  const [syncInterval, setSyncInterval] = useState(60); // seconds
  const [lastFetched, setLastFetched] = useState(null);
  const intervalRef = useRef(null);

  const fetchSpec = async (targetUrl, silent = false) => {
    const fetchUrl = targetUrl || url.trim();
    if (!fetchUrl) { if (!silent) setError("Enter a URL"); return; }
    if (!silent) { setFetching(true); setError(""); }
    try {
      // Try direct fetch, handle GitHub URLs
      let finalUrl = fetchUrl;
      if (finalUrl.includes("github.com") && !finalUrl.includes("raw.githubusercontent.com")) {
        finalUrl = finalUrl
          .replace("github.com", "raw.githubusercontent.com")
          .replace("/blob/", "/");
      }
      const res = await fetch(finalUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const data = tryParse(text);
      if (!data || typeof data !== "object") throw new Error("Invalid JSON/YAML response");

      // Save source for re-sync
      const existingIdx = sources.findIndex((s) => s.url === fetchUrl);
      const entry = {
        url: fetchUrl,
        label: data.info?.title || data.info?.name || data.name || fetchUrl.split("/").pop(),
        lastSync: new Date().toISOString(),
        format: data.openapi ? `OpenAPI ${data.openapi}` : data.swagger ? `Swagger ${data.swagger}` : data.info?.name ? "Postman" : "Custom",
      };
      const updated = existingIdx >= 0
        ? sources.map((s, i) => i === existingIdx ? entry : s)
        : [entry, ...sources].slice(0, 10);
      setSources(updated);
      saveSources(updated);
      setLastFetched(new Date().toISOString());

      onImport(data);
      if (!silent) setError("");
    } catch (e) {
      const msg = e.message || "";
      if (!silent) setError(
        msg.includes("fetch") || msg.includes("NetworkError") || msg.includes("Failed")
          ? "CORS blocked — try a public URL or GitHub raw link"
          : msg,
      );
    } finally {
      if (!silent) setFetching(false);
    }
  };

  // Auto-sync interval
  useEffect(() => {
    if (autoSync && url.trim()) {
      intervalRef.current = setInterval(() => fetchSpec(url.trim(), true), syncInterval * 1000);
      return () => clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoSync, url, syncInterval]);

  const removeSource = (sourceUrl) => {
    const updated = sources.filter((s) => s.url !== sourceUrl);
    setSources(updated);
    saveSources(updated);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ animation: "fadeIn 0.2s ease-out both" }}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-lg rounded-2xl border border-[#46484c]/30 overflow-hidden flex flex-col"
        style={{ maxHeight: "85vh", background: "rgba(12,14,18,0.95)", backdropFilter: "blur(20px)", animation: "scaleIn 0.25s cubic-bezier(0.34,1.56,0.64,1) both" }}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-[#46484c]/20 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe size={18} className="text-[#e08efe]" />
              <h2 className="font-bold text-white text-lg">Auto-Import</h2>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-[#22262b] rounded-lg transition-colors">
              <X size={16} className="text-[#a9abb0]" />
            </button>
          </div>
          <p className="text-xs text-[#73757a] mt-2">Fetch from a Swagger URL, OpenAPI endpoint, or GitHub raw file.</p>
        </div>

        <div className="flex-1 overflow-auto px-6 py-5 space-y-5">
          {/* URL input */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-[#a9abb0] block mb-2">Spec URL</label>
            <div className="flex gap-2">
              <input
                value={url}
                onChange={(e) => { setUrl(e.target.value); setError(""); }}
                onKeyDown={(e) => e.key === "Enter" && fetchSpec()}
                placeholder="https://api.example.com/openapi.json"
                className="flex-1 bg-[#22262b]/60 border border-[#46484c]/30 rounded-lg px-4 py-2.5 text-sm text-white font-mono placeholder:text-[#46484c] focus:border-[#e08efe]/50 focus:ring-1 focus:ring-[#e08efe]/20 transition-all"
                style={{ caretColor: "#e08efe" }}
              />
              <button
                onClick={() => fetchSpec()}
                disabled={fetching || !url.trim()}
                className="px-5 py-2.5 rounded-lg text-sm font-bold text-[#0c0e12] bg-[#e08efe] hover:bg-[#ce7eec] transition-all active:scale-[0.97] disabled:opacity-40 flex items-center gap-2 flex-shrink-0"
              >
                {fetching ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                {fetching ? "Fetching..." : "Fetch"}
              </button>
            </div>
            {error && (
              <div className="flex items-center gap-2 mt-2 text-xs text-[#ff6e84]">
                <AlertCircle size={12} /> {error}
              </div>
            )}
          </div>

          {/* Auto-sync toggle */}
          <div className="flex items-center justify-between p-3 rounded-xl border border-[#46484c]/20 bg-[#171a1e]/40">
            <div className="flex items-center gap-3">
              {autoSync ? <Wifi size={16} className="text-[#81ecff]" /> : <WifiOff size={16} className="text-[#46484c]" />}
              <div>
                <p className="text-sm font-medium text-white">Auto-Sync</p>
                <p className="text-[10px] text-[#73757a]">Re-fetch spec on interval</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {autoSync && (
                <select
                  value={syncInterval}
                  onChange={(e) => setSyncInterval(Number(e.target.value))}
                  className="bg-[#22262b] border border-[#46484c]/30 rounded-lg px-2 py-1 text-xs text-[#a9abb0] focus:outline-none"
                >
                  <option value={30}>30s</option>
                  <option value={60}>1m</option>
                  <option value={300}>5m</option>
                  <option value={600}>10m</option>
                </select>
              )}
              <button
                onClick={() => setAutoSync(!autoSync)}
                className={`w-11 h-6 rounded-full transition-all duration-200 flex items-center px-0.5 ${autoSync ? "bg-[#e08efe]" : "bg-[#46484c]/40"}`}
              >
                <div className={`w-5 h-5 rounded-full bg-white transition-transform duration-200 ${autoSync ? "translate-x-5" : ""}`} />
              </button>
            </div>
          </div>

          {/* Presets */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#a9abb0] mb-2">Quick Import</p>
            <div className="space-y-1.5">
              {PRESETS.map(({ label, url: presetUrl, type }) => (
                <button
                  key={presetUrl}
                  onClick={() => { setUrl(presetUrl); fetchSpec(presetUrl); }}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl hover:bg-white/5 transition-colors group border border-[#46484c]/10"
                >
                  <div className="flex items-center gap-2">
                    <Globe size={12} className="text-[#e08efe]" />
                    <span className="text-xs font-medium text-[#a9abb0] group-hover:text-white transition-colors">{label}</span>
                  </div>
                  <span className="text-[10px] text-[#46484c] font-mono">{type}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Saved sources */}
          {sources.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#a9abb0] mb-2">Recent Sources</p>
              <div className="space-y-1.5">
                {sources.map((source) => (
                  <div
                    key={source.url}
                    className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl hover:bg-white/5 transition-colors group border border-[#46484c]/10 cursor-pointer"
                    onClick={() => { setUrl(source.url); fetchSpec(source.url); }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-[#a9abb0] group-hover:text-white truncate transition-colors">{source.label}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-[#46484c] font-mono">{source.format}</span>
                        <span className="text-[10px] text-[#46484c] flex items-center gap-1"><Clock size={8} /> {new Date(source.lastSync).toLocaleString()}</span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeSource(source.url); }}
                      className="p-1 rounded text-[#46484c] hover:text-[#ff6e84] opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {lastFetched && (
          <div className="px-6 py-3 border-t border-[#46484c]/20 flex items-center gap-2 text-xs text-[#73757a] flex-shrink-0">
            <Check size={12} className="text-[#81ecff]" />
            Last imported: {new Date(lastFetched).toLocaleTimeString()}
            {autoSync && <span className="ml-auto flex items-center gap-1 text-[#e08efe]"><Wifi size={10} /> Syncing every {syncInterval}s</span>}
          </div>
        )}
      </div>
    </div>
  );
};

export default AutoImportPanel;
