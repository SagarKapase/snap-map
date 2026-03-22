import { useState } from "react";
import { Lock, Layers, Copy, CheckCircle, ChevronRight } from "lucide-react";
import { methodColor } from "../utils/constants";

const GraphCard = ({
  node,
  position,
  isSelected,
  isDragging,
  isHighlighted,
  isCollapsed,
  onMouseDown,
  onSelect,
  onCopy,
  onToggleCollapse,
  entranceDelay = 0,
}) => {
  const [copyDone, setCopyDone] = useState(false);
  const [hovered, setHovered] = useState(false);

  const mc = node.type === "request" ? methodColor(node.method) : null;

  const handleCopy = (e) => {
    e.stopPropagation();
    if (!node.path) return;
    navigator.clipboard.writeText(node.path);
    setCopyDone(true);
    setTimeout(() => setCopyDone(false), 2000);
    onCopy?.();
  };

  const handleCollapseClick = (e) => {
    e.stopPropagation();
    onToggleCollapse?.(node.id);
  };

  return (
    <div
      className={`absolute pointer-events-none node-position-transition ${isDragging ? "dragging" : ""}`}
      style={{
        left: position.x,
        top: position.y,
        zIndex: isSelected ? 50 : isDragging ? 45 : hovered ? 30 : 10,
        animation: `nodeEntrance 0.45s cubic-bezier(0.22,1,0.36,1) ${entranceDelay}ms both`,
      }}
    >
      <div
        className="pointer-events-auto"
        style={{
          transform: isSelected
            ? "scale(1.06)"
            : hovered
              ? "scale(1.02)"
              : "scale(1)",
          transition: isDragging
            ? "none"
            : "transform 0.2s cubic-bezier(0.34,1.56,0.64,1)",
          willChange: "transform",
        }}
        onMouseDown={onMouseDown}
        onClick={onSelect}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* ── Root node ── */}
        {node.type === "root" ? (
          <div
            className={`w-60 rounded-2xl cursor-grab active:cursor-grabbing backdrop-blur-sm p-4 group transition-all duration-300 relative overflow-hidden
              ${
                isSelected
                  ? "border-2 border-[#e08efe] bg-gradient-to-br from-[#1c2025] to-[#111417] shadow-2xl shadow-[#e08efe]/30"
                  : isHighlighted
                    ? "border-2 border-[#e08efe]/50 bg-gradient-to-br from-[#1c2025]/90 to-[#111417]/90 shadow-lg shadow-[#e08efe]/15"
                    : "border border-[#e08efe]/20 bg-gradient-to-br from-[#1c2025]/80 to-[#111417]/80 hover:border-[#e08efe]/40 hover:shadow-xl hover:shadow-[#e08efe]/10"
              }`}
          >
            <div className="absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-[#e08efe]/50 to-transparent" />
            {isSelected && (
              <div
                className="absolute -inset-8 rounded-full pointer-events-none animate-spotlight"
                style={{
                  background:
                    "radial-gradient(circle, rgba(224,142,254,0.08) 0%, transparent 70%)",
                }}
              />
            )}
            <div className="flex items-center gap-2.5 mb-3">
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-300
                  ${isSelected ? "bg-[#e08efe]/25 border border-[#e08efe]/40" : "bg-[#e08efe]/10 border border-[#e08efe]/20 group-hover:border-[#e08efe]/40"}`}
              >
                <Lock
                  size={13}
                  className={`transition-colors duration-300 ${isSelected || hovered ? "text-[#e08efe]" : "text-[#ce7eec]"}`}
                />
              </div>
              <span className="text-xs font-bold text-[#e08efe]/80 uppercase tracking-widest">
                Root API
              </span>
            </div>
            <h3 className="text-base font-bold text-white mb-2.5 group-hover:text-[#e08efe] transition-colors duration-300 truncate leading-tight">
              {node.name}
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#a9abb0] bg-[#171a1e] border border-[#46484c]/40 rounded-md px-2 py-0.5 font-mono">
                {node.version}
              </span>
              <span className="text-xs text-[#e08efe]/70 font-semibold">
                {node.itemCount} nodes
              </span>
            </div>
          </div>
        ) : node.type === "folder" ? (
          /* ── Folder node ── */
          <div
            className={`w-52 rounded-xl cursor-grab active:cursor-grabbing backdrop-blur-sm p-3.5 group transition-all duration-300
              ${
                isSelected
                  ? "border-2 border-[#3aa2ff]/60 bg-[#171a1e]/95 shadow-xl shadow-[#3aa2ff]/20"
                  : isHighlighted
                    ? "border border-[#46484c]/70 bg-[#171a1e]/80 shadow-md"
                    : "border border-[#46484c]/40 bg-[#171a1e]/60 hover:border-[#46484c]/70 hover:bg-[#171a1e]/80 hover:shadow-lg"
              }`}
          >
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-[#3aa2ff]/10 border border-[#3aa2ff]/20 flex items-center justify-center flex-shrink-0">
                  <Layers size={11} className="text-[#3aa2ff]" />
                </div>
                <span className="text-xs font-bold text-[#a9abb0] uppercase tracking-wider">
                  Folder
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs bg-[#22262b] border border-[#46484c]/40 text-[#a9abb0] px-2 py-0.5 rounded-full font-bold tabular-nums">
                  {node.itemCount}
                </span>
                {onToggleCollapse && node.itemCount > 0 && (
                  <button
                    onClick={handleCollapseClick}
                    className="p-0.5 hover:bg-[#46484c]/30 rounded transition-all duration-200"
                  >
                    <ChevronRight
                      size={12}
                      className={`text-[#a9abb0] hover:text-[#3aa2ff] transition-all duration-300 ${
                        isCollapsed ? "" : "rotate-90"
                      }`}
                    />
                  </button>
                )}
              </div>
            </div>
            <h3 className="text-sm font-semibold text-white group-hover:text-[#3aa2ff] transition-colors duration-300 truncate">
              {node.name}
            </h3>
            {isCollapsed && (
              <p className="text-xs text-[#73757a] mt-1.5 italic">
                {node.itemCount} items collapsed
              </p>
            )}
          </div>
        ) : (
          /* ── Request node ── */
          <div
            className={`w-64 rounded-xl cursor-grab active:cursor-grabbing backdrop-blur-sm group transition-all duration-300 overflow-hidden
              ${
                isSelected
                  ? "border border-[#46484c]/60 bg-[#171a1e]/95 shadow-xl"
                  : isHighlighted
                    ? "border border-[#46484c]/50 bg-[#171a1e]/80 shadow-md"
                    : "border border-[#46484c]/30 bg-[#171a1e]/60 hover:border-[#46484c]/50 hover:bg-[#171a1e]/80 hover:shadow-lg"
              }`}
          >
            {mc && <div className={`h-0.5 w-full ${mc.badge}`} />}
            <div className="p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                {mc && (
                  <span
                    className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${mc.bg} ${mc.text} uppercase flex-shrink-0 transition-all duration-300 ${isSelected ? `shadow-md ${mc.glow}` : ""}`}
                  >
                    {node.method}
                  </span>
                )}
                <span className="text-xs text-[#73757a] uppercase opacity-0 group-hover:opacity-100 transition-opacity duration-300 tracking-wider ml-auto">
                  Request
                </span>
              </div>
              <h3 className="text-sm font-semibold text-white mb-2 group-hover:text-[#f8f9fe] transition-colors duration-300 line-clamp-2 leading-snug">
                {node.name}
              </h3>
              {node.path && (
                <div className="flex items-center gap-1.5">
                  <p className="text-xs text-[#81ecff]/70 font-mono truncate flex-1 group-hover:text-[#81ecff] transition-colors duration-300">
                    {node.path}
                  </p>
                  <button
                    onClick={handleCopy}
                    className="opacity-0 group-hover:opacity-100 transition-all duration-300 p-1 hover:bg-[#46484c]/30 rounded flex-shrink-0 hover:scale-110"
                  >
                    {copyDone ? (
                      <CheckCircle size={11} className="text-emerald-400" />
                    ) : (
                      <Copy
                        size={11}
                        className="text-[#73757a] hover:text-[#a9abb0] transition-colors"
                      />
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GraphCard;
