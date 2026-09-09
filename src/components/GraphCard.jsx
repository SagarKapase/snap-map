import { useState } from "react";
import { Copy, Check, ChevronRight, Boxes, Layers } from "lucide-react";
import { methodColor } from "../utils/constants";
import MethodBadge from "./workspace/MethodBadge";
import { displayPath } from "../utils/format";

// Card sizes are mirrored by the layout maths in PostmanGraphViewer and by
// ConnectionLines — keep width/min-height in sync with CARD_DIM there.
const SHELL = {
  root: "w-60 min-h-[110px]",
  folder: "w-52 min-h-[80px]",
  request: "w-64 min-h-[85px]",
};

const GraphCard = ({
  node,
  position,
  isSelected,
  isDragging,
  isHighlighted,
  isCollapsed,
  isDimmed,
  onMouseDown,
  onSelect,
  onCopy,
  onHoverChange,
  onToggleCollapse,
  entranceDelay = 0,
}) => {
  const [copyDone, setCopyDone] = useState(false);
  const [hovered, setHovered] = useState(false);

  const mc = node.type === "request" ? methodColor(node.method) : null;

  const handleCopy = (e) => {
    e.stopPropagation();
    if (!node.path) return;
    navigator.clipboard?.writeText(node.path);
    setCopyDone(true);
    setTimeout(() => setCopyDone(false), 1800);
    onCopy?.();
  };

  const handleCollapseClick = (e) => {
    e.stopPropagation();
    onToggleCollapse?.(node.id);
  };

  const setHover = (value) => {
    setHovered(value);
    onHoverChange?.(value ? node.id : null);
  };

  // One shared surface treatment — selection is purple, hover only lifts contrast.
  const surface = isSelected
    ? "border-vz-accent bg-[#1b1230] shadow-[0_0_0_1px_rgba(168,85,247,0.35),0_10px_30px_-12px_rgba(168,85,247,0.45)]"
    : isHighlighted
      ? "border-vz-accent/45 bg-vz-panel-2"
      : hovered
        ? "border-[#3a4457] bg-vz-elev"
        : "border-vz-line bg-vz-panel-2";

  return (
    <div
      data-node-id={node.id}
      className={`node-position-transition pointer-events-none absolute ${
        isDragging ? "dragging" : ""
      }`}
      style={{
        left: position.x,
        top: position.y,
        zIndex: isSelected ? 50 : isDragging ? 45 : hovered ? 30 : 10,
        opacity: isDimmed ? 0.4 : 1,
        transition: "opacity 150ms cubic-bezier(0.2,0,0,1)",
        animation: `nodeEntrance 0.28s ease-out ${entranceDelay}ms both`,
      }}
    >
      <div
        className={`pointer-events-auto vz-t cursor-grab rounded-xl border p-3.5 active:cursor-grabbing ${SHELL[node.type] || SHELL.request} ${surface}`}
        onMouseDown={onMouseDown}
        onClick={onSelect}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {node.type === "root" ? (
          <>
            <div className="flex items-center gap-2.5">
              <span className="grid h-[38px] w-[38px] flex-shrink-0 place-items-center rounded-[9px] bg-vz-accent/14 text-vz-accent">
                <Boxes size={17} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold text-vz-text">
                  {node.name}
                </p>
                <p className="text-[11px] text-vz-dim">
                  {node.itemCount} nodes
                </p>
              </div>
            </div>
            <div className="mt-2.5 flex items-center gap-2">
              <span className="vz-mono rounded-md border border-vz-line bg-vz-bg px-2 py-0.5 text-[11px] text-vz-soft">
                {node.version}
              </span>
              <span className="text-[11px] uppercase tracking-wider text-vz-dim">
                API root
              </span>
            </div>
          </>
        ) : node.type === "folder" ? (
          <div className="flex items-center gap-3">
            <span className="grid h-[38px] w-[38px] flex-shrink-0 place-items-center rounded-[9px] bg-vz-blue/12 text-vz-blue">
              <Layers size={17} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-vz-text">
                {node.name}
              </p>
              <p className="text-[11px] text-vz-dim">
                {node.itemCount} {node.itemCount === 1 ? "endpoint" : "endpoints"}
              </p>
            </div>
            {onToggleCollapse && node.itemCount > 0 && (
              <button
                type="button"
                onClick={handleCollapseClick}
                title={isCollapsed ? "Expand group" : "Collapse group"}
                className="vz-t flex-shrink-0 rounded-md p-1 text-vz-dim hover:bg-white/6 hover:text-vz-text"
              >
                <ChevronRight
                  size={13}
                  className={`transition-transform duration-150 ${
                    isCollapsed ? "" : "rotate-90"
                  }`}
                />
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <MethodBadge method={node.method} size="xs" />
              <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-vz-text">
                {node.name}
              </p>
            </div>
            {node.path && (
              <div className="mt-2 flex items-center gap-1.5">
                <p
                  className="vz-mono min-w-0 flex-1 truncate text-[11px]"
                  style={{ color: mc?.dot }}
                  title={node.path}
                >
                  {displayPath(node)}
                </p>
                <button
                  type="button"
                  onClick={handleCopy}
                  title="Copy URL"
                  className="vz-t flex-shrink-0 rounded p-1 text-vz-dim hover:bg-white/6 hover:text-vz-text"
                  style={{
                    opacity: hovered ? 1 : 0,
                    pointerEvents: hovered ? "auto" : "none",
                  }}
                >
                  {copyDone ? (
                    <Check size={11} className="text-vz-green" />
                  ) : (
                    <Copy size={11} />
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default GraphCard;
