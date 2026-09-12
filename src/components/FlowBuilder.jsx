import { useState, useCallback } from "react";
import {
  X, Play, Plus, Trash2, ChevronDown, ChevronUp, GripVertical,
  ArrowRight, Variable, AlertCircle, CheckCircle, Loader2,
  Copy, Download, RotateCcw, Zap,
} from "lucide-react";
import { resolveText } from "../utils/variables";

const METHOD_BADGE_CLS = {
  GET: "bg-emerald-600/20 text-emerald-400",
  POST: "bg-amber-600/20 text-amber-400",
  PUT: "bg-blue-600/20 text-blue-400",
  PATCH: "bg-purple-600/20 text-purple-400",
  DELETE: "bg-red-600/20 text-red-400",
};

const FlowBuilder = ({ nodes, onClose, workspaceVariables = null }) => {
  const requestNodes = nodes.filter((n) => n.type === "request" && n.path);

  // Flow steps: [{ nodeId, overrideUrl, overrideHeaders, extractVars, result }]
  const [steps, setSteps] = useState([]);
  const [running, setRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [variables, setVariables] = useState({}); // extracted variables
  const [showAddPicker, setShowAddPicker] = useState(false);
  const [expandedStep, setExpandedStep] = useState(null);

  const addStep = (node) => {
    setSteps((prev) => [
      ...prev,
      {
        id: `step_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        nodeId: node.id,
        node,
        overrideUrl: "",
        overrideHeaders: "",
        extractVars: [], // [{ name, jsonPath }]
        result: null,
      },
    ]);
    setShowAddPicker(false);
  };

  const removeStep = (stepId) => setSteps((s) => s.filter((x) => x.id !== stepId));

  const moveStep = (idx, dir) => {
    setSteps((prev) => {
      const next = [...prev];
      const targetIdx = idx + dir;
      if (targetIdx < 0 || targetIdx >= next.length) return prev;
      [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
      return next;
    });
  };

  const addExtractVar = (stepId) => {
    setSteps((prev) => prev.map((s) =>
      s.id === stepId ? { ...s, extractVars: [...s.extractVars, { name: "", jsonPath: "" }] } : s,
    ));
  };

  const updateExtractVar = (stepId, varIdx, field, value) => {
    setSteps((prev) => prev.map((s) =>
      s.id === stepId ? {
        ...s,
        extractVars: s.extractVars.map((v, i) => i === varIdx ? { ...v, [field]: value } : v),
      } : s,
    ));
  };

  const removeExtractVar = (stepId, varIdx) => {
    setSteps((prev) => prev.map((s) =>
      s.id === stepId ? { ...s, extractVars: s.extractVars.filter((_, i) => i !== varIdx) } : s,
    ));
  };

  /**
   * Fill in `{{name}}` from the workspace and from earlier steps.
   *
   * This used to build a RegExp per variable per call and read an `activeEnv`
   * prop the workspace never passed, so environment values never resolved
   * here at all. It now shares the resolver the rest of the app uses, which
   * also brings collection and folder variables and the right precedence —
   * with values extracted by earlier steps layered on top, since those are
   * the most specific thing available.
   */
  const substituteVars = useCallback((str) => {
    if (!str) return str;
    const merged = new Map(workspaceVariables || []);
    Object.entries(variables).forEach(([key, value]) => {
      merged.set(key, { key, value: String(value ?? ""), source: "an earlier step" });
    });
    return resolveText(str, merged).text;
  }, [variables, workspaceVariables]);

  // Extract value from JSON response by dot-path (e.g. "data.token")
  const extractByPath = (obj, path) => {
    try {
      return path.split(".").reduce((curr, key) => {
        if (curr === null || curr === undefined) return undefined;
        if (key.includes("[")) {
          const [arrKey, idxStr] = key.split("[");
          const idx = parseInt(idxStr);
          return curr[arrKey]?.[idx];
        }
        return curr[key];
      }, obj);
    } catch { return undefined; }
  };

  const runFlow = async () => {
    setRunning(true);
    setVariables({});
    const newVars = {};
    const updatedSteps = [...steps];

    for (let i = 0; i < updatedSteps.length; i++) {
      setCurrentStep(i);
      const step = updatedSteps[i];
      const url = substituteVars(step.overrideUrl || step.node.path);
      const method = step.node.method || "GET";

      try {
        const headers = {};
        if (step.overrideHeaders) {
          try {
            const parsed = JSON.parse(substituteVars(step.overrideHeaders));
            Object.assign(headers, parsed);
          } catch { /* ignore parse errors */ }
        } else {
          headers["Content-Type"] = "application/json";
        }

        const opts = { method, headers };
        if (["POST", "PUT", "PATCH"].includes(method) && step.node.body) {
          opts.body = substituteVars(
            typeof step.node.body === "string" ? step.node.body : JSON.stringify(step.node.body),
          );
        }

        const t0 = Date.now();
        const res = await fetch(url, opts);
        const elapsed = Date.now() - t0;
        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch { data = text; }

        updatedSteps[i] = {
          ...step,
          result: { status: res.status, statusText: res.statusText, latency: elapsed, data, ok: res.ok },
        };

        // Extract variables
        if (step.extractVars.length > 0 && typeof data === "object") {
          step.extractVars.forEach(({ name, jsonPath }) => {
            if (name && jsonPath) {
              const val = extractByPath(data, jsonPath);
              if (val !== undefined) {
                newVars[name] = typeof val === "string" ? val : JSON.stringify(val);
              }
            }
          });
          Object.assign(variables, newVars);
          setVariables({ ...variables, ...newVars });
        }
      } catch (e) {
        updatedSteps[i] = {
          ...step,
          result: { status: 0, statusText: "Error", latency: 0, data: null, ok: false, error: e.message },
        };
      }
      setSteps([...updatedSteps]);
    }
    setCurrentStep(-1);
    setRunning(false);
  };

  const resetResults = () => {
    setSteps((prev) => prev.map((s) => ({ ...s, result: null })));
    setVariables({});
  };

  const exportAsCurl = () => {
    const cmds = steps.map((step) => {
      const url = step.overrideUrl || step.node.path;
      const method = step.node.method || "GET";
      return `curl -X ${method} "${url}"`;
    });
    navigator.clipboard.writeText(cmds.join("\n\n"));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ animation: "fadeIn 0.2s ease-out both" }}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-3xl rounded-2xl border border-[#222a39]/30 overflow-hidden flex flex-col"
        style={{ maxHeight: "90vh", background: "rgba(12,14,18,0.95)", backdropFilter: "blur(20px)", animation: "scaleIn 0.25s cubic-bezier(0.34,1.56,0.64,1) both" }}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-[#222a39]/20 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap size={18} className="text-[#a855f7]" />
              <h2 className="font-bold text-white text-lg">Test Flow Builder</h2>
              <span className="text-xs text-[#6f7788] bg-[#121824] px-2 py-0.5 rounded-full">{steps.length} steps</span>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-[#121824] rounded-lg transition-colors">
              <X size={16} className="text-[#a4acbc]" />
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="px-6 py-3 border-b border-[#222a39]/15 flex items-center gap-3 flex-shrink-0">
          <button onClick={runFlow} disabled={running || steps.length === 0}
            className="px-4 py-2 rounded-lg text-xs font-bold text-[#080b12] bg-[#a855f7] hover:bg-[#c45cff] transition-all active:scale-[0.97] disabled:opacity-40 flex items-center gap-2">
            {running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
            {running ? `Running ${currentStep + 1}/${steps.length}` : "Run Flow"}
          </button>
          <button onClick={resetResults} disabled={running}
            className="px-3 py-2 rounded-lg text-xs font-semibold text-[#a4acbc] hover:text-white hover:bg-[#121824] transition-all disabled:opacity-40 flex items-center gap-1.5">
            <RotateCcw size={12} /> Reset
          </button>
          <button onClick={exportAsCurl} disabled={steps.length === 0}
            className="px-3 py-2 rounded-lg text-xs font-semibold text-[#a4acbc] hover:text-white hover:bg-[#121824] transition-all disabled:opacity-40 flex items-center gap-1.5 ml-auto">
            <Copy size={12} /> Copy cURL
          </button>

          {/* Extracted variables indicator */}
          {Object.keys(variables).length > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#a855f7]/8 border border-[#a855f7]/20">
              <Variable size={12} className="text-[#a855f7]" />
              <span className="text-[10px] font-bold text-[#a855f7]">{Object.keys(variables).length} vars</span>
            </div>
          )}
        </div>

        {/* Steps list */}
        <div className="flex-1 overflow-auto p-4 space-y-2">
          {steps.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Zap size={36} className="text-[#222a39] mb-3" />
              <p className="text-[#6f7788] text-sm">No steps yet</p>
              <p className="text-[#222a39] text-xs mt-1">Add endpoints from the picker below to build your test flow</p>
            </div>
          ) : (
            steps.map((step, idx) => {
              const isActive = currentStep === idx;
              const badge = METHOD_BADGE_CLS[step.node.method] || "";
              const isExpanded = expandedStep === step.id;

              return (
                <div key={step.id}
                  className={`rounded-xl border transition-all duration-200 ${
                    isActive ? "border-[#a855f7]/50 bg-[#a855f7]/5 shadow-lg shadow-[#a855f7]/10"
                    : step.result?.ok ? "border-[#60a5fa]/20 bg-[#60a5fa]/5"
                    : step.result?.error || (step.result && !step.result.ok) ? "border-[#f43f5e]/20 bg-[#f43f5e]/5"
                    : "border-[#222a39]/20 bg-[#0f141d]/40"
                  }`}
                  style={{ animation: `slideInUp 0.2s ease-out ${idx * 30}ms both` }}
                >
                  <div className="flex items-center gap-3 px-4 py-3">
                    {/* Step number */}
                    <span className="w-6 h-6 rounded-full bg-[#121824] border border-[#222a39]/30 flex items-center justify-center text-[10px] font-bold text-[#a4acbc] flex-shrink-0">
                      {idx + 1}
                    </span>

                    {/* Reorder */}
                    <div className="flex flex-col gap-0.5 flex-shrink-0">
                      <button onClick={() => moveStep(idx, -1)} disabled={idx === 0} className="text-[#222a39] hover:text-[#a4acbc] disabled:opacity-20"><ChevronUp size={10} /></button>
                      <button onClick={() => moveStep(idx, 1)} disabled={idx === steps.length - 1} className="text-[#222a39] hover:text-[#a4acbc] disabled:opacity-20"><ChevronDown size={10} /></button>
                    </div>

                    {/* Method + name */}
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase flex-shrink-0 ${badge}`}>{step.node.method}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{step.node.name}</p>
                      <p className="text-[10px] text-[#222a39] font-mono truncate">{step.overrideUrl || step.node.path}</p>
                    </div>

                    {/* Result */}
                    {step.result && (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {step.result.ok ? (
                          <span className="text-xs font-bold text-[#60a5fa]">{step.result.status} · {step.result.latency}ms</span>
                        ) : (
                          <span className="text-xs font-bold text-[#f43f5e]">{step.result.error || step.result.status}</span>
                        )}
                      </div>
                    )}
                    {isActive && <Loader2 size={14} className="text-[#a855f7] animate-spin flex-shrink-0" />}

                    {/* Expand / Delete */}
                    <button onClick={() => setExpandedStep(isExpanded ? null : step.id)} className="p-1 text-[#222a39] hover:text-[#a4acbc] transition-colors flex-shrink-0">
                      <ChevronDown size={14} className={`transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                    </button>
                    <button onClick={() => removeStep(step.id)} className="p-1 text-[#222a39] hover:text-[#f43f5e] transition-colors flex-shrink-0">
                      <Trash2 size={13} />
                    </button>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-1 space-y-3 border-t border-[#222a39]/10 mt-1" style={{ animation: "crossfadeIn 0.2s ease-out both" }}>
                      {/* URL override */}
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-widest text-[#6f7788] block mb-1">URL Override <span className="text-[#222a39]">(supports {"{{var}}"} syntax)</span></label>
                        <input value={step.overrideUrl} onChange={(e) => setSteps((prev) => prev.map((s) => s.id === step.id ? { ...s, overrideUrl: e.target.value } : s))}
                          placeholder={step.node.path}
                          className="w-full bg-[#121824]/50 border border-[#222a39]/20 rounded-lg px-3 py-1.5 text-xs text-white font-mono placeholder:text-[#222a39] focus:border-[#a855f7]/40 transition-all" />
                      </div>
                      {/* Variable extraction */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-[#6f7788]">Extract Variables</label>
                          <button onClick={() => addExtractVar(step.id)} className="text-[10px] text-[#a855f7] hover:text-[#c45cff] flex items-center gap-1"><Plus size={10} /> Add</button>
                        </div>
                        {step.extractVars.map((v, vi) => (
                          <div key={vi} className="flex gap-2 items-center mb-1.5">
                            <input value={v.name} onChange={(e) => updateExtractVar(step.id, vi, "name", e.target.value)} placeholder="varName"
                              className="flex-1 bg-[#121824]/50 border border-[#222a39]/20 rounded px-2 py-1 text-[10px] text-white font-mono placeholder:text-[#222a39] focus:border-[#a855f7]/40 transition-all" />
                            <ArrowRight size={10} className="text-[#222a39] flex-shrink-0" />
                            <input value={v.jsonPath} onChange={(e) => updateExtractVar(step.id, vi, "jsonPath", e.target.value)} placeholder="data.token"
                              className="flex-1 bg-[#121824]/50 border border-[#222a39]/20 rounded px-2 py-1 text-[10px] text-white font-mono placeholder:text-[#222a39] focus:border-[#a855f7]/40 transition-all" />
                            <button onClick={() => removeExtractVar(step.id, vi)} className="text-[#222a39] hover:text-[#f43f5e] p-0.5"><X size={10} /></button>
                          </div>
                        ))}
                      </div>
                      {/* Response preview */}
                      {step.result?.data && (
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-widest text-[#6f7788] block mb-1">Response</label>
                          <pre className="bg-[#080b12] border border-[#222a39]/15 rounded-lg p-3 text-[10px] font-mono text-[#a4acbc] max-h-32 overflow-auto whitespace-pre-wrap break-words">
                            {typeof step.result.data === "object" ? JSON.stringify(step.result.data, null, 2) : step.result.data}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* Connector arrows between steps */}
          {steps.length > 0 && (
            <div className="flex justify-center py-2">
              <button
                onClick={() => setShowAddPicker(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-[#222a39]/30 text-xs font-bold text-[#6f7788] hover:text-[#a855f7] hover:border-[#a855f7]/30 transition-all"
              >
                <Plus size={14} /> Add Step
              </button>
            </div>
          )}
        </div>

        {/* Add step picker */}
        {(showAddPicker || steps.length === 0) && (
          <div className="border-t border-[#222a39]/20 px-4 py-3 flex-shrink-0" style={{ maxHeight: 200, overflow: "auto" }}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#a4acbc] mb-2">Select endpoint to add</p>
            <div className="space-y-1">
              {requestNodes.map((node) => (
                <button key={node.id} onClick={() => addStep(node)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors text-left">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${METHOD_BADGE_CLS[node.method] || ""}`}>{node.method}</span>
                  <span className="text-xs text-white truncate flex-1">{node.name}</span>
                  <span className="text-[10px] text-[#222a39] font-mono truncate max-w-[200px]">{node.path}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Variables sidebar */}
        {Object.keys(variables).length > 0 && (
          <div className="border-t border-[#222a39]/20 px-6 py-3 flex-shrink-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#a4acbc] mb-2">Extracted Variables</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(variables).map(([key, val]) => (
                <div key={key} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#a855f7]/8 border border-[#a855f7]/15">
                  <Variable size={10} className="text-[#a855f7]" />
                  <span className="text-[10px] font-mono font-bold text-[#a855f7]">{key}</span>
                  <span className="text-[10px] text-[#6f7788]">=</span>
                  <span className="text-[10px] font-mono text-[#a4acbc] max-w-[120px] truncate">{val}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FlowBuilder;
