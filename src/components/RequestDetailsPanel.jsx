import { useState, useEffect } from "react";
import { X, Copy, Play, Share2, Eye, Zap, CheckCircle } from "lucide-react";
import { methodColor } from "../utils/constants";

const RequestDetailsPanel = ({ node, onClose, onTest }) => {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => { setActiveTab("overview"); }, [node?.id]);

  const copyText = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!node || node.type !== "request") {
    return (
      <div
        className="w-80 border-l border-[#46484c]/30 flex flex-col items-center justify-center transition-all duration-500"
        style={{ background: "linear-gradient(to bottom, rgba(12,14,18,0.8), rgba(12,14,18,0.6))", backdropFilter: "blur(12px)" }}
      >
        <div style={{ animation: "scaleIn 0.4s ease-out both" }} className="text-center p-8">
          <div className="w-16 h-16 rounded-2xl bg-[#22262b]/50 flex items-center justify-center mx-auto mb-4">
            <Eye size={28} className="text-[#73757a]" />
          </div>
          <p className="text-[#73757a] text-sm">Select a request node<br />to view its details</p>
        </div>
      </div>
    );
  }

  const mc = methodColor(node.method);
  const tabs = ["overview", "headers", "body", "docs"];

  return (
    <div
      className="w-80 border-l border-[#46484c]/30 flex flex-col transition-all duration-300"
      style={{
        animation: "slideInRight 0.35s cubic-bezier(0.34,1.56,0.64,1) both",
        background: "linear-gradient(to bottom, rgba(12,14,18,0.9), rgba(12,14,18,0.7))",
        backdropFilter: "blur(16px)",
      }}
    >
      {/* Panel header */}
      <div className="px-4 py-3.5 border-b border-[#46484c]/30 flex items-center justify-between flex-shrink-0 backdrop-blur" style={{ background: "rgba(17,20,23,0.6)" }}>
        <div>
          <p className="text-[10px] font-bold text-[#a9abb0] uppercase tracking-widest">Request Details</p>
          <p className="text-base font-bold text-[#e08efe] mt-0.5 truncate">{node.name}</p>
        </div>
        <button onClick={onClose} className="p-1.5 hover:bg-[#22262b] rounded-lg transition-all duration-200 hover:scale-110">
          <X size={17} className="text-[#a9abb0] hover:text-white transition-colors" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#46484c]/30 flex-shrink-0" style={{ background: "rgba(17,20,23,0.3)" }}>
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2.5 text-xs font-semibold uppercase tracking-wider transition-all duration-200 relative ${
              activeTab === tab ? "text-[#e08efe]" : "text-[#73757a] hover:text-[#a9abb0]"
            }`}
          >
            {tab}
            {activeTab === tab && (
              <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-[#e08efe] rounded-full animate-pill" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {activeTab === "overview" && (
          <div className="p-5 space-y-5 animate-crossfade">
            <div>
              <span className={`inline-block text-xs font-bold px-3 py-1 rounded-full uppercase ${mc.bg} ${mc.text}`}>{node.method}</span>
              <h3 className="text-lg font-bold text-white mt-2">{node.name}</h3>
            </div>

            {node.path && (
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <p className="text-[10px] font-semibold text-[#a9abb0] uppercase tracking-wider">Endpoint</p>
                  <button onClick={() => copyText(node.path)} className="text-xs text-[#e08efe] hover:text-[#ce7eec] flex items-center gap-1 transition-all duration-200 hover:scale-105">
                    {copied ? <CheckCircle size={11} /> : <Copy size={11} />}
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
                <div className="bg-[#171a1e] border border-[#46484c]/30 rounded-lg p-3 hover:border-[#46484c]/50 transition-colors duration-200 border-l-4 border-l-[#e08efe]">
                  <p className="text-xs text-[#81ecff] font-mono break-all">{node.path}</p>
                </div>
              </div>
            )}

            <div className="bg-[#171a1e]/60 border border-[#46484c]/20 rounded-lg p-4 hover:border-[#46484c]/40 transition-colors duration-200">
              <div className="flex items-center gap-2 mb-3">
                <Zap size={14} className="text-[#e08efe] animate-pulse" />
                <p className="text-sm font-semibold text-white">Quick Status</p>
              </div>
              {[
                { label: "Method", value: node.method, cls: "text-white font-semibold" },
                { label: "Status", value: (<span className="text-[#81ecff] font-semibold flex items-center gap-1"><span className="w-1.5 h-1.5 bg-[#81ecff] rounded-full animate-pulse inline-block" />Healthy</span>) },
                { label: "Auth", value: (<span className="text-amber-400 font-semibold">Required</span>) },
              ].map(({ label, value, cls }) => (
                <div key={label} className="flex justify-between text-sm py-1 border-b border-[#22262b]/50 last:border-0">
                  <span className="text-[#a9abb0]">{label}</span>
                  <span className={cls}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "headers" && (
          <div className="p-5 space-y-3 animate-crossfade">
            {node.headers?.length ? (
              <>
                <p className="text-xs font-semibold text-[#a9abb0] uppercase tracking-wider flex justify-between">
                  Headers
                  <span className="text-[#e08efe] bg-[#e08efe]/10 px-2 py-0.5 rounded-full">{node.headers.length} Active</span>
                </p>
                {node.headers.map((h, i) => (
                  <div key={i} className="bg-[#171a1e]/50 border border-[#46484c]/20 rounded-lg p-3 hover:border-[#46484c]/40 transition-colors duration-200 animate-crossfade" style={{ animationDelay: `${i * 50}ms` }}>
                    <p className="text-xs font-semibold text-[#a9abb0] mb-0.5">{h.key}</p>
                    <p className="text-xs text-[#f8f9fe] font-mono break-all">{h.value}</p>
                  </div>
                ))}
              </>
            ) : (
              <p className="text-[#73757a] text-sm text-center py-10">No headers configured</p>
            )}
          </div>
        )}

        {activeTab === "body" && (
          <div className="p-5 space-y-3 animate-crossfade">
            {node.body ? (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-[#a9abb0] uppercase tracking-wider">Request Body</p>
                  <button onClick={() => copyText(JSON.stringify(node.body, null, 2))} className="text-xs text-[#e08efe] hover:text-[#ce7eec] flex items-center gap-1 transition-all duration-200">
                    {copied ? <CheckCircle size={11} /> : <Copy size={11} />}
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
                <pre className="bg-[#171a1e] border border-[#46484c]/20 rounded-lg p-3 text-xs font-mono text-[#f8f9fe] overflow-auto max-h-72 whitespace-pre-wrap break-words hover:border-[#46484c]/40 transition-colors duration-200">
                  {JSON.stringify(node.body, null, 2)}
                </pre>
              </>
            ) : (
              <p className="text-[#73757a] text-sm text-center py-10">No request body</p>
            )}
          </div>
        )}

        {activeTab === "docs" && (
          <div className="p-5 space-y-4 animate-crossfade">
            {node.description ? (
              <div className="bg-[#171a1e]/50 border border-[#46484c]/20 rounded-lg p-4 hover:border-[#46484c]/40 transition-colors duration-200">
                <p className="text-sm text-[#f8f9fe] leading-relaxed">{node.description}</p>
              </div>
            ) : (
              <p className="text-[#73757a] text-sm text-center py-10">No documentation available</p>
            )}
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="p-4 border-t border-[#46484c]/30 flex-shrink-0 space-y-2.5" style={{ background: "rgba(17,20,23,0.6)" }}>
        <button
          onClick={onTest}
          className="w-full bg-[#e08efe] hover:bg-[#ce7eec] text-[#0c0e12] font-bold py-2.5 px-4 rounded-lg transition-all duration-250 flex items-center justify-center gap-2 group hover:shadow-lg hover:shadow-[#e08efe]/25 active:scale-95 btn-shimmer"
        >
          <Play size={15} className="group-hover:translate-x-0.5 transition-transform duration-200" />
          Test in Playground
        </button>
        <button className="w-full bg-[#22262b]/60 hover:bg-[#22262b] border border-[#46484c]/30 hover:border-[#46484c]/60 text-white font-semibold py-2.5 px-4 rounded-lg transition-all duration-250 flex items-center justify-center gap-2 active:scale-95">
          <Share2 size={15} />
          Share Request
        </button>
      </div>
    </div>
  );
};

export default RequestDetailsPanel;
