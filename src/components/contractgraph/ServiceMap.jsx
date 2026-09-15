import { useEffect, useMemo, useRef, useState } from "react";
import { WandSparkles, X } from "lucide-react";
import { layoutServices } from "../../utils/serviceLayout";
import { iconFor } from "./serviceIcons";

const NODE_R = 46;

const EDGE_STYLE = {
  calls: { dash: "", width: 2, label: "calls" },
  references: { dash: "7 8", width: 2, label: "references" },
  shares: { dash: "3 7", width: 1.6, label: "shares" },
};

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A translucent tint of a hex colour, for glows and rings. */
const tint = (hex, alpha) => {
  const m = String(hex || "#8b5cf6").replace("#", "");
  const n = parseInt(m.length === 3 ? m.split("").map((c) => c + c).join("") : m, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

const DRAG_THRESHOLD = 4; // px of movement before a press becomes a drag
const EDGE_ZONE = 44; // px from the canvas edge where a node drag starts scrolling
const EDGE_SPEED = 9; // canvas units per frame while it does
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2;

/**
 * The service map: pictogram nodes on the dot-grid canvas, edges by kind
 * with a label at their midpoint, a stats bar and a minimap. Zoom and
 * layout come from the toolbar; a drag on the background pans, a drag on a
 * node moves it. Moved positions are `overrides`, owned by the page so
 * they can be remembered per workspace.
 */
const ServiceMap = ({
  graph,
  selectedId,
  onSelect,
  impacted = [],
  highlighted = [],
  highlightReason = "",
  onClearHighlight,
  dimmed = null, // Set of ids that do not match the search, or null
  layout = "force",
  zoom = 1,
  width = 900,
  height = 560,
  overrides = {}, // { [serviceId]: { x, y } } — positions moved by hand
  onOverridesChange,
  onZoomChange,
  fitRequest = 0, // bump to fit every node into view
  selectedEdge = null, // "from|to|kind" of the edge whose evidence is open
  onSelectEdge,
}) => {
  const [hovered, setHovered] = useState(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const dragRef = useRef(null);
  const nodeDragRef = useRef(null);
  const [draggingId, setDraggingId] = useState(null);
  const containerRef = useRef(null);
  const frameRef = useRef(null);
  const latestRef = useRef({ pan, zoom, overrides, onOverridesChange });
  latestRef.current = { pan, zoom, overrides, onOverridesChange };
  const computed = useMemo(() => layoutServices(graph.services, graph.edges, width, height, layout), [graph, width, height, layout]);
  const positions = useMemo(() => {
    const merged = new Map(computed);
    Object.entries(overrides || {}).forEach(([id, p]) => {
      if (merged.has(id) && p && Number.isFinite(p.x) && Number.isFinite(p.y)) merged.set(id, { ...merged.get(id), x: p.x, y: p.y });
    });
    return merged;
  }, [computed, overrides]);
  const impactSet = new Set(impacted);
  const highlightSet = new Set(highlighted);
  const active = hovered || selectedId;
  const showLabels = graph.edges.length <= 24;

  // The viewBox does the zooming: the drawing stays in canvas units and the
  // window onto it shrinks around the centre.
  const vw = width / zoom;
  const vh = height / zoom;
  const vx = (width - vw) / 2 - pan.x;
  const vy = (height - vh) / 2 - pan.y;

  /** The extent of everything drawn, for the minimap and for fitting. */
  const extent = useMemo(() => {
    const pts = [...positions.values()];
    if (!pts.length) return { x: 0, y: 0, w: width, h: height };
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const m = NODE_R + 60;
    const x0 = Math.min(0, ...xs.map((x) => x - m));
    const y0 = Math.min(0, ...ys.map((y) => y - m));
    const x1 = Math.max(width, ...xs.map((x) => x + m));
    const y1 = Math.max(height, ...ys.map((y) => y + m));
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }, [positions, width, height]);

  /** Show every node: zoom out as far as needed, then centre on them. */
  useEffect(() => {
    if (!fitRequest) return;
    const pts = [...positions.values()];
    if (!pts.length) return;
    const m = NODE_R + 70;
    const x0 = Math.min(...pts.map((p) => p.x)) - m;
    const y0 = Math.min(...pts.map((p) => p.y)) - m;
    const x1 = Math.max(...pts.map((p) => p.x)) + m;
    const y1 = Math.max(...pts.map((p) => p.y)) + m;
    const z = Math.min(1, width / Math.max(1, x1 - x0), height / Math.max(1, y1 - y0));
    const next = Math.max(MIN_ZOOM, Math.round(z * 100) / 100);
    onZoomChange?.(next);
    // Centre of the content lands at the centre of the window.
    setPan({ x: width / 2 - (x0 + x1) / 2, y: height / 2 - (y0 + y1) / 2 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitRequest]);

  // Wheel scrolls the canvas; with Ctrl or ⌘ it zooms. The listener is
  // attached by hand because React's onWheel is passive and cannot stop
  // the page from scrolling instead.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const { zoom: z } = latestRef.current;
      if (e.ctrlKey || e.metaKey) {
        const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((z - Math.sign(e.deltaY) * 0.1) * 100) / 100));
        onZoomChange?.(next);
        return;
      }
      const dx = (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) / z;
      const dy = (e.shiftKey && !e.deltaX ? 0 : e.deltaY) / z;
      setPan((p) => ({ x: p.x - dx, y: p.y - dy }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onZoomChange]);

  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  const startPan = (e) => {
    if (e.button !== 0) return;
    dragRef.current = { x: e.clientX, y: e.clientY, pan };
    setPanning(true);
  };
  const movePan = (e) => {
    if (!dragRef.current) return;
    const dx = (e.clientX - dragRef.current.x) / zoom;
    const dy = (e.clientY - dragRef.current.y) / zoom;
    setPan({ x: dragRef.current.pan.x + dx, y: dragRef.current.pan.y + dy });
  };
  const endPan = () => {
    dragRef.current = null;
    setPanning(false);
  };

  // Node dragging: the press selects unless the pointer travels, in which
  // case the node follows it and the drop is remembered as an override.
  const startNodeDrag = (e, id) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const p = positions.get(id);
    nodeDragRef.current = { id, startX: e.clientX, startY: e.clientY, originX: p.x, originY: p.y, moved: false, shiftX: 0, shiftY: 0, edge: null, pointer: { x: e.clientX, y: e.clientY } };
  };

  /** Where the dragged node belongs for the current pointer: origin + travel + whatever the canvas scrolled meanwhile. */
  const placeDragged = (d, clientX, clientY) => {
    const { zoom: z, overrides: current, onOverridesChange: emit } = latestRef.current;
    // Screen pixels → canvas units: the viewBox is width/zoom units across
    // a width-pixel element, so one pixel is 1/zoom units.
    const x = d.originX + (clientX - d.startX) / z + d.shiftX;
    const y = d.originY + (clientY - d.startY) / z + d.shiftY;
    emit?.({ ...(current || {}), [d.id]: { x, y } });
  };

  // Dragging a node to the edge scrolls the canvas underneath it, frame by
  // frame, so a node can be taken anywhere without letting go.
  const edgeScroll = () => {
    const d = nodeDragRef.current;
    if (!d || !d.edge) return;
    const { zoom: z } = latestRef.current;
    const step = EDGE_SPEED / z;
    d.shiftX += d.edge.x * step;
    d.shiftY += d.edge.y * step;
    setPan((p) => ({ x: p.x - d.edge.x * step, y: p.y - d.edge.y * step }));
    placeDragged(d, d.pointer.x, d.pointer.y);
    frameRef.current = requestAnimationFrame(edgeScroll);
  };

  const moveNodeDrag = (e) => {
    const d = nodeDragRef.current;
    if (!d) return false;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return true;
    if (!d.moved) {
      d.moved = true;
      setDraggingId(d.id);
    }
    d.pointer = { x: e.clientX, y: e.clientY };
    placeDragged(d, e.clientX, e.clientY);

    const box = containerRef.current?.getBoundingClientRect();
    if (box) {
      const ex = e.clientX < box.left + EDGE_ZONE ? -1 : e.clientX > box.right - EDGE_ZONE ? 1 : 0;
      const ey = e.clientY < box.top + EDGE_ZONE ? -1 : e.clientY > box.bottom - EDGE_ZONE ? 1 : 0;
      const wasScrolling = Boolean(d.edge);
      d.edge = ex || ey ? { x: ex, y: ey } : null;
      if (d.edge && !wasScrolling) frameRef.current = requestAnimationFrame(edgeScroll);
      if (!d.edge) cancelAnimationFrame(frameRef.current);
    }
    return true;
  };
  const justDraggedRef = useRef(false);
  const endNodeDrag = () => {
    const d = nodeDragRef.current;
    nodeDragRef.current = null;
    cancelAnimationFrame(frameRef.current);
    setDraggingId(null);
    justDraggedRef.current = Boolean(d?.moved);
    return justDraggedRef.current;
  };

  /** Clicking the minimap centres the window there. */
  const jumpTo = (e) => {
    const svg = e.currentTarget;
    const box = svg.getBoundingClientRect();
    // The minimap letterboxes the extent; map the click back through that.
    const scale = Math.min(box.width / extent.w, box.height / extent.h);
    const offX = (box.width - extent.w * scale) / 2;
    const offY = (box.height - extent.h * scale) / 2;
    const x = extent.x + (e.clientX - box.left - offX) / scale;
    const y = extent.y + (e.clientY - box.top - offY) / scale;
    setPan({ x: width / 2 - x, y: height / 2 - y });
  };

  const serviceOf = (id) => graph.services.find((s) => s.id === id);

  return (
    <div
      ref={containerRef}
      className={`cg-graph ${panning ? "panning" : ""} ${draggingId ? "dragging" : ""}`}
      onMouseDown={startPan}
      onMouseMove={(e) => { if (!moveNodeDrag(e)) movePan(e); }}
      onMouseUp={() => { endNodeDrag(); endPan(); }}
      onMouseLeave={() => { endNodeDrag(); endPan(); }}
    >
      <svg className="cg-canvas" viewBox={`${vx} ${vy} ${vw} ${vh}`} role="img" aria-label="Service map" data-extent={`${extent.x} ${extent.y} ${extent.w} ${extent.h}`}>
        <defs>
          <marker id="cg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
          {graph.services.map((s) => (
            <filter key={s.id} id={`cg-glow-${s.id}`} x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="0" stdDeviation="9" floodColor={s.color} floodOpacity="0.55" />
            </filter>
          ))}
        </defs>

        {/* Edges */}
        <g>
          {graph.edges.map((edge) => {
            const a = positions.get(edge.from);
            const b = positions.get(edge.to);
            if (!a || !b) return null;
            const style = EDGE_STYLE[edge.kind] || EDGE_STYLE.shares;
            const source = serviceOf(edge.from);
            const target = serviceOf(edge.to);
            const color = source?.color || "#a855f7";
            const edgeKey = `${edge.from}|${edge.to}|${edge.kind}`;
            const isSelectedEdge = selectedEdge === edgeKey;
            const dim = !isSelectedEdge && ((selectedEdge && !active) || (active && edge.from !== active && edge.to !== active) || (dimmed && (dimmed.has(edge.from) || dimmed.has(edge.to))));
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const d = Math.max(Math.hypot(dx, dy), 1);
            const ux = dx / d;
            const uy = dy / d;
            const x1 = a.x + ux * (NODE_R + 4);
            const y1 = a.y + uy * (NODE_R + 4);
            const x2 = b.x - ux * (NODE_R + 8);
            const y2 = b.y - uy * (NODE_R + 8);
            // Labels sit a third of the way from the source, so edges that
            // converge on one service do not pile their labels onto it.
            const mx = x1 + (x2 - x1) * 0.36;
            const my = y1 + (y2 - y1) * 0.36;
            const labelW = style.label.length * 6.4 + 16;
            const tip = `${source?.name} ${style.label} ${target?.name}\n${edge.evidence.slice(0, 4).join("\n")}${edge.evidence.length > 4 ? `\n… ${edge.evidence.length - 4} more` : ""}`;
            return (
              <g
                key={edgeKey}
                style={{ color, cursor: "pointer" }}
                opacity={dim ? 0.12 : isSelectedEdge ? 1 : 0.85}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onSelectEdge?.(isSelectedEdge ? null : edge); }}
                role="button"
                aria-label={`${source?.name} ${style.label} ${target?.name}`}
                tabIndex={0}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelectEdge?.(isSelectedEdge ? null : edge)}
              >
                {isSelectedEdge && <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#ffffff" strokeWidth={style.width + 5} opacity="0.35" strokeLinecap="round" />}
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth={isSelectedEdge ? style.width + 1 : style.width} strokeDasharray={style.dash} markerEnd={edge.kind === "shares" ? undefined : "url(#cg-arrow)"} />
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth="16">
                  <title>{tip}</title>
                </line>
                {showLabels && (
                  <g transform={`translate(${mx - labelW / 2} ${my - 11})`}>
                    <rect width={labelW} height="22" rx="6" fill={isSelectedEdge ? "currentColor" : "#0f141d"} stroke="currentColor" strokeWidth="1" />
                    <text x={labelW / 2} y="15" textAnchor="middle" fontSize="11" fill={isSelectedEdge ? "#0b0710" : "currentColor"} fontWeight={isSelectedEdge ? "700" : "400"} style={{ pointerEvents: "none" }}>
                      {style.label}
                    </text>
                    <title>{tip}</title>
                  </g>
                )}
              </g>
            );
          })}
        </g>

        {/* Nodes */}
        <g>
          {graph.services.map((s) => {
            const p = positions.get(s.id);
            const Icon = iconFor(s);
            const isActive = active === s.id;
            const isImpacted = impactSet.has(s.id);
            const isHighlighted = highlightSet.has(s.id);
            const searchedOut = dimmed?.has(s.id);
            const dim = searchedOut || (active && !isActive && !isImpacted && !isHighlighted);
            const meta = s.isCollection ? "Consumer" : `${plural(s.operations.length, "operation")} · ${plural(s.entities.length, "entity", "entities")}`;
            return (
              <g
                key={s.id}
                className="cg-node"
                transform={`translate(${p.x} ${p.y})`}
                opacity={dim ? 0.3 : 1}
                onMouseEnter={() => setHovered(s.id)}
                onMouseLeave={() => setHovered(null)}
                onMouseDown={(e) => startNodeDrag(e, s.id)}
                onClick={() => {
                  // A drop is not a click: the node was moved, not chosen.
                  if (justDraggedRef.current) {
                    justDraggedRef.current = false;
                    return;
                  }
                  onSelect?.(s.id);
                }}
                role="button"
                aria-label={`${s.name}: ${s.operations.length} operations`}
                tabIndex={0}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect?.(s.id)}
              >
                {isHighlighted && <circle r={NODE_R + 14} fill="none" stroke="#c45cff" strokeWidth="2.5" />}
                {isImpacted && <circle r={NODE_R + 9} fill="none" stroke="#fbbf24" strokeWidth="2" strokeDasharray="5 4" />}
                <circle
                  className="cg-node-ring"
                  r={NODE_R}
                  fill={s.isCollection ? tint(s.color, 0.45) : s.color}
                  stroke={isActive ? "#ffffff" : s.isCollection ? s.color : "rgba(255,255,255,0.35)"}
                  strokeWidth="4"
                  filter={`url(#cg-glow-${s.id})`}
                />
                <Icon x={-13} y={-30} width={26} height={26} color="#ffffff" strokeWidth={2} style={{ pointerEvents: "none" }} />
                <text textAnchor="middle" y="20" fontSize="18" fontWeight="700" fill="#ffffff" style={{ pointerEvents: "none" }}>
                  {s.operations.length}
                </text>
                <text textAnchor="middle" y={NODE_R + 24} fontSize="15" fontWeight="700" fill="#f6f7fb" style={{ pointerEvents: "none" }}>
                  {s.name.length > 26 ? `${s.name.slice(0, 25)}…` : s.name}
                </text>
                <text textAnchor="middle" y={NODE_R + 42} fontSize="12" fill="#a4acbc" style={{ pointerEvents: "none" }}>
                  {meta}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {highlighted.length > 0 && (
        <div className="cg-highlight-bar" role="status">
          <WandSparkles size={12} />
          <span>{highlightReason || "Highlighted by the assistant"} · {plural(highlighted.length, "service")}</span>
          <button type="button" onClick={onClearHighlight} aria-label="Clear highlight" style={{ background: "none", border: 0, color: "inherit", cursor: "pointer", display: "grid" }}>
            <X size={12} />
          </button>
        </div>
      )}

      <div className="cg-stats">
        <span>{plural(graph.stats.services, "service")}</span>
        <span><i style={{ background: "#f43f5e" }} />{plural(graph.stats.operations, "operation")}</span>
        <span><i style={{ background: "#34d399" }} />{plural(graph.stats.entities, "entity", "entities")}</span>
        <span><i style={{ background: "#a855f7" }} />{plural(graph.stats.edges, "relationship")}</span>
      </div>

      {graph.services.length > 1 && (
        <svg className="cg-minimap" viewBox={`${extent.x} ${extent.y} ${extent.w} ${extent.h}`} preserveAspectRatio="xMidYMid meet" aria-label="Minimap — click to move the view" role="button" onClick={jumpTo} onMouseDown={(e) => e.stopPropagation()}>
          {graph.edges.map((e) => {
            const a = positions.get(e.from);
            const b = positions.get(e.to);
            if (!a || !b) return null;
            return <line key={`${e.from}-${e.to}-${e.kind}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#222a39" strokeWidth={Math.max(2, width / 300)} />;
          })}
          {graph.services.map((s) => {
            const p = positions.get(s.id);
            return <circle key={s.id} cx={p.x} cy={p.y} r={Math.max(8, width / 60)} fill={s.color} />;
          })}
          <rect x={vx} y={vy} width={vw} height={vh} fill="rgba(197,92,255,0.06)" stroke="#c45cff" strokeWidth={Math.max(3, extent.w / 250)} />
        </svg>
      )}
    </div>
  );
};

export default ServiceMap;
