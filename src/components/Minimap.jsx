import { memo, useMemo, useRef, useCallback } from "react";

const MINIMAP_W = 196;
const MINIMAP_H = 130;
const PADDING = 12;

const CARD_DIM = {
  root: { w: 240, h: 110 },
  folder: { w: 208, h: 80 },
  request: { w: 256, h: 85 },
};

// A 196x130 thumbnail cannot show two thousand cards — past this many, drop
// to the groups, which is the only structure legible at that size anyway.
const DETAIL_LIMIT = 400;

const Minimap = ({
  nodes,
  nodePositions,
  canvasRef,
  zoom,
  panX,
  panY,
  selectedId,
  viewportRect,
}) => {
  const minimapRef = useRef(null);

  const marks = useMemo(
    () => (nodes.length > DETAIL_LIMIT ? nodes.filter((n) => n.type !== "request") : nodes),
    [nodes],
  );

  const { scale, offsetX, offsetY } = useMemo(() => {
    const positions = Object.values(nodePositions);
    if (!positions.length) return { scale: 1, offsetX: 0, offsetY: 0 };

    const minX = Math.min(...positions.map((p) => p.x));
    const minY = Math.min(...positions.map((p) => p.y));
    const maxX = Math.max(...positions.map((p) => p.x)) + 260;
    const maxY = Math.max(...positions.map((p) => p.y)) + 100;

    const contentW = maxX - minX || 1;
    const contentH = maxY - minY || 1;

    const s = Math.min(
      (MINIMAP_W - PADDING * 2) / contentW,
      (MINIMAP_H - PADDING * 2) / contentH,
    );

    return {
      scale: s,
      offsetX: PADDING - minX * s + (MINIMAP_W - PADDING * 2 - contentW * s) / 2,
      offsetY: PADDING - minY * s + (MINIMAP_H - PADDING * 2 - contentH * s) / 2,
    };
  }, [nodePositions]);

  // The rectangle arrives in graph coordinates from the canvas, which tracks
  // its own scrolling — reading the DOM here would only be right on the frames
  // where something else happened to re-render this component.
  const viewport = useMemo(() => {
    if (!viewportRect || !viewportRect.w) return null;
    return {
      x: viewportRect.left * scale + offsetX,
      y: viewportRect.top * scale + offsetY,
      w: viewportRect.w * scale,
      h: viewportRect.h * scale,
    };
  }, [viewportRect, scale, offsetX, offsetY]);

  const handleClick = useCallback(
    (e) => {
      if (!minimapRef.current || !canvasRef?.current) return;
      const rect = minimapRef.current.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const cx = (mx - offsetX) / scale;
      const cy = (my - offsetY) / scale;
      const el = canvasRef.current;
      el.scrollLeft = (cx + panX - el.clientWidth / zoom / 2) * zoom;
      el.scrollTop = (cy + panY - el.clientHeight / zoom / 2) * zoom;
    },
    [canvasRef, scale, offsetX, offsetY, zoom, panX, panY],
  );

  if (nodes.length < 8) return null;

  return (
    <div
      ref={minimapRef}
      onClick={handleClick}
      title="Click to pan the canvas"
      className="absolute bottom-4 left-4 z-20 cursor-crosshair overflow-hidden rounded-[10px] border border-vz-line bg-vz-panel/92 backdrop-blur"
      style={{ width: MINIMAP_W, height: MINIMAP_H }}
    >
      <svg width={MINIMAP_W} height={MINIMAP_H} className="absolute inset-0">
        {marks.map((node) => {
          const pos = nodePositions[node.id];
          if (!pos) return null;
          const dim = CARD_DIM[node.type] || CARD_DIM.request;
          const selected = selectedId === node.id;

          return (
            <rect
              key={node.id}
              x={pos.x * scale + offsetX}
              y={pos.y * scale + offsetY}
              width={Math.max(dim.w * scale, 6)}
              height={Math.max(dim.h * scale, 3)}
              rx={1.5}
              fill={selected ? "#a855f7" : node.type === "request" ? "#2a3446" : "#3a4457"}
              className="pointer-events-none"
            />
          );
        })}

        {viewport && (
          <rect
            x={viewport.x}
            y={viewport.y}
            width={Math.max(viewport.w, 10)}
            height={Math.max(viewport.h, 8)}
            fill="rgba(168,85,247,0.06)"
            stroke="rgba(168,85,247,0.45)"
            strokeWidth={1}
            rx={2}
            className="pointer-events-none"
          />
        )}
      </svg>
    </div>
  );
};

export default memo(Minimap);
