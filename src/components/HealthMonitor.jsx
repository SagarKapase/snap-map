import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Activity, Play, Pause, RefreshCw, X, Wifi, AlertCircle, Clock,
  CheckCircle, XCircle, Loader2, ArrowDown, ArrowUp,
} from "lucide-react";
import { resolveText } from "../utils/variables";

const STATUS_CONFIG = {
  healthy:  { color: "#60a5fa", bg: "bg-[#60a5fa]/10", border: "border-[#60a5fa]/30", label: "Healthy", icon: CheckCircle },
  warning:  { color: "#fbbf24", bg: "bg-amber-500/10", border: "border-amber-500/30", label: "Slow", icon: Clock },
  error:    { color: "#f43f5e", bg: "bg-[#f43f5e]/10", border: "border-[#f43f5e]/30", label: "Error", icon: XCircle },
  unknown:  { color: "#6f7788", bg: "bg-[#222a39]/10", border: "border-[#222a39]/30", label: "Unknown", icon: AlertCircle },
  checking: { color: "#a855f7", bg: "bg-[#a855f7]/10", border: "border-[#a855f7]/30", label: "Checking", icon: Loader2 },
};

const getStatus = (result) => {
  if (!result) return "unknown";
  if (result.error) return "error";
  if (result.status >= 200 && result.status < 400) {
    return result.latency > 2000 ? "warning" : "healthy";
  }
  return "error";
};

// Every ping is a real HTTP request. On a spec with a couple of thousand
// operations "Ping All" used to fire all of them, five at a time, with no
// cap and no confirmation — minutes of traffic aimed at somebody's API (or,
// when the spec uses a relative server URL, at this app's own origin).
const DEFAULT_BATCH = 25;
const CONFIRM_ABOVE = 50;
const LIST_LIMIT = 200;

/** A URL the browser can actually send: scheme and host present. */
const isAbsolute = (url) => /^[a-zA-Z][\w+.-]*:\/\//.test(String(url || "").trim());

