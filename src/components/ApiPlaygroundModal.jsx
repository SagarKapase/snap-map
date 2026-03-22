import { useState } from "react";
import { X, Send, Plus, Trash2, Globe, RefreshCw, AlertCircle, CheckCircle, Copy, Terminal } from "lucide-react";
import { methodColor } from "../utils/constants";

const ApiPlaygroundModal = ({ node, onClose }) => {
  const [method, setMethod] = useState(node?.method || "GET");
  const [url, setUrl] = useState(node?.path || "");
  const [headers, setHeaders] = useState([
    { key: "Content-Type", value: "application/json" },
    { key: "Accept", value: "*/*" },
  ]);
  const [body, setBody] = useState(node?.body ? JSON.stringify(node.body, null, 2) : "");
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [reqError, setReqError] = useState("");
  const [curlCopied, setCurlCopied] = useState(false);
  const [activeTab, setActiveTab] = useState("headers");

  const methodOptions = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
  const mc = methodColor(method);

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
      setResponse({ status: res.status, statusText: res.statusText, elapsed, data, isJson: typeof data === "object" });
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

  const statusColor = (s) => {
    if (!s) return "text-[#a9abb0]";
    if (s < 300) return "text-[#81ecff]";
    if (s < 400) return "text-amber-400";
    return "text-[#ff6e84]";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ animation: "fadeIn 0.25s ease-out both" }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-4xl border border-[#46484c]/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: "90vh", animation: "scaleIn 0.3s cubic-bezier(0.34,1.56,0.64,1) both", background: "rgba(12,14,18,0.95)", backdropFilter: "blur(20px)" }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#46484c]/30 flex-shrink-0 bg-[#111417]/80">
          <Terminal size={18} className="text-[#e08efe]" />
          <span className="font-bold text-white text-base">API Playground</span>
          <span className="text-[#73757a] text-sm">—</span>
          <span className="text-[#a9abb0] text-sm truncate">{node?.name}</span>
          <button onClick={onClose} className="ml-auto p-1.5 hover:bg-[#22262b] rounded-lg transition-all duration-200 hover:scale-110">
            <X size={18} className="text-[#a9abb0] hover:text-white transition-colors" />
          </button>
        </div>

        {/* URL bar */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-[#46484c]/20 flex-shrink-0 bg-[#111417]/40">
          <select value={method} onChange={(e) => setMethod(e.target.value)}
            className={`bg-[#22262b] border border-[#46484c]/40 rounded-lg px-3 py-2 text-sm font-bold ${mc.text} focus:outline-none focus:border-[#e08efe] flex-shrink-0 cursor-pointer transition-all duration-200`}>
            {methodOptions.map((m) => (<option key={m} value={m} className="text-white">{m}</option>))}
          </select>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.example.com/endpoint"
            className="flex-1 bg-[#22262b]/60 border border-[#46484c]/30 hover:border-[#46484c]/60 focus:border-[#e08efe] focus:ring-1 focus:ring-[#e08efe]/30 rounded-lg px-4 py-2 text-sm text-white font-mono placeholder:text-[#73757a] transition-all duration-200" />
          <button onClick={handleSend} disabled={loading}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition-all duration-200 active:scale-95 flex-shrink-0 btn-shimmer
              ${loading ? "bg-[#22262b] text-[#73757a] cursor-not-allowed" : "bg-[#e08efe] hover:bg-[#ce7eec] text-[#0c0e12] shadow-lg shadow-[#e08efe]/20 hover:shadow-[#e08efe]/30"}`}>
            {loading ? (<><RefreshCw size={15} className="animate-spin" /> Sending...</>) : (<><Send size={15} /> Send</>)}
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden min-h-0">
          <div className="w-1/2 flex flex-col border-r border-[#46484c]/30">
            <div className="flex border-b border-[#46484c]/20 flex-shrink-0">
              {["headers", "body"].map((t) => (
                <button key={t} onClick={() => setActiveTab(t)}
                  className={`flex-1 py-2.5 text-xs font-semibold uppercase tracking-wider transition-all duration-200 ${
                    activeTab === t ? "text-[#e08efe] border-b-2 border-[#e08efe] bg-[#22262b]/30" : "text-[#73757a] hover:text-[#a9abb0]"
                  }`}>{t}</button>
              ))}
            </div>

            {activeTab === "headers" ? (
              <div className="flex-1 overflow-auto p-4 space-y-2">
                {headers.map((h, i) => (
                  <div key={i} className="flex gap-2 items-center animate-crossfade" style={{ animationDelay: `${i * 40}ms` }}>
                    <input value={h.key} onChange={(e) => updateHeader(i, "key", e.target.value)} placeholder="Key"
                      className="flex-1 bg-[#22262b]/50 border border-[#46484c]/30 hover:border-[#46484c]/60 focus:border-[#e08efe]/70 rounded-lg px-3 py-1.5 text-xs text-[#f8f9fe] font-mono placeholder:text-[#73757a] transition-all duration-200 min-w-0" />
                    <input value={h.value} onChange={(e) => updateHeader(i, "value", e.target.value)} placeholder="Value"
                      className="flex-1 bg-[#22262b]/50 border border-[#46484c]/30 hover:border-[#46484c]/60 focus:border-[#e08efe]/70 rounded-lg px-3 py-1.5 text-xs text-[#f8f9fe] font-mono placeholder:text-[#73757a] transition-all duration-200 min-w-0" />
                    <button onClick={() => removeHeader(i)} className="p-1.5 hover:bg-red-900/30 rounded text-[#73757a] hover:text-[#ff6e84] transition-all duration-200 flex-shrink-0">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
                <button onClick={addHeader} className="flex items-center gap-1.5 text-xs text-[#73757a] hover:text-[#e08efe] transition-colors duration-200 mt-2 group">
                  <Plus size={13} className="group-hover:rotate-90 transition-transform duration-300" /> Add Header
                </button>
              </div>
            ) : (
              <div className="flex-1 relative overflow-hidden p-2">
                <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={'{\n  "key": "value"\n}'} spellCheck={false}
                  className="w-full h-full bg-transparent resize-none text-xs font-mono text-[#f8f9fe] placeholder:text-[#73757a] p-2 focus:outline-none" style={{ lineHeight: "1.7" }} />
              </div>
            )}
          </div>

          {/* Response */}
          <div className="w-1/2 flex flex-col">
            <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[#46484c]/20 flex-shrink-0 bg-[#111417]/30">
              <Globe size={13} className="text-[#73757a]" />
              <span className="text-xs font-semibold text-[#a9abb0] uppercase tracking-wider">Response</span>
              {response && (
                <div className="flex items-center gap-2 ml-auto" style={{ animation: "fadeIn 0.3s ease-out both" }}>
                  <span className={`text-xs font-bold ${statusColor(response.status)}`}>{response.status} {response.statusText}</span>
                  <span className="text-xs text-[#73757a]">{response.elapsed}ms</span>
                </div>
              )}
            </div>
            <div className="flex-1 overflow-auto p-4">
              {loading && (<div className="flex flex-col items-center justify-center h-full gap-3"><RefreshCw size={28} className="text-[#e08efe] animate-spin" /><p className="text-[#73757a] text-sm">Sending request...</p></div>)}
              {!loading && reqError && (<div className="bg-[#ff6e84]/10 border border-[#ff6e84]/20 rounded-lg p-4 animate-crossfade"><div className="flex items-start gap-2"><AlertCircle size={16} className="text-[#ff6e84] flex-shrink-0 mt-0.5" /><p className="text-sm text-[#ff6e84] leading-relaxed">{reqError}</p></div></div>)}
              {!loading && !reqError && response && (<div className="animate-crossfade"><pre className="text-xs font-mono text-[#f8f9fe] whitespace-pre-wrap break-words leading-relaxed">{response.isJson ? JSON.stringify(response.data, null, 2) : response.data}</pre></div>)}
              {!loading && !reqError && !response && (<div className="flex flex-col items-center justify-center h-full text-center gap-2"><Send size={32} className="text-[#46484c]" /><p className="text-[#73757a] text-sm">Hit Send to see the response</p></div>)}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-[#46484c]/30 flex-shrink-0 bg-[#111417]/50">
          <button onClick={handleCopyCurl} className="flex items-center gap-2 text-xs text-[#a9abb0] hover:text-[#e08efe] transition-all duration-200 group font-mono">
            {curlCopied ? (<><CheckCircle size={13} className="text-[#81ecff]" /><span className="text-[#81ecff]">Copied!</span></>) : (<><Copy size={13} className="group-hover:scale-110 transition-transform duration-200" /> Copy as cURL</>)}
          </button>
          <p className="text-xs text-[#73757a]">CORS restrictions may apply when calling external APIs</p>
        </div>
      </div>
    </div>
  );
};

export default ApiPlaygroundModal;
