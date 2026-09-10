import { useState, useCallback, useMemo, useRef } from "react";
import {
  X, Play, Pause, BarChart3, Clock, AlertCircle, CheckCircle,
  Loader2, Target, TrendingUp, Zap,
} from "lucide-react";

const METHOD_BADGE = { GET: "bg-emerald-600/20 text-emerald-400", POST: "bg-amber-600/20 text-amber-400", PUT: "bg-blue-600/20 text-blue-400", PATCH: "bg-purple-600/20 text-purple-400", DELETE: "bg-red-600/20 text-red-400" };

const percentile = (arr, p) => {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil(sorted.length * p / 100) - 1;
  return sorted[Math.max(0, idx)];
};

// A native <select> with a couple of thousand <option> elements is slow to
// open and impossible to scan — filter it down first.
const OPTION_LIMIT = 200;

const LoadTester = ({ nodes, onClose }) => {
  const requestNodes = useMemo(
    () => nodes.filter((n) => n.type === "request" && n.path),
    [nodes],
  );
  const [endpointQuery, setEndpointQuery] = useState("");
  const options = useMemo(() => {
    const q = endpointQuery.trim().toLowerCase();
    const list = q
      ? requestNodes.filter(
          (n) =>
            n.path.toLowerCase().includes(q) ||
            String(n.name || "").toLowerCase().includes(q),
        )
      : requestNodes;
    return list.slice(0, OPTION_LIMIT);
  }, [requestNodes, endpointQuery]);
  const [selectedNodeId, setSelectedNodeId] = useState(requestNodes[0]?.id || "");
  const [concurrency, setConcurrency] = useState(5);
  const [totalRequests, setTotalRequests] = useState(20);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [progress, setProgress] = useState(0);
  const abortRef = useRef(false);

  const selectedNode = requestNodes.find((n) => n.id === selectedNodeId);

  const runTest = useCallback(async () => {
    if (!selectedNode) return;
    setRunning(true); setProgress(0); setResults(null); abortRef.current = false;

    const latencies = [];
    const statuses = {};
    const errors = [];
    let completed = 0;
    const startTime = Date.now();

    const sendOne = async () => {
      if (abortRef.current) return;
      try {
        const t0 = Date.now();
        const res = await fetch(selectedNode.path, { method: selectedNode.method || "GET", mode: "no-cors" });
        const latency = Date.now() - t0;
        latencies.push(latency);
        const code = res.status || 200;
        statuses[code] = (statuses[code] || 0) + 1;
      } catch (e) {
        latencies.push(0);
        errors.push(e.message);
        statuses["ERR"] = (statuses["ERR"] || 0) + 1;
      }
      completed++;
      setProgress(Math.round((completed / totalRequests) * 100));
    };

    // Run in batches of `concurrency`
    for (let i = 0; i < totalRequests && !abortRef.current; i += concurrency) {
      const batch = Math.min(concurrency, totalRequests - i);
      await Promise.allSettled(Array.from({ length: batch }, () => sendOne()));
    }

    const duration = Date.now() - startTime;
    const validLatencies = latencies.filter((l) => l > 0);

    setResults({
      total: latencies.length,
      duration,
      rps: +(latencies.length / (duration / 1000)).toFixed(1),
      avg: validLatencies.length ? Math.round(validLatencies.reduce((a, b) => a + b, 0) / validLatencies.length) : 0,
      min: validLatencies.length ? Math.min(...validLatencies) : 0,
      max: validLatencies.length ? Math.max(...validLatencies) : 0,
      p50: percentile(validLatencies, 50),
      p95: percentile(validLatencies, 95),
      p99: percentile(validLatencies, 99),
      statuses,
      errors: errors.length,
      latencies: validLatencies,
    });
    setRunning(false);
  }, [selectedNode, concurrency, totalRequests]);

  const stopTest = () => { abortRef.current = true; };

  // Simple bar chart for latency distribution
  const LatencyChart = ({ latencies }) => {
    if (!latencies.length) return null;
    const buckets = [50, 100, 200, 500, 1000, 2000, 5000, Infinity];
    const labels = ["<50ms", "<100ms", "<200ms", "<500ms", "<1s", "<2s", "<5s", "5s+"];
    const counts = buckets.map(() => 0);
    latencies.forEach((l) => { const idx = buckets.findIndex((b) => l < b); if (idx >= 0) counts[idx]++; });
    const maxCount = Math.max(...counts, 1);

    return (
      <div className="flex items-end gap-1.5 h-28">
        {counts.map((count, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-[9px] font-mono text-[#73757a]">{count}</span>
            <div className="w-full rounded-t" style={{
              height: `${(count / maxCount) * 80}%`,
              minHeight: count > 0 ? 4 : 0,
              background: i < 3 ? "#34d399" : i < 5 ? "#fbbf24" : "#ff6e84",
              transition: "height 0.3s ease-out",
            }} />
            <span className="text-[8px] text-[#46484c] whitespace-nowrap">{labels[i]}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ animation: "fadeIn 0.2s ease-out both" }}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl rounded-2xl border border-[#46484c]/30 overflow-hidden flex flex-col"
        style={{ maxHeight: "90vh", background: "rgba(12,14,18,0.95)", backdropFilter: "blur(20px)", animation: "scaleIn 0.25s cubic-bezier(0.34,1.56,0.64,1) both" }}>

        <div className="px-6 py-5 border-b border-[#46484c]/20 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 size={18} className="text-[#e08efe]" />
              <h2 className="font-bold text-white text-lg">Load Tester</h2>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-[#22262b] rounded-lg transition-colors"><X size={16} className="text-[#a9abb0]" /></button>
          </div>
          <p className="text-xs text-[#73757a] mt-2">Send concurrent requests to an endpoint and measure performance.</p>
        </div>

        <div className="flex-1 overflow-auto px-6 py-5 space-y-5">
          {/* Endpoint selector */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-[#a9abb0] block mb-2">Target Endpoint</label>
            {requestNodes.length > OPTION_LIMIT && (
              <input
                value={endpointQuery}
                onChange={(e) => setEndpointQuery(e.target.value)}
                placeholder={`Filter ${requestNodes.length.toLocaleString()} endpoints`}
                className="w-full mb-2 bg-[#22262b]/60 border border-[#46484c]/30 rounded-lg px-4 py-2 text-xs text-white placeholder:text-[#73757a] focus:border-[#e08efe]/50 focus:outline-none"
              />
            )}
            <select value={selectedNodeId} onChange={(e) => setSelectedNodeId(e.target.value)}
              className="w-full bg-[#22262b]/60 border border-[#46484c]/30 rounded-lg px-4 py-2.5 text-sm text-white focus:border-[#e08efe]/50 focus:ring-1 focus:ring-[#e08efe]/20 transition-all">
              {options.map((n) => (
                <option key={n.id} value={n.id}>{n.method} — {n.name} — {n.path}</option>
              ))}
            </select>
            {requestNodes.length > options.length && (
              <p className="mt-1.5 text-[10px] text-[#73757a]">
                Showing {options.length} of {requestNodes.length.toLocaleString()} — narrow the filter to reach the rest.
              </p>
            )}
          </div>

          {/* Config */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-[#a9abb0] block mb-2">Concurrent Users</label>
              <div className="flex items-center gap-2">
                {[1, 5, 10, 20, 50].map((v) => (
                  <button key={v} onClick={() => setConcurrency(v)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${concurrency === v ? "bg-[#e08efe] text-[#0c0e12]" : "bg-[#22262b] text-[#73757a] hover:text-[#a9abb0]"}`}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-[#a9abb0] block mb-2">Total Requests</label>
              <div className="flex items-center gap-2">
                {[10, 20, 50, 100, 200].map((v) => (
                  <button key={v} onClick={() => setTotalRequests(v)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${totalRequests === v ? "bg-[#e08efe] text-[#0c0e12]" : "bg-[#22262b] text-[#73757a] hover:text-[#a9abb0]"}`}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Run button + progress */}
          <div className="flex items-center gap-3">
            {running ? (
              <button onClick={stopTest} className="px-6 py-3 rounded-xl text-sm font-bold bg-[#ff6e84] text-[#0c0e12] hover:bg-red-400 transition-all active:scale-[0.97] flex items-center gap-2">
                <Pause size={14} /> Stop ({progress}%)
              </button>
            ) : (
              <button onClick={runTest} disabled={!selectedNode}
                className="px-6 py-3 rounded-xl text-sm font-bold bg-[#e08efe] text-[#0c0e12] hover:bg-[#ce7eec] transition-all active:scale-[0.97] disabled:opacity-40 btn-shimmer flex items-center gap-2"
                style={{ boxShadow: "0 8px 20px -4px rgba(224,142,254,0.3)" }}>
                <Play size={14} /> Run Test
              </button>
            )}
            {running && (
              <div className="flex-1 h-2 bg-[#22262b] rounded-full overflow-hidden">
                <div className="h-full bg-[#e08efe] rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            )}
          </div>

          {/* Results */}
          {results && (
            <div style={{ animation: "slideInUp 0.3s ease-out both" }}>
              {/* Summary cards */}
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-5">
                {[
                  { label: "Requests", value: results.total, icon: Target, color: "#e08efe" },
                  { label: "RPS", value: results.rps, icon: Zap, color: "#81ecff" },
                  { label: "Avg", value: `${results.avg}ms`, icon: Clock, color: "#fbbf24" },
                  { label: "P95", value: `${results.p95}ms`, icon: TrendingUp, color: results.p95 > 1000 ? "#ff6e84" : "#34d399" },
                  { label: "Errors", value: results.errors, icon: AlertCircle, color: results.errors > 0 ? "#ff6e84" : "#34d399" },
                ].map(({ label, value, icon: Icon, color }, i) => (
                  <div key={label} className="p-3 rounded-xl border border-[#46484c]/20 bg-[#171a1e]/40"
                    style={{ animation: `slideInUp 0.2s ease-out ${i * 40}ms both` }}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <Icon size={11} style={{ color }} />
                      <span className="text-[9px] font-bold uppercase tracking-widest text-[#73757a]">{label}</span>
                    </div>
                    <span className="text-lg font-extrabold" style={{ color }}>{value}</span>
                  </div>
                ))}
              </div>

              {/* Latency distribution chart */}
              <div className="p-4 rounded-xl border border-[#46484c]/20 bg-[#171a1e]/30 mb-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#a9abb0] mb-3">Latency Distribution</p>
                <LatencyChart latencies={results.latencies} />
              </div>

              {/* Percentiles + status codes */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 rounded-xl border border-[#46484c]/20 bg-[#171a1e]/30">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#a9abb0] mb-2">Percentiles</p>
                  {[{ label: "Min", val: results.min }, { label: "P50", val: results.p50 }, { label: "P95", val: results.p95 }, { label: "P99", val: results.p99 }, { label: "Max", val: results.max }].map(({ label, val }) => (
                    <div key={label} className="flex justify-between py-1 border-b border-[#46484c]/10 last:border-0">
                      <span className="text-xs text-[#73757a]">{label}</span>
                      <span className="text-xs font-bold font-mono text-white">{val}ms</span>
                    </div>
                  ))}
                </div>
                <div className="p-4 rounded-xl border border-[#46484c]/20 bg-[#171a1e]/30">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#a9abb0] mb-2">Status Codes</p>
                  {Object.entries(results.statuses).map(([code, count]) => (
                    <div key={code} className="flex justify-between py-1 border-b border-[#46484c]/10 last:border-0">
                      <span className={`text-xs font-mono font-bold ${code === "ERR" ? "text-[#ff6e84]" : Number(code) < 400 ? "text-[#81ecff]" : "text-[#ff6e84]"}`}>{code}</span>
                      <span className="text-xs text-white">{count}x</span>
                    </div>
                  ))}
                  <div className="flex justify-between pt-2 mt-1 border-t border-[#46484c]/20">
                    <span className="text-xs text-[#73757a]">Duration</span>
                    <span className="text-xs font-bold text-white">{(results.duration / 1000).toFixed(2)}s</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LoadTester;