const HealthMonitor = ({ nodes, onClose, variables = null }) => {
  const resolveUrl = useCallback(
    (node) => {
      const raw = String(node?.path || "");
      return variables ? resolveText(raw, variables).text : raw;
    },
    [variables],
  );

  const [results, setResults] = useState({}); // nodeId → { status, latency, error, timestamp }
  const [running, setRunning] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [interval, setIntervalSec] = useState(30);
  const [sortBy, setSortBy] = useState("name"); // name | latency | status
  const [scope, setScope] = useState(DEFAULT_BATCH);
  const [confirming, setConfirming] = useState(false);
  const [listLimit, setListLimit] = useState(LIST_LIMIT);
  const intervalRef = useRef(null);

  const requestNodes = useMemo(
    () => nodes.filter((n) => n.type === "request" && n.path),
    [nodes],
  );
  const targets = useMemo(
    () => (scope === "all" ? requestNodes : requestNodes.slice(0, scope)),
    [requestNodes, scope],
  );

  const pingEndpoint = useCallback(async (node, resolveUrl) => {
    const target = resolveUrl(node);
    if (!isAbsolute(target)) {
      setResults((prev) => ({
        ...prev,
        [node.id]: {
          status: 0,
          latency: 0,
          error: "No host in this URL — nothing to reach",
          timestamp: Date.now(),
          checking: false,
        },
      }));
      return;
    }
    setResults((prev) => ({ ...prev, [node.id]: { ...prev[node.id], checking: true } }));
    const t0 = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      // A normal request, so a status that comes back is the real one. Under
      // `no-cors` every reply is opaque with a status of 0, which this used
      // to paper over by reporting 200.
      const res = await fetch(target, { method: "GET", signal: controller.signal });
      clearTimeout(timeout);
      setResults((prev) => ({
        ...prev,
        [node.id]: {
          status: res.status || 0,
          latency: Date.now() - t0,
          error: res.status ? null : "No readable status",
          timestamp: Date.now(),
          checking: false,
        },
      }));
    } catch (e) {
      setResults((prev) => ({
        ...prev,
        [node.id]: {
          status: 0,
          latency: Date.now() - t0,
          // The request may well have reached the host; what failed is this
          // page's ability to read the reply. Saying which is the useful part.
          error:
            e.name === "AbortError"
              ? "Timed out after 8s"
              : e.message?.includes("Failed to fetch")
                ? "Blocked — the host does not allow cross-origin requests from a browser"
                : e.message || "Request failed",
          timestamp: Date.now(),
          checking: false,
        },
      }));
    }
  }, []);

  const pingAll = useCallback(async () => {
    setRunning(true);
    // Ping in batches of 5 to avoid overwhelming
    for (let i = 0; i < targets.length; i += 5) {
      const batch = targets.slice(i, i + 5);
      await Promise.allSettled(batch.map((n) => pingEndpoint(n, resolveUrl)));
    }
    setRunning(false);
  }, [targets, pingEndpoint, resolveUrl]);

  const requestPing = useCallback(() => {
    if (targets.length > CONFIRM_ABOVE) {
      setConfirming(true);
      return;
    }
    pingAll();
  }, [targets.length, pingAll]);

  // Auto-refresh
  useEffect(() => {
    if (autoRefresh) {
      pingAll();
      intervalRef.current = setInterval(pingAll, interval * 1000);
      return () => clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, interval, pingAll]);

  const sortedNodes = [...targets].sort((a, b) => {
    if (sortBy === "latency") return (results[b.id]?.latency || 0) - (results[a.id]?.latency || 0);
    if (sortBy === "status") {
      const sa = getStatus(results[a.id]), sb = getStatus(results[b.id]);
      const order = { error: 0, warning: 1, unknown: 2, healthy: 3 };
      return (order[sa] ?? 2) - (order[sb] ?? 2);
    }
    return a.name.localeCompare(b.name);
  });

  const summary = {
    healthy: targets.filter((n) => getStatus(results[n.id]) === "healthy").length,
    warning: targets.filter((n) => getStatus(results[n.id]) === "warning").length,
    error: targets.filter((n) => getStatus(results[n.id]) === "error").length,
    unknown: targets.filter((n) => getStatus(results[n.id]) === "unknown" || !results[n.id]).length,
  };

  const METHOD_BADGE = {
    GET: "text-emerald-400", POST: "text-amber-400", PUT: "text-blue-400",
    PATCH: "text-purple-400", DELETE: "text-red-400",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ animation: "fadeIn 0.2s ease-out both" }}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-2xl rounded-2xl border border-[#222a39]/30 overflow-hidden flex flex-col"
        style={{ maxHeight: "85vh", background: "rgba(12,14,18,0.95)", backdropFilter: "blur(20px)", animation: "scaleIn 0.25s cubic-bezier(0.34,1.56,0.64,1) both" }}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-[#222a39]/20 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity size={18} className="text-[#a855f7]" />
              <h2 className="font-bold text-white text-lg">Health Monitor</h2>
              <span className="text-xs text-[#6f7788] bg-[#121824] px-2 py-0.5 rounded-full">
                {targets.length.toLocaleString()} of {requestNodes.length.toLocaleString()} endpoints
              </span>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-[#121824] rounded-lg transition-colors">
              <X size={16} className="text-[#a4acbc]" />
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="px-6 py-3 border-b border-[#222a39]/15 flex items-center gap-3 flex-shrink-0">
          <button
            onClick={requestPing}
            disabled={running}
            className="px-4 py-2 rounded-lg text-xs font-bold text-[#080b12] bg-[#a855f7] hover:bg-[#c45cff] transition-all active:scale-[0.97] disabled:opacity-50 flex items-center gap-2"
          >
            {running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
            {running ? `Checking ${targets.length}...` : `Ping ${targets.length}`}
          </button>

          <select
            value={scope}
            onChange={(e) => setScope(e.target.value === "all" ? "all" : Number(e.target.value))}
            className="bg-[#121824] border border-[#222a39]/30 rounded px-2 py-1.5 text-[10px] text-[#a4acbc] focus:outline-none"
          >
            {[10, 25, 50, 100, 250].filter((n) => n < requestNodes.length).map((n) => (
              <option key={n} value={n}>First {n}</option>
            ))}
            <option value="all">All {requestNodes.length.toLocaleString()}</option>
          </select>

          <div className="flex items-center gap-2 ml-auto">
            <span className="text-[10px] text-[#6f7788] uppercase tracking-widest">Auto</span>
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`w-9 h-5 rounded-full transition-all duration-200 flex items-center px-0.5 ${autoRefresh ? "bg-[#a855f7]" : "bg-[#222a39]/40"}`}
            >
              <div className={`w-4 h-4 rounded-full bg-white transition-transform duration-200 ${autoRefresh ? "translate-x-4" : ""}`} />
            </button>
            {autoRefresh && (
              <select value={interval} onChange={(e) => setIntervalSec(Number(e.target.value))}
                className="bg-[#121824] border border-[#222a39]/30 rounded px-2 py-1 text-[10px] text-[#a4acbc] focus:outline-none">
                <option value={15}>15s</option><option value={30}>30s</option><option value={60}>1m</option>
              </select>
            )}
          </div>

          <div className="flex items-center gap-1 bg-[#121824]/40 border border-[#222a39]/20 rounded-lg p-0.5">
            {["name", "latency", "status"].map((s) => (
              <button key={s} onClick={() => setSortBy(s)}
                className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-all ${sortBy === s ? "bg-[#a855f7]/15 text-[#a855f7]" : "text-[#6f7788] hover:text-[#a4acbc]"}`}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="px-6 py-3 flex items-center gap-4 border-b border-[#222a39]/10 flex-shrink-0">
          {Object.entries(summary).map(([key, count]) => {
            const cfg = STATUS_CONFIG[key];
            return (
              <div key={key} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: cfg.color }} />
                <span className="text-xs text-[#a4acbc]">{count}</span>
                <span className="text-[10px] text-[#222a39] uppercase">{cfg.label}</span>
              </div>
            );
          })}
        </div>

        {/* Endpoint list */}
        <div className="flex-1 overflow-auto p-4 space-y-1.5">
          {sortedNodes.slice(0, listLimit).map((node, i) => {
            const r = results[node.id];
            const status = r?.checking ? "checking" : getStatus(r);
            const cfg = STATUS_CONFIG[status];
            const Icon = cfg.icon;
            return (
              <div
                key={node.id}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${cfg.border} ${cfg.bg} transition-all duration-200`}
                style={
                  i < 30
                    ? { animation: `slideInUp 0.2s ease-out ${i * 15}ms both` }
                    : undefined
                }
              >
                <Icon size={16} style={{ color: cfg.color }} className={status === "checking" ? "animate-spin" : ""} />
                <span className={`text-[10px] font-bold uppercase flex-shrink-0 ${METHOD_BADGE[node.method] || "text-[#a4acbc]"}`}>
                  {node.method}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{node.name}</p>
                  <p className="text-[10px] text-[#222a39] font-mono truncate">{node.path}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 text-right">
                  {r && !r.checking && (
                    <>
                      {r.latency > 0 && (
                        <span className="text-xs font-mono font-bold" style={{ color: cfg.color }}>
                          {r.latency}ms
                        </span>
                      )}
                      {r.error && <span className="text-[10px] text-[#f43f5e] max-w-[120px] truncate">{r.error}</span>}
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {sortedNodes.length > listLimit && (
            <button
              onClick={() => setListLimit((n) => n + LIST_LIMIT)}
              className="w-full rounded-xl border border-[#222a39]/25 py-2.5 text-xs text-[#a4acbc] hover:text-white hover:bg-[#121824] transition-colors"
            >
              Show more ({(sortedNodes.length - listLimit).toLocaleString()} hidden)
            </button>
          )}
        </div>

        {confirming && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 p-6">
            <div className="w-full max-w-sm rounded-xl border border-[#222a39]/30 bg-[#12151b] p-5">
              <div className="flex items-center gap-2">
                <AlertCircle size={16} className="text-amber-400" />
                <h3 className="text-sm font-bold text-white">Send {targets.length.toLocaleString()} live requests?</h3>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-[#a4acbc]">
                Each endpoint is checked with a real HTTP request. If the
                specification uses a relative server URL these are aimed at this
                site, not at the API.
              </p>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => { setConfirming(false); pingAll(); }}
                  className="flex-1 rounded-lg bg-[#a855f7] py-2 text-xs font-bold text-[#080b12] hover:bg-[#c45cff] transition-colors"
                >
                  Run the checks
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  className="rounded-lg border border-[#222a39]/30 px-4 py-2 text-xs text-[#a4acbc] hover:text-white transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HealthMonitor;
