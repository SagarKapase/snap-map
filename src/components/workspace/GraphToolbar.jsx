import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Maximize2,
  Minimize2,
  Scan,
  Crosshair,
  Workflow,
} from "lucide-react";
import { GRAPH_STYLES, LEGEND_METHODS, methodColor } from "../../utils/constants";
import { LAYOUT_LABELS } from "../../utils/analysis";

const ToolButton = ({ children, className = "", ...rest }) => (
  <button
    type="button"
    className={`vz-t flex h-[34px] items-center gap-1.5 rounded-lg border border-vz-line bg-vz-panel/92 px-2.5 text-[12px] text-vz-soft backdrop-blur hover:border-vz-line/90 hover:text-vz-text ${className}`}
    {...rest}
  >
    {children}
  </button>
);

const GraphToolbar = ({
  graphStyle,
  onChangeStyle,
  zoom,
  onFit,
  onResetZoom,
  onFocusSelected,
  canFocus,
  onToggleFullscreen,
  isFullscreen,
  filterMethod,
  onFilterMethod,
  stats,
}) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 z-30 flex flex-wrap items-start justify-between gap-2">
      <div className="pointer-events-auto flex flex-wrap items-center gap-1.5" ref={wrapRef}>
        <div className="relative">
          <ToolButton onClick={() => setOpen((v) => !v)}>
            <Workflow size={13} className="text-vz-accent" />
            {LAYOUT_LABELS[graphStyle] || graphStyle}
            <ChevronDown
              size={12}
              className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`}
            />
          </ToolButton>

          {open && (
            <div className="absolute left-0 top-full mt-1.5 w-44 overflow-hidden rounded-xl border border-vz-line bg-vz-panel shadow-2xl shadow-black/50">
              {GRAPH_STYLES.map((style) => (
                <button
                  key={style}
                  type="button"
                  onClick={() => {
                    onChangeStyle(style);
                    setOpen(false);
                  }}
                  className={`vz-t block w-full px-3 py-2.5 text-left text-[13px] ${
                    graphStyle === style
                      ? "bg-vz-accent/12 text-vz-accent"
                      : "text-vz-soft hover:bg-white/4 hover:text-vz-text"
                  }`}
                >
                  {LAYOUT_LABELS[style] || style}
                </button>
              ))}
            </div>
          )}
        </div>

        <ToolButton onClick={onFit} title="Fit graph to view">
          <Scan size={13} /> Fit
        </ToolButton>

        <ToolButton
          onClick={onResetZoom}
          title="Reset zoom to 100%"
          className="vz-mono tabular-nums"
        >
          {Math.round(zoom * 100)}%
        </ToolButton>

        <ToolButton
          onClick={onFocusSelected}
          disabled={!canFocus}
          title="Center the selected node"
          className={canFocus ? "" : "opacity-40"}
        >
          <Crosshair size={13} />
        </ToolButton>

        <ToolButton
          onClick={onToggleFullscreen}
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen canvas"}
        >
          {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </ToolButton>
      </div>

      <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-vz-line bg-vz-panel/92 px-1.5 py-1 backdrop-blur">
        {LEGEND_METHODS.map((method) => {
          const active = filterMethod === method;
          const count = stats?.[method.toLowerCase()] ?? 0;
          return (
            <button
              key={method}
              type="button"
              onClick={() => onFilterMethod(active ? "all" : method)}
              title={
                active
                  ? `Showing ${method} only — click to clear`
                  : `Show only ${method}`
              }
              className={`vz-t flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium ${
                active
                  ? "bg-white/8 text-vz-text"
                  : "text-vz-soft hover:bg-white/4 hover:text-vz-text"
              }`}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: methodColor(method).dot }}
              />
              {method}
              <span className="tabular-nums text-vz-dim">{count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default GraphToolbar;
