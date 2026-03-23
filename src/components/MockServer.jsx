import { useState, useMemo } from "react";
import {
  X, Copy, Check, Server, Play, Download, RefreshCw,
  ChevronDown, Database, Code, Shuffle, Clock, AlertCircle,
} from "lucide-react";
import { HTTP_METHODS, methodColor } from "../utils/constants";

const METHOD_BADGE = { GET: "bg-emerald-600/20 text-emerald-400", POST: "bg-amber-600/20 text-amber-400", PUT: "bg-blue-600/20 text-blue-400", PATCH: "bg-purple-600/20 text-purple-400", DELETE: "bg-red-600/20 text-red-400" };

// Simple fake data generator
const fakeValue = (type, name) => {
  const n = (name || "").toLowerCase();
  if (n.includes("id")) return Math.floor(Math.random() * 9000) + 1000;
  if (n.includes("email")) return `user${Math.floor(Math.random() * 99)}@example.com`;
  if (n.includes("name") || n.includes("title")) return ["Alice", "Bob", "Charlie", "Diana", "Eve"][Math.floor(Math.random() * 5)];
  if (n.includes("phone")) return `+1-555-${Math.floor(Math.random() * 900) + 100}-${Math.floor(Math.random() * 9000) + 1000}`;
  if (n.includes("url") || n.includes("link")) return "https://example.com/resource";
  if (n.includes("date") || n.includes("created") || n.includes("updated")) return new Date().toISOString();
  if (n.includes("price") || n.includes("amount")) return +(Math.random() * 100).toFixed(2);
  if (n.includes("count") || n.includes("quantity")) return Math.floor(Math.random() * 50);
  if (n.includes("active") || n.includes("enabled") || n.includes("verified")) return Math.random() > 0.5;
  if (n.includes("description") || n.includes("bio")) return "Lorem ipsum dolor sit amet, consectetur adipiscing elit.";
  if (n.includes("status")) return ["active", "pending", "completed", "cancelled"][Math.floor(Math.random() * 4)];
  if (n.includes("token")) return `tok_${Math.random().toString(36).slice(2, 18)}`;
  if (type === "integer" || type === "number") return Math.floor(Math.random() * 1000);
  if (type === "boolean") return Math.random() > 0.5;
  if (type === "array") return [];
  return `sample_${name || "value"}`;
};

const generateMockFromSchema = (schema) => {
  if (!schema) return { message: "OK", status: "success" };
  if (schema.example) return schema.example;
  if (schema.properties) {
    const obj = {};
    Object.entries(schema.properties).forEach(([key, prop]) => {
      if (prop.properties) obj[key] = generateMockFromSchema(prop);
      else if (prop.type === "array" && prop.items) obj[key] = [generateMockFromSchema(prop.items), generateMockFromSchema(prop.items)];
      else obj[key] = fakeValue(prop.type, key);
    });
    return obj;
  }
  if (schema.type === "array" && schema.items) return [generateMockFromSchema(schema.items)];
  return fakeValue(schema.type, "");
};

const extractMockEndpoints = (data) => {
  const eps = [];
  if (!data) return eps;
  if (data.openapi || data.swagger) {
    Object.entries(data.paths || {}).forEach(([path, obj]) => {
      HTTP_METHODS.forEach((m) => {
        const op = obj?.[m]; if (!op) return;
        const resp200 = op.responses?.["200"] || op.responses?.["201"];
        const schema = resp200?.content?.["application/json"]?.schema;
        eps.push({ method: m.toUpperCase(), path, name: op.summary || op.operationId || `${m.toUpperCase()} ${path}`, schema, mockResponse: generateMockFromSchema(schema), statusCode: resp200 ? 200 : 204, delay: 0 });
      });
    });
  } else if (data.info && data.item) {
    const walk = (items) => items.forEach((i) => {
      if (i.item) { walk(i.item); return; }
      const req = i.request || i; const url = typeof req.url === "string" ? req.url : req.url?.raw || "";
      eps.push({ method: (req.method || "GET").toUpperCase(), path: url, name: i.name, schema: null, mockResponse: { message: "OK", data: {} }, statusCode: 200, delay: 0 });
    });
    walk(data.item);
  }
  return eps;
};

