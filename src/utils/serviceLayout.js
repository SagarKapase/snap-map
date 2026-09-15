/**
 * A deterministic force layout: nodes start on a circle and settle under
 * repulsion, edge springs and a pull to the centre. No randomness, so the
 * same estate always draws the same map.
 */
export const LAYOUTS = [
  { id: "force", label: "Force" },
  { id: "ring", label: "Ring" },
  { id: "grid", label: "Grid" },
];

export const layoutServices = (services, edges, width, height, mode = "force") => {
  const n = services.length;
  if (!n) return new Map();
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.36;
  const pos = new Map(
    services.map((s, i) => {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      return [s.id, { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius, vx: 0, vy: 0 }];
    }),
  );
  if (mode === "ring" || n === 1) return pos;
  if (mode === "grid") {
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    const gapX = Math.min(360, (width - 220) / Math.max(1, cols - 1) || 0);
    const gapY = Math.min(280, (height - 200) / Math.max(1, rows - 1) || 0);
    const x0 = cx - (gapX * (cols - 1)) / 2;
    const y0 = cy - (gapY * (rows - 1)) / 2;
    services.forEach((s, i) => {
      const p = pos.get(s.id);
      p.x = x0 + (i % cols) * gapX;
      p.y = y0 + Math.floor(i / cols) * gapY;
    });
    return pos;
  }
  const index = new Map(services.map((s) => [s.id, s]));
  const springs = edges.filter((e) => index.has(e.from) && index.has(e.to));
  const ideal = Math.max(170, Math.min(340, (Math.min(width, height) * 1.9) / Math.sqrt(n)));
  for (let iter = 0; iter < 260; iter++) {
    const cooling = 1 - iter / 260;
    services.forEach((a) => {
      const pa = pos.get(a.id);
      let fx = 0;
      let fy = 0;
      services.forEach((b) => {
        if (a === b) return;
        const pb = pos.get(b.id);
        const dx = pa.x - pb.x;
        const dy = pa.y - pb.y;
        const d2 = Math.max(dx * dx + dy * dy, 1);
        const d = Math.sqrt(d2);
        const rep = (ideal * ideal) / d2;
        fx += (dx / d) * rep * 6;
        fy += (dy / d) * rep * 6;
      });
      springs.forEach((e) => {
        if (e.from !== a.id && e.to !== a.id) return;
        const other = pos.get(e.from === a.id ? e.to : e.from);
        const dx = other.x - pa.x;
        const dy = other.y - pa.y;
        const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const k = e.kind === "shares" ? 0.02 : 0.05;
        fx += (dx / d) * (d - ideal) * k;
        fy += (dy / d) * (d - ideal) * k;
      });
      fx += (cx - pa.x) * 0.01;
      fy += (cy - pa.y) * 0.01;
      pa.vx = (pa.vx + fx) * 0.5;
      pa.vy = (pa.vy + fy) * 0.5;
    });
    pos.forEach((p) => {
      p.x = Math.min(width - 110, Math.max(110, p.x + p.vx * cooling));
      p.y = Math.min(height - 100, Math.max(80, p.y + p.vy * cooling));
    });
  }
  return pos;
};
