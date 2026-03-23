import { useState, useMemo } from "react";
import yaml from "js-yaml";
import {
  ArrowLeft, Plus, Trash2, Upload, X, Network, AlertTriangle,
  ChevronDown, Zap, Globe, Link2, FileJson, ArrowRight,
} from "lucide-react";
import { HTTP_METHODS } from "../utils/constants";

const tryParse = (t) => { try { return JSON.parse(t); } catch {} try { return yaml.load(t); } catch {} return null; };

const COLORS = ["#e08efe", "#3aa2ff", "#81ecff", "#fbbf24", "#34d399", "#f87171", "#a78bfa", "#fb923c"];

const extractServiceEndpoints = (data) => {
  const eps = [];
  if (data.openapi || data.swagger) {
    Object.entries(data.paths || {}).forEach(([path, obj]) => {
      HTTP_METHODS.forEach((m) => { if (obj?.[m]) eps.push({ method: m.toUpperCase(), path, name: obj[m].summary || obj[m].operationId || `${m.toUpperCase()} ${path}` }); });
    });
  } else if (data.info && data.item) {
    const walk = (items) => items.forEach((i) => {
      if (i.item) { walk(i.item); return; }
      const req = i.request || i;
      const url = typeof req.url === "string" ? req.url : req.url?.raw || "";
      eps.push({ method: (req.method || "GET").toUpperCase(), path: url, name: i.name });
    });
    walk(data.item);
  }
  return eps;
};