const MockServer = ({ collection, onClose }) => {
  const [endpoints, setEndpoints] = useState(() => extractMockEndpoints(collection));
  const [expandedIdx, setExpandedIdx] = useState(null);
  const [copied, setCopied] = useState(null);
  const [globalDelay, setGlobalDelay] = useState(0);
  const [globalStatus, setGlobalStatus] = useState(200);

  const regenerate = (idx) => {
    setEndpoints((prev) => prev.map((ep, i) => i === idx ? { ...ep, mockResponse: generateMockFromSchema(ep.schema) } : ep));
  };

  const regenerateAll = () => {
    setEndpoints((prev) => prev.map((ep) => ({ ...ep, mockResponse: generateMockFromSchema(ep.schema), delay: globalDelay, statusCode: globalStatus })));
  };

  const updateResponse = (idx, json) => {
    try {
      const parsed = JSON.parse(json);
      setEndpoints((prev) => prev.map((ep, i) => i === idx ? { ...ep, mockResponse: parsed } : ep));
    } catch {} // ignore invalid JSON while typing
  };

  const copyMock = (idx) => {
    const ep = endpoints[idx];
    const mock = { method: ep.method, path: ep.path, statusCode: ep.statusCode, delay: ep.delay, response: ep.mockResponse };
    navigator.clipboard.writeText(JSON.stringify(mock, null, 2));
    setCopied(idx); setTimeout(() => setCopied(null), 2000);
  };

  const exportAll = () => {
    const mocks = endpoints.map((ep) => ({ method: ep.method, path: ep.path, name: ep.name, statusCode: ep.statusCode, delay: ep.delay, response: ep.mockResponse }));
    const blob = new Blob([JSON.stringify({ mocks, generatedAt: new Date().toISOString() }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "mock-server-config.json"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ animation: "fadeIn 0.2s ease-out both" }}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-3xl rounded-2xl border border-[#46484c]/30 overflow-hidden flex flex-col"
        style={{ maxHeight: "90vh", background: "rgba(12,14,18,0.95)", backdropFilter: "blur(20px)", animation: "scaleIn 0.25s cubic-bezier(0.34,1.56,0.64,1) both" }}>

        {/* Header */}
        <div className="px-6 py-5 border-b border-[#46484c]/20 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server size={18} className="text-[#e08efe]" />
              <h2 className="font-bold text-white text-lg">Mock Server</h2>
              <span className="text-xs text-[#73757a] bg-[#22262b] px-2 py-0.5 rounded-full">{endpoints.length} endpoints</span>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-[#22262b] rounded-lg transition-colors"><X size={16} className="text-[#a9abb0]" /></button>
          </div>
          <p className="text-xs text-[#73757a] mt-2">Auto-generated mock responses from your API schema. Edit, regenerate, or export.</p>
        </div>

        {/* Controls */}
        <div className="px-6 py-3 border-b border-[#46484c]/15 flex items-center gap-3 flex-shrink-0 flex-wrap">
          <button onClick={regenerateAll} className="px-4 py-2 rounded-lg text-xs font-bold text-[#0c0e12] bg-[#e08efe] hover:bg-[#ce7eec] transition-all active:scale-[0.97] flex items-center gap-2">
            <Shuffle size={13} /> Regenerate All
          </button>
          <button onClick={exportAll} className="px-3 py-2 rounded-lg text-xs font-semibold text-[#a9abb0] hover:text-white hover:bg-[#22262b] border border-[#46484c]/20 transition-all flex items-center gap-1.5">
            <Download size={12} /> Export Config
          </button>
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-[10px] text-[#73757a] uppercase tracking-widest">Delay</span>
            <select value={globalDelay} onChange={(e) => setGlobalDelay(Number(e.target.value))}
              className="bg-[#22262b] border border-[#46484c]/30 rounded px-2 py-1 text-[10px] text-[#a9abb0] focus:outline-none">
              <option value={0}>0ms</option><option value={200}>200ms</option><option value={500}>500ms</option><option value={1000}>1s</option><option value={3000}>3s</option>
            </select>
            <span className="text-[10px] text-[#73757a] uppercase tracking-widest">Status</span>
            <select value={globalStatus} onChange={(e) => setGlobalStatus(Number(e.target.value))}
              className="bg-[#22262b] border border-[#46484c]/30 rounded px-2 py-1 text-[10px] text-[#a9abb0] focus:outline-none">
              <option value={200}>200</option><option value={201}>201</option><option value={400}>400</option><option value={401}>401</option><option value={404}>404</option><option value={500}>500</option>
            </select>
          </div>
        </div>

        {/* Endpoint list */}
        <div className="flex-1 overflow-auto p-4 space-y-2">
          {endpoints.map((ep, idx) => {
            const badge = METHOD_BADGE[ep.method] || "";
            const isExpanded = expandedIdx === idx;
            return (
              <div key={`${ep.method}-${ep.path}-${idx}`}
                className={`rounded-xl border transition-all duration-200 ${isExpanded ? "border-[#e08efe]/30 bg-[#e08efe]/5" : "border-[#46484c]/20 bg-[#171a1e]/40"}`}
                style={{ animation: `slideInUp 0.15s ease-out ${idx * 15}ms both` }}>
                <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => setExpandedIdx(isExpanded ? null : idx)}>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase flex-shrink-0 ${badge}`}>{ep.method}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{ep.name}</p>
                    <p className="text-[10px] text-[#46484c] font-mono truncate">{ep.path}</p>
                  </div>
                  <span className="text-[10px] font-mono text-[#73757a] flex-shrink-0">{ep.statusCode}</span>
                  {ep.delay > 0 && <span className="text-[10px] text-[#46484c] flex items-center gap-0.5"><Clock size={8} />{ep.delay}ms</span>}
                  <button onClick={(e) => { e.stopPropagation(); copyMock(idx); }}
                    className="p-1 text-[#46484c] hover:text-[#e08efe] transition-colors flex-shrink-0">
                    {copied === idx ? <Check size={13} className="text-[#81ecff]" /> : <Copy size={13} />}
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); regenerate(idx); }}
                    className="p-1 text-[#46484c] hover:text-[#e08efe] transition-colors flex-shrink-0">
                    <RefreshCw size={13} />
                  </button>
                  <ChevronDown size={14} className={`text-[#46484c] transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                </div>
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-[#46484c]/10 mt-1 pt-3" style={{ animation: "crossfadeIn 0.2s ease-out both" }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-[#73757a]">Mock Response</span>
                      <div className="flex items-center gap-2">
                        <select value={ep.statusCode} onChange={(e) => setEndpoints((prev) => prev.map((x, i) => i === idx ? { ...x, statusCode: Number(e.target.value) } : x))}
                          className="bg-[#22262b] border border-[#46484c]/20 rounded px-2 py-0.5 text-[10px] text-[#a9abb0] focus:outline-none">
                          {[200, 201, 204, 400, 401, 403, 404, 500].map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <select value={ep.delay} onChange={(e) => setEndpoints((prev) => prev.map((x, i) => i === idx ? { ...x, delay: Number(e.target.value) } : x))}
                          className="bg-[#22262b] border border-[#46484c]/20 rounded px-2 py-0.5 text-[10px] text-[#a9abb0] focus:outline-none">
                          {[0, 100, 200, 500, 1000, 2000, 5000].map((d) => <option key={d} value={d}>{d}ms</option>)}
                        </select>
                      </div>
                    </div>
                    <textarea
                      value={JSON.stringify(ep.mockResponse, null, 2)}
                      onChange={(e) => updateResponse(idx, e.target.value)}
                      spellCheck={false}
                      className="w-full bg-[#0c0e12] border border-[#46484c]/15 rounded-lg p-3 font-mono text-[10px] text-[#a9abb0] resize-none focus:outline-none focus:border-[#e08efe]/30 transition-all"
                      style={{ minHeight: 120, lineHeight: "1.7", caretColor: "#e08efe" }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default MockServer;
