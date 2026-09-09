import { useMemo, useRef, useCallback } from "react";

const MINIMAP_W = 196;
const MINIMAP_H = 130;
const PADDING = 12;

const CARD_DIM = {
  root: { w: 240, h: 110 },
  folder: { w: 208, h: 80 },
  request: { w: 256, h: 85 },
};

const Minimap = ({
  nodes,
  nodePositions,
  canvasRef,
  zoom,
  panX,
  panY,
  selectedId,
}) => {
  const minimapRef = useRef(null);

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

  const viewport = useMemo(() => {
    if (!canvasRef?.current) return null;
    const el = canvasRef.current;
    const vx = el.scrollLeft / zoom - panX;
    const vy = el.scrollTop / zoom - panY;
    const vw = el.clientWidth / zoom;
    const vh = el.clientHeight / zoom;
    return {
      x: vx * scale + offsetX,
      y: vy * scale + offsetY,
      w: vw * scale,
      h: vh * scale,
    };
  }, [canvasRef, zoom, panX, panY, scale, offsetX, offsetY]);

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
        {nodes.map((node) => {
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

export default Minimap;