const detectDependencies = (services) => {
  const deps = [];
  services.forEach((sA) => {
    services.forEach((sB) => {
      if (sA.id === sB.id) return;
      // Check if any endpoint in sA references sB's base URL or service name
      const bName = sB.name.toLowerCase().replace(/\s+/g, "");
      const bBase = sB.baseUrl?.replace(/^https?:\/\//, "").split("/")[0] || "";
      sA.endpoints.forEach((ep) => {
        const pathLower = ep.path.toLowerCase();
        if ((bBase && pathLower.includes(bBase)) || pathLower.includes(bName) || pathLower.includes(`/${bName}/`)) {
          const existing = deps.find((d) => d.from === sA.id && d.to === sB.id);
          if (!existing) {
            deps.push({ from: sA.id, to: sB.id, endpoints: [ep], reason: `Calls ${sB.name}` });
          } else {
            existing.endpoints.push(ep);
          }
        }
      });
    });
  });
  return deps;
};

const MultiServiceGraph = ({ onBack }) => {
  const [services, setServices] = useState([]);
  const [addText, setAddText] = useState("");
  const [addName, setAddName] = useState("");
  const [error, setError] = useState("");
  const [analyzed, setAnalyzed] = useState(false);

  const addService = () => {
    setError("");
    const data = tryParse(addText);
    if (!data) { setError("Invalid JSON/YAML"); return; }
    const name = addName.trim() || data.info?.title || data.info?.name || `Service ${services.length + 1}`;
    const baseUrl = data.servers?.[0]?.url || (data.host ? `${data.schemes?.[0] || "https"}://${data.host}` : "");
    const endpoints = extractServiceEndpoints(data);
    setServices((prev) => [...prev, {
      id: `svc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name, baseUrl, endpoints, data,
      color: COLORS[services.length % COLORS.length],
    }]);
    setAddText(""); setAddName("");
  };

  const removeService = (id) => { setServices((prev) => prev.filter((s) => s.id !== id)); setAnalyzed(false); };

  const dependencies = useMemo(() => analyzed ? detectDependencies(services) : [], [services, analyzed]);

  const impactOf = (serviceId) => {
    const affected = new Set();
    const queue = [serviceId];
    while (queue.length) {
      const curr = queue.shift();
      dependencies.forEach((d) => {
        if (d.to === curr && !affected.has(d.from)) { affected.add(d.from); queue.push(d.from); }
      });
    }
    return affected;
  };

  const [hoveredService, setHoveredService] = useState(null);
  const impacted = useMemo(() => hoveredService ? impactOf(hoveredService) : new Set(), [hoveredService, dependencies]);

  return (
    <div className="flex-1 overflow-auto" style={{ animation: "fadeIn 0.3s ease-out both", minHeight: "100dvh" }}>
      <div className="fixed inset-0 pointer-events-none mesh-gradient-bg" style={{ zIndex: 0 }} />
      <div className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-4 mb-8">
          <button onClick={onBack} className="p-2 hover:bg-[#22262b] rounded-lg text-[#a9abb0] hover:text-white transition-all group">
            <ArrowLeft size={18} className="group-hover:-translate-x-0.5 transition-transform" />
          </button>
          <div>
            <h1 className="text-2xl font-extrabold text-white flex items-center gap-3">
              <Network size={24} className="text-[#e08efe]" /> Multi-Service Dependencies
            </h1>
            <p className="text-sm text-[#73757a] mt-1">Upload specs from multiple microservices to map cross-service dependencies and analyze impact.</p>
          </div>
        </div>

        {/* Add service form */}
        <div className="rounded-xl border border-[#46484c]/20 p-5 mb-6" style={{ background: "rgba(12,14,18,0.7)" }}>
          <div className="flex items-center gap-3 mb-3">
            <input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="Service Name (auto-detect)"
              className="w-48 bg-[#22262b]/60 border border-[#46484c]/30 rounded-lg px-3 py-2 text-sm text-white placeholder:text-[#46484c] focus:border-[#e08efe]/50 transition-all" />
            <button onClick={addService} disabled={!addText.trim()}
              className="px-5 py-2 rounded-lg text-sm font-bold text-[#0c0e12] bg-[#e08efe] hover:bg-[#ce7eec] transition-all active:scale-[0.97] disabled:opacity-40 flex items-center gap-2">
              <Plus size={14} /> Add Service
            </button>
            {error && <span className="text-xs text-[#ff6e84] flex items-center gap-1"><AlertTriangle size={12} />{error}</span>}
          </div>
          <textarea value={addText} onChange={(e) => { setAddText(e.target.value); setError(""); }} placeholder="Paste service API spec (JSON/YAML)..." spellCheck={false}
            className="w-full bg-[#22262b]/40 border border-[#46484c]/20 rounded-lg p-4 font-mono text-xs text-[#f8f9fe] placeholder:text-[#46484c] focus:border-[#e08efe]/40 transition-all resize-none" style={{ minHeight: 100, caretColor: "#e08efe" }} />
        </div>

        {/* Service cards */}
        {services.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
            {services.map((svc, i) => {
              const isImpacted = impacted.has(svc.id);
              return (
                <div key={svc.id}
                  className={`rounded-xl border p-4 transition-all duration-200 cursor-default ${
                    hoveredService === svc.id ? "border-[#ff6e84]/50 bg-[#ff6e84]/5 shadow-lg" :
                    isImpacted ? "border-[#fbbf24]/40 bg-amber-500/5" :
                    "border-[#46484c]/20 bg-[#171a1e]/40 hover:bg-[#171a1e]/60"
                  }`}
                  style={{ animation: `slideInUp 0.2s ease-out ${i * 50}ms both` }}
                  onMouseEnter={() => analyzed && setHoveredService(svc.id)}
                  onMouseLeave={() => setHoveredService(null)}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: svc.color }} />
                      <span className="text-sm font-bold text-white">{svc.name}</span>
                    </div>
                    <button onClick={() => removeService(svc.id)} className="p-1 text-[#46484c] hover:text-[#ff6e84] transition-colors"><Trash2 size={13} /></button>
                  </div>
                  {svc.baseUrl && <p className="text-[10px] text-[#46484c] font-mono truncate mb-2">{svc.baseUrl}</p>}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[#73757a] bg-[#22262b] px-2 py-0.5 rounded">{svc.endpoints.length} endpoints</span>
                    {isImpacted && <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">Affected</span>}
                    {hoveredService === svc.id && <span className="text-[10px] font-bold text-[#ff6e84] bg-[#ff6e84]/10 px-2 py-0.5 rounded">Target</span>}
                  </div>
                  {/* Outgoing deps */}
                  {analyzed && dependencies.filter((d) => d.from === svc.id).map((dep) => {
                    const target = services.find((s) => s.id === dep.to);
                    return (
                      <div key={dep.to} className="mt-2 flex items-center gap-1.5 text-[10px] text-[#a9abb0]">
                        <ArrowRight size={10} className="text-[#e08efe]" />
                        <span>Calls <strong className="text-white">{target?.name}</strong></span>
                        <span className="text-[#46484c]">({dep.endpoints.length} endpoint{dep.endpoints.length > 1 ? "s" : ""})</span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {/* Analyze button */}
        {services.length >= 2 && (
          <div className="mb-8">
            <button onClick={() => setAnalyzed(true)}
              className="px-8 py-3 rounded-xl text-sm font-bold uppercase tracking-widest bg-[#e08efe] text-[#0c0e12] hover:bg-[#ce7eec] transition-all active:scale-[0.97] btn-shimmer flex items-center gap-2"
              style={{ boxShadow: "0 12px 24px -6px rgba(224,142,254,0.3)" }}>
              <Network size={16} /> Analyze Dependencies
            </button>
          </div>
        )}

        {/* Dependency matrix */}
        {analyzed && services.length >= 2 && (
          <div style={{ animation: "slideInUp 0.3s ease-out both" }}>
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Link2 size={18} className="text-[#e08efe]" /> Dependency Map</h2>

            {dependencies.length === 0 ? (
              <div className="text-center py-12 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
                <Globe size={32} className="mx-auto mb-2 text-emerald-400" />
                <p className="text-emerald-400 font-bold">No cross-service dependencies detected</p>
                <p className="text-xs text-[#73757a] mt-1">Services appear to be independent</p>
              </div>
            ) : (
              <>
                {/* Matrix table */}
                <div className="overflow-x-auto rounded-xl border border-[#46484c]/20 mb-6">
                  <table className="w-full text-xs">
                    <thead>
                      <tr>
                        <th className="p-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#73757a] bg-[#171a1e]">From / To</th>
                        {services.map((s) => (
                          <th key={s.id} className="p-3 text-center text-[10px] font-bold uppercase tracking-widest bg-[#171a1e]" style={{ color: s.color }}>{s.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {services.map((sFrom) => (
                        <tr key={sFrom.id} className="border-t border-[#46484c]/10">
                          <td className="p-3 font-bold" style={{ color: sFrom.color }}>{sFrom.name}</td>
                          {services.map((sTo) => {
                            const dep = dependencies.find((d) => d.from === sFrom.id && d.to === sTo.id);
                            return (
                              <td key={sTo.id} className="p-3 text-center">
                                {sFrom.id === sTo.id ? <span className="text-[#46484c]">—</span> : dep ? (
                                  <span className="text-xs font-bold text-[#e08efe] bg-[#e08efe]/10 px-2 py-0.5 rounded">{dep.endpoints.length}</span>
                                ) : <span className="text-[#46484c]">·</span>}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Impact analysis hint */}
                <div className="p-4 rounded-xl border border-[#46484c]/20 bg-[#171a1e]/30">
                  <p className="text-xs text-[#a9abb0]"><Zap size={12} className="inline text-[#e08efe] mr-1" /><strong>Impact Analysis:</strong> Hover over a service card above to see which services would be affected if it goes down. <span className="text-amber-400">Amber</span> = affected, <span className="text-[#ff6e84]">Red</span> = hovered target.</p>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MultiServiceGraph;
