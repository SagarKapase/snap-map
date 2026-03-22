import { useMemo, useRef, useCallback } from "react";
import { methodColor } from "../utils/constants";

const MINIMAP_W = 180;
const MINIMAP_H = 110;
const PADDING = 10;

const Minimap = ({ nodes, nodePositions, canvasRef, zoom, panX, panY }) => {
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
      className="absolute bottom-5 right-5 z-30 cursor-crosshair overflow-hidden rounded-xl"
      style={{
        width: MINIMAP_W,
        height: MINIMAP_H,
        background: "rgba(12,14,18,0.8)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(70,72,76,0.2)",
        boxShadow: "0 8px 32px -8px rgba(0,0,0,0.6)",
        animation: "fadeIn 0.4s ease-out 600ms both",
      }}
    >
      <div
        className="absolute top-1.5 left-2 text-[#73757a] uppercase tracking-widest font-bold pointer-events-none"
        style={{ fontSize: "7px" }}
      >
        Minimap
      </div>

      <svg width={MINIMAP_W} height={MINIMAP_H} className="absolute inset-0">
        {nodes.map((node) => {
          const pos = nodePositions[node.id];
          if (!pos) return null;
          const x = pos.x * scale + offsetX;
          const y = pos.y * scale + offsetY;

          let fill = "#e08efe";
          let r = node.type === "root" ? 4 : node.type === "folder" ? 3 : 2.5;

          if (node.type === "folder") fill = "#3aa2ff";
          if (node.type === "request") fill = methodColor(node.method).dot;

          return (
            <circle
              key={node.id}
              cx={x + (node.type === "root" ? 6 : 5)}
              cy={y + 3}
              r={r}
              fill={fill}
              opacity={0.8}
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
            fill="rgba(224,142,254,0.06)"
            stroke="rgba(224,142,254,0.4)"
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
