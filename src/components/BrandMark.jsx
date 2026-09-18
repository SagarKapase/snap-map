import { useId } from "react";

// Shared Vizroute glyph — used by the landing nav, footer and the workspace
// top bar so the brand stays in one place.
const BARS = [3, 11, 19];

const BrandMark = ({ size = 28, className = "" }) => {
  // Several marks share a page; a gradient id must be unique or every copy
  // paints from the first one — which may be inside a hidden panel.
  const gradientId = `vz-brand-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
  <svg
    width={size}
    height={size}
    viewBox="0 0 30 30"
    className={className}
    aria-hidden="true"
    focusable="false"
  >
    <defs>
      <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#a855f7" />
        <stop offset="100%" stopColor="#d477ff" />
      </linearGradient>
    </defs>
    {BARS.map((y, i) => (
      <rect
        key={y}
        x={1 + i * 3}
        y={y}
        width="24"
        height="7"
        rx="3.5"
        fill={`url(#${gradientId})`}
        opacity={1 - i * 0.2}
        transform={`rotate(38 ${13 + i * 3} ${y + 3.5})`}
      />
    ))}
  </svg>
  );
};

export default BrandMark;
