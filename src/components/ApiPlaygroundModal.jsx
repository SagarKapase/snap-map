import { useState, useMemo } from "react";
import { X, Send, Plus, Trash2, Globe, RefreshCw, AlertCircle, CheckCircle, Copy, Terminal, Clock, Wifi, Save } from "lucide-react";
import { methodColor } from "../utils/constants";

const ApiPlaygroundModal = ({ node, onClose, onUpdate, onResponse }) => {
  const [method, setMethod] = useState(node?.method || "GET");
  const [url, setUrl] = useState(node?.path || "");
  // Prefer headers declared by the spec; fall back to sensible client defaults.
  const [headers, setHeaders] = useState(() =>
    node?.headers?.length
      ? node.headers.map((h) => ({ key: h.key, value: h.value }))
      : [
          { key: "Content-Type", value: "application/json" },
          { key: "Accept", value: "*/*" },
        ],
  );
  const [body, setBody] = useState(node?.body ? JSON.stringify(node.body, null, 2) : "");
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [reqError, setReqError] = useState("");
  const [curlCopied, setCurlCopied] = useState(false);
  const [activeTab, setActiveTab] = useState("headers");
  const [responseCopied, setResponseCopied] = useState(false);
  const [updateSaved, setUpdateSaved] = useState(false);

  const methodOptions = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
  const mc = methodColor(method);

  // Track if user changed anything from original node
  const hasChanges = useMemo(() => {
    if (!node) return false;
    if (method !== (node.method || "GET")) return true;
    if (url !== (node.path || "")) return true;
    const origBody = node.body ? JSON.stringify(node.body, null, 2) : "";
    if (body !== origBody) return true;
    return false;
  }, [method, url, body, node]);

  const handleUpdate = () => {
    if (!onUpdate || !node) return;
    let parsedBody = null;
    if (body.trim()) {
      try { parsedBody = JSON.parse(body); } catch { parsedBody = body; }
    }
    onUpdate(node.id, { method, path: url, body: parsedBody });
    setUpdateSaved(true);
    setTimeout(() => setUpdateSaved(false), 2000);
  };

  const addHeader = () => setHeaders((h) => [...h, { key: "", value: "" }]);
  const removeHeader = (i) => setHeaders((h) => h.filter((_, idx) => idx !== i));
  const updateHeader = (i, field, val) => setHeaders((h) => h.map((row, idx) => (idx === i ? { ...row, [field]: val } : row)));

  const handleSend = async () => {
    if (!url.trim()) { setReqError("URL is required"); return; }
    setLoading(true); setReqError(""); setResponse(null);
    try {
      const hObj = {};
      headers.forEach((h) => { if (h.key.trim()) hObj[h.key.trim()] = h.value; });
      const opts = { method, headers: hObj };
      if (["POST", "PUT", "PATCH"].includes(method) && body.trim()) opts.body = body;
      const t0 = Date.now();
      const res = await fetch(url, opts);
      const elapsed = Date.now() - t0;
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = text; }
      const size = new Blob([text]).size;
      const result = { status: res.status, statusText: res.statusText, elapsed, data, isJson: typeof data === "object", size };
      setResponse(result);
      // Surface the real response to the inspector for this endpoint
      if (node?.id) onResponse?.(node.id, { ...result, at: new Date().toISOString() });
    } catch (err) {
      setReqError(err.message.includes("Failed to fetch") ? "Network error — CORS may be blocking this request." : "Request failed: " + err.message);
    } finally { setLoading(false); }
  };

  const handleCopyCurl = () => {
    const h = headers.filter((r) => r.key.trim()).map((r) => `-H "${r.key}: ${r.value}"`).join(" ");
    const b = ["POST", "PUT", "PATCH"].includes(method) && body.trim() ? ` -d '${body.replace(/'/g, "\\'")}' ` : " ";
    navigator.clipboard.writeText(`curl -X ${method} ${h}${b}"${url}"`);
    setCurlCopied(true);
    setTimeout(() => setCurlCopied(false), 2500);
  };

  const handleCopyResponse = () => {
    if (!response) return;
    navigator.clipboard.writeText(response.isJson ? JSON.stringify(response.data, null, 2) : String(response.data));
    setResponseCopied(true);
    setTimeout(() => setResponseCopied(false), 2000);
  };

  const formatBytes = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const statusColor = (s) => {
    if (!s) return { text: "text-[#a9abb0]", bg: "bg-[#46484c]/20" };
    if (s < 300) return { text: "text-[#81ecff]", bg: "bg-[#81ecff]/10" };
    if (s < 400) return { text: "text-amber-400", bg: "bg-amber-400/10" };
    return { text: "text-[#ff6e84]", bg: "bg-[#ff6e84]/10" };
  };

  const responseText = response?.isJson ? JSON.stringify(response.data, null, 2) : String(response?.data || "");
  const lineCount = responseText ? responseText.split("\n").length : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
      style={{ animation: "fadeIn 0.15s ease-out both" }}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />

      {/* Modal */}
      <div
        className="relative w-full max-w-6xl border border-[#46484c]/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{
          height: "min(95vh, 800px)",
          background: "rgba(12,14,18,0.97)",
          backdropFilter: "blur(24px)",
          boxShadow: "0 40px 80px -16px rgba(0,0,0,0.6), 0 0 0 1px rgba(70,72,76,0.15), 0 0 60px -10px rgba(224,142,254,0.08)",
          animation: "playgroundEnter 0.35s cubic-bezier(0.16,1,0.3,1) both",
        }}
      >

        {/* ── Header ── */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-[#46484c]/20 flex-shrink-0" style={{ background: "rgba(17,20,23,0.6)" }}>
          <div className="w-8 h-8 rounded-lg bg-[#e08efe]/10 border border-[#e08efe]/20 flex items-center justify-center">
            <Terminal size={16} className="text-[#e08efe]" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="font-bold text-white text-base">API Playground</span>
            <span className="text-[#46484c] mx-2">—</span>
            <span className="text-[#a9abb0] text-sm truncate">{node?.name}</span>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[#22262b] rounded-lg transition-all duration-200 hover:scale-105 group">
            <X size={18} className="text-[#46484c] group-hover:text-white transition-colors" />
          </button>
        </div>

        {/* ── URL bar ── */}
        <div className="flex items-center gap-3 px-6 py-3.5 border-b border-[#46484c]/15 flex-shrink-0" style={{ background: "rgba(17,20,23,0.3)" }}>
          <select value={method} onChange={(e) => setMethod(e.target.value)}
            className={`bg-[#22262b] border border-[#46484c]/40 rounded-lg px-4 py-2.5 text-sm font-extrabold ${mc.text} focus:outline-none focus:border-[#e08efe] flex-shrink-0 cursor-pointer transition-all duration-200 uppercase tracking-wide`}>
            {methodOptions.map((m) => (<option key={m} value={m} className="text-white">{m}</option>))}
          </select>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.example.com/endpoint"
            className="flex-1 bg-[#22262b]/60 border border-[#46484c]/30 hover:border-[#46484c]/60 focus:border-[#e08efe] focus:ring-1 focus:ring-[#e08efe]/30 rounded-lg px-4 py-2.5 text-sm text-white font-mono placeholder:text-[#46484c] transition-all duration-200" />
          <button onClick={handleSend} disabled={loading}
            className={`flex items-center gap-2.5 px-6 py-2.5 rounded-lg text-sm font-bold transition-all duration-200 active:scale-95 flex-shrink-0
              ${loading ? "bg-[#22262b] text-[#73757a] cursor-not-allowed" : "bg-[#e08efe] hover:bg-[#ce7eec] text-[#0c0e12] shadow-lg shadow-[#e08efe]/20 hover:shadow-[#e08efe]/30"}`}>
            {loading ? (<><RefreshCw size={15} className="animate-spin" /> Sending...</>) : (<><Send size={15} /> Send</>)}
          </button>
        </div>

        {/* ── Main body — request left, response right ── */}
        <div className="flex flex-1 overflow-hidden min-h-0">

          {/* ── Left: Request (Headers + Body tabs) ── */}
          <div className="w-1/2 flex flex-col border-r border-[#46484c]/20">
            <div className="flex border-b border-[#46484c]/15 flex-shrink-0">
              {["headers", "body"].map((t) => (
                <button key={t} onClick={() => setActiveTab(t)}
                  className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest transition-all duration-200 relative ${
                    activeTab === t ? "text-[#e08efe]" : "text-[#46484c] hover:text-[#a9abb0]"
                  }`}>
                  {t}
                  {activeTab === t && <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-[#e08efe] rounded-full" />}
                </button>
              ))}
            </div>

            {activeTab === "headers" ? (
              <div className="flex-1 overflow-auto p-5 space-y-2.5">
                {headers.map((h, i) => (
                  <div key={i} className="flex gap-2 items-center" style={{ animation: `crossfadeIn 0.2s ease-out ${i * 30}ms both` }}>
                    <input value={h.key} onChange={(e) => updateHeader(i, "key", e.target.value)} placeholder="Key"
                      className="flex-1 bg-[#22262b]/50 border border-[#46484c]/25 hover:border-[#46484c]/50 focus:border-[#e08efe]/60 rounded-lg px-3 py-2 text-xs text-[#f8f9fe] font-mono placeholder:text-[#46484c] transition-all duration-200 min-w-0" />
                    <input value={h.value} onChange={(e) => updateHeader(i, "value", e.target.value)} placeholder="Value"
                      className="flex-1 bg-[#22262b]/50 border border-[#46484c]/25 hover:border-[#46484c]/50 focus:border-[#e08efe]/60 rounded-lg px-3 py-2 text-xs text-[#f8f9fe] font-mono placeholder:text-[#46484c] transition-all duration-200 min-w-0" />
                    <button onClick={() => removeHeader(i)} className="p-1.5 hover:bg-[#ff6e84]/10 rounded-lg text-[#46484c] hover:text-[#ff6e84] transition-all duration-200 flex-shrink-0">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
                <button onClick={addHeader} className="flex items-center gap-1.5 text-xs text-[#46484c] hover:text-[#e08efe] transition-colors duration-200 mt-3 group font-semibold">
                  <Plus size={13} className="group-hover:rotate-90 transition-transform duration-300" /> Add Header
                </button>
              </div>
            ) : (
              <div className="flex-1 flex overflow-hidden">
                {/* Line numbers */}
                <div className="flex-shrink-0 py-4 select-none overflow-hidden border-r border-[#46484c]/10" style={{ background: "rgba(0,0,0,0.15)" }}>
                  {(body || "\n").split("\n").map((_, i) => (
                    <div key={i} className="text-right pr-3 pl-3 text-[10px] font-mono leading-[1.8]" style={{ color: "rgba(70,72,76,0.5)" }}>
                      {i + 1}
                    </div>
                  ))}
                </div>
                {/* Textarea */}
                <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={'{\n  "key": "value"\n}'} spellCheck={false}
                  className="flex-1 bg-transparent resize-none text-xs font-mono text-[#f8f9fe] placeholder:text-[#46484c] p-4 focus:outline-none"
                  style={{ lineHeight: "1.8", caretColor: "#e08efe" }} />
              </div>
            )}
          </div>

          {/* ── Right: Response ── */}
          <div className="w-1/2 flex flex-col min-w-0">
            {/* Response header bar */}
            <div className="flex items-center gap-3 px-5 py-3 border-b border-[#46484c]/15 flex-shrink-0" style={{ background: "rgba(17,20,23,0.3)" }}>
              <Globe size={14} className="text-[#46484c]" />
              <span className="text-xs font-bold text-[#73757a] uppercase tracking-widest">Response</span>
              {response && (
                <div className="flex items-center gap-3 ml-auto" style={{ animation: "crossfadeIn 0.3s ease-out both" }}>
                  <span className={`text-xs font-extrabold px-2.5 py-1 rounded-lg ${statusColor(response.status).text} ${statusColor(response.status).bg}`}>
                    {response.status} {response.statusText}
                  </span>
                  <span className="text-[10px] text-[#73757a] flex items-center gap-1 font-mono">
                    <Clock size={10} /> {response.elapsed}ms
                  </span>
                  <span className="text-[10px] text-[#46484c] font-mono">
                    {formatBytes(response.size)}
                  </span>
                  <span className="text-[10px] text-[#46484c] font-mono">
                    {lineCount} lines
                  </span>
                  <button onClick={handleCopyResponse} className="text-[10px] text-[#46484c] hover:text-[#e08efe] transition-colors flex items-center gap-1">
                    {responseCopied ? <><CheckCircle size={10} className="text-[#81ecff]" /> Copied</> : <><Copy size={10} /> Copy</>}
                  </button>
                </div>
              )}
            </div>

            {/* Response body with scrollbar */}
            <div className="flex-1 overflow-auto" style={{
              scrollbarWidth: "thin",
              scrollbarColor: "rgba(70,72,76,0.5) transparent",
            }}>
              {loading && (
                <div className="flex flex-col items-center justify-center h-full gap-4">
                  <div className="relative">
                    <div className="w-12 h-12 border-2 border-[#e08efe]/20 rounded-full" />
                    <div className="absolute inset-0 w-12 h-12 border-2 border-transparent border-t-[#e08efe] rounded-full animate-spin" />
                  </div>
                  <p className="text-[#73757a] text-sm font-medium">Sending request...</p>
                  <p className="text-[#46484c] text-xs">Waiting for response from server</p>
                </div>
              )}

              {!loading && reqError && (
                <div className="p-5" style={{ animation: "crossfadeIn 0.3s ease-out both" }}>
                  <div className="bg-[#ff6e84]/8 border border-[#ff6e84]/15 rounded-xl p-5">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-[#ff6e84]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <AlertCircle size={16} className="text-[#ff6e84]" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[#ff6e84] mb-1">Request Failed</p>
                        <p className="text-xs text-[#a9abb0] leading-relaxed">{reqError}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {!loading && !reqError && response && (
                <div className="flex flex-1 min-h-0 overflow-auto" style={{ animation: "crossfadeIn 0.3s ease-out both" }}>
                  {/* Line numbers */}
                  <div className="flex-shrink-0 py-4 select-none border-r border-[#46484c]/10 sticky left-0" style={{ background: "rgba(0,0,0,0.15)" }}>
                    {responseText.split("\n").map((_, i) => (
                      <div key={i} className="text-right pr-3 pl-3 text-[10px] font-mono leading-[1.8]" style={{ color: "rgba(70,72,76,0.5)" }}>
                        {i + 1}
                      </div>
                    ))}
                  </div>
                  {/* Code */}
                  <pre className="flex-1 p-4 text-xs font-mono text-[#f8f9fe] whitespace-pre-wrap break-words leading-[1.8] overflow-x-auto">
                    {responseText}
                  </pre>
                </div>
              )}

              {!loading && !reqError && !response && (
                <div className="flex flex-col items-center justify-center h-full text-center gap-3">
                  <div className="w-16 h-16 rounded-2xl bg-[#22262b]/30 border border-[#46484c]/15 flex items-center justify-center">
                    <Send size={24} className="text-[#46484c]" />
                  </div>
                  <p className="text-[#73757a] text-sm font-medium">Hit Send to see the response</p>
                  <p className="text-[#46484c] text-xs">Response will appear here with syntax highlighting</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-[#46484c]/20 flex-shrink-0" style={{ background: "rgba(17,20,23,0.5)" }}>
          <div className="flex items-center gap-3">
            <button onClick={handleCopyCurl} className="flex items-center gap-2 text-xs text-[#73757a] hover:text-[#e08efe] transition-all duration-200 group font-mono">
              {curlCopied ? (<><CheckCircle size={13} className="text-[#81ecff]" /><span className="text-[#81ecff]">Copied!</span></>) : (<><Copy size={13} className="group-hover:scale-110 transition-transform duration-200" /> Copy as cURL</>)}
            </button>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-[#46484c] flex items-center gap-1.5 hidden sm:flex">
              <Wifi size={10} /> CORS restrictions may apply
            </span>
            {hasChanges && onUpdate && (
              <button onClick={handleUpdate}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 active:scale-95 ${
                  updateSaved
                    ? "bg-[#81ecff]/15 text-[#81ecff] border border-[#81ecff]/30"
                    : "bg-[#e08efe] text-[#0c0e12] hover:bg-[#ce7eec] shadow-lg shadow-[#e08efe]/15"
                }`}>
                {updateSaved ? (<><CheckCircle size={13} /> Saved</>) : (<><Save size={13} /> Update Endpoint</>)}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Custom animation keyframe */}
      <style>{`
        @keyframes playgroundEnter {
          from { opacity: 0; transform: translateY(30px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
};

export default ApiPlaygroundModal;
