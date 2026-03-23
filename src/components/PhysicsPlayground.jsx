import { useState, useRef, useEffect, useCallback } from "react";

const CARD_W = 150;
const CARD_H = 46;
const COLLISION_R = 50;

// Physics constants — tuned for ball-like feel
const GRAVITY = 0.35;           // downward pull per frame
const AIR_FRICTION = 0.997;     // slight air drag
const GROUND_FRICTION = 0.96;   // friction when sliding on floor
const WALL_BOUNCE = 0.55;       // energy kept on wall hit
const GROUND_BOUNCE = 0.45;     // energy kept on floor bounce
const COLLISION_RESTITUTION = 0.75;
const ROTATION_DAMPING = 0.97;  // spin slows down naturally
const ROTATION_FROM_VX = 0.35;  // how much horizontal speed adds spin
const SETTLE_THRESHOLD = 0.15;  // below this speed, stop completely

const INITIAL_CARDS = [
  { id: "get",     label: "GET",     endpoint: "/users",     color: "#fff", bg: "#2d7a56",  border: "none" },
  { id: "post",    label: "POST",    endpoint: "/create",    color: "#fff", bg: "#e8860c",  border: "none" },
  { id: "put",     label: "PUT",     endpoint: "/update",    color: "#fff", bg: "#3670b8",  border: "none" },
  { id: "delete",  label: "DELETE",  endpoint: "/remove",    color: "#fff", bg: "#d44a2e",  border: "none" },
  { id: "patch",   label: "PATCH",   endpoint: "/modify",    color: "#fff", bg: "#7b52c9",  border: "none" },
  { id: "head",    label: "HEAD",    endpoint: "/ping",      color: "#fff", bg: "#c47012",  border: "none" },
  { id: "options", label: "OPTIONS", endpoint: "/cors",      color: "#fff", bg: "#9545b8",  border: "none" },
];

const PhysicsPlayground = () => {
  const containerRef = useRef(null);
  const cardsRef = useRef([]);
  const [renderTick, setRenderTick] = useState(0);
  const dragIdRef = useRef(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const mouseHistoryRef = useRef([]); // last N mouse positions for smooth velocity
  const rafRef = useRef(null);
  const initializedRef = useRef(false);

  // Initialize cards — drop from top with slight scatter
  const initCards = useCallback(() => {
    const el = containerRef.current;
    if (!el || initializedRef.current) return;
    const rect = el.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const floor = h - CARD_H - 4;

    // Start scattered along the bottom, slightly raised so they settle
    const spread = w / (INITIAL_CARDS.length + 1);
    cardsRef.current = INITIAL_CARDS.map((card, i) => ({
      ...card,
      x: spread * (i + 0.5 + (Math.random() - 0.5) * 0.4),
      y: floor - Math.random() * 80 - 20,
      vx: (Math.random() - 0.5) * 2,
      vy: 0,
      rotation: (Math.random() - 0.5) * 30,
      angularVel: 0,
      onGround: false,
    }));
    initializedRef.current = true;
    setRenderTick((t) => t + 1);
  }, []);

  useEffect(() => {
    initCards();
    const handleResize = () => { initializedRef.current = false; initCards(); };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [initCards]);

  // ── Main physics loop ──────────────────────
  useEffect(() => {
    const step = () => {
      const cards = cardsRef.current;
      const el = containerRef.current;
      if (!el || !cards.length) { rafRef.current = requestAnimationFrame(step); return; }
      const rect = el.getBoundingClientRect();
      const W = rect.width;
      const H = rect.height;
      const FLOOR = H - CARD_H;
      let needsRender = false;

      // ── Update each card ──
      cards.forEach((card) => {
        if (card.id === dragIdRef.current) {
          // Dragged card still participates in collisions (handled below)
          // but doesn't move via physics
          card.onGround = false;
          return;
        }

        const wasMoving = Math.abs(card.vx) > SETTLE_THRESHOLD || Math.abs(card.vy) > SETTLE_THRESHOLD || !card.onGround;

        if (!wasMoving && card.onGround) {
          // Fully settled — skip physics
          return;
        }

        needsRender = true;

        // Gravity
        card.vy += GRAVITY;

        // Air friction
        card.vx *= AIR_FRICTION;
        card.vy *= AIR_FRICTION;

        // Move
        card.x += card.vx;
        card.y += card.vy;

        // Angular velocity → rotation
        card.rotation += card.angularVel;
        card.angularVel *= ROTATION_DAMPING;
        // Horizontal movement adds spin
        card.angularVel += card.vx * ROTATION_FROM_VX * 0.02;

        // ── Floor collision (most important for "ball" feel) ──
        if (card.y >= FLOOR) {
          card.y = FLOOR;
          if (Math.abs(card.vy) > 1) {
            // Bounce up
            card.vy *= -GROUND_BOUNCE;
            // Floor impact adds spin from horizontal velocity
            card.angularVel += card.vx * 0.05;
            // Ground friction on bounce
            card.vx *= GROUND_FRICTION;
          } else {
            // Settle on ground
            card.vy = 0;
            card.vx *= GROUND_FRICTION;
            card.onGround = true;
            // Dampen rotation when on ground
            card.angularVel *= 0.9;
          }
          // Settle rotation toward flat
          if (card.onGround && Math.abs(card.angularVel) < 0.3) {
            card.rotation *= 0.92; // slowly flatten
            if (Math.abs(card.rotation) < 0.5) card.rotation = 0;
          }
        } else {
          card.onGround = false;
        }

        // ── Wall collisions ──
        if (card.x < 0) {
          card.x = 0;
          card.vx *= -WALL_BOUNCE;
          card.angularVel -= card.vy * 0.03;
        }
        if (card.x > W - CARD_W) {
          card.x = W - CARD_W;
          card.vx *= -WALL_BOUNCE;
          card.angularVel += card.vy * 0.03;
        }
        // Ceiling
        if (card.y < 0) {
          card.y = 0;
          card.vy *= -WALL_BOUNCE;
        }

        // Final settle check
        if (card.onGround && Math.abs(card.vx) < SETTLE_THRESHOLD && Math.abs(card.angularVel) < 0.1) {
          card.vx = 0;
          card.angularVel = 0;
        }
      });

      // ── Collision between cards (including dragged card) ──
      for (let i = 0; i < cards.length; i++) {
        for (let j = i + 1; j < cards.length; j++) {
          const a = cards[i], b = cards[j];
          const ax = a.x + CARD_W / 2, ay = a.y + CARD_H / 2;
          const bx = b.x + CARD_W / 2, by = b.y + CARD_H / 2;
          const dx = bx - ax, dy = by - ay;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const minDist = COLLISION_R * 2;

          if (dist < minDist && dist > 0.1) {
            needsRender = true;
            const nx = dx / dist, ny = dy / dist;

            // If one is being dragged, treat it as infinite mass
            const aIsDragged = a.id === dragIdRef.current;
            const bIsDragged = b.id === dragIdRef.current;

            if (aIsDragged || bIsDragged) {
              // Dragged card pushes the other away
              const other = aIsDragged ? b : a;
              const dragCard = aIsDragged ? a : b;
              const pushDir = aIsDragged ? 1 : -1;

              // Transfer drag velocity to the hit card
              const dvx = (dragCard.vx || 0) * 0.8;
              const dvy = (dragCard.vy || 0) * 0.8;
              other.vx += (nx * pushDir * 8) + dvx;
              other.vy += (ny * pushDir * 8) + dvy;
              other.angularVel += (nx * pushDir) * 3;
              other.onGround = false;

              // Separate
              const overlap = minDist - dist;
              other.x += nx * pushDir * (overlap + 2);
              other.y += ny * pushDir * (overlap + 2);
            } else {
              // Normal elastic collision
              const dvx = a.vx - b.vx, dvy = a.vy - b.vy;
              const dvn = dvx * nx + dvy * ny;

              if (dvn > 0) {
                const impulse = dvn * COLLISION_RESTITUTION;
                a.vx -= impulse * nx;
                a.vy -= impulse * ny;
                b.vx += impulse * nx;
                b.vy += impulse * ny;

                // Transfer spin from impact
                a.angularVel -= impulse * 1.5;
                b.angularVel += impulse * 1.5;

                // Wake up settled cards
                a.onGround = false;
                b.onGround = false;
              }

              // Separate overlap
              const overlap = minDist - dist;
              const sep = overlap / 2 + 1;
              a.x -= nx * sep;
              a.y -= ny * sep;
              b.x += nx * sep;
              b.y += ny * sep;
            }
          }
        }
      }

      if (needsRender) setRenderTick((t) => t + 1);
      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // ── Pointer drag with velocity tracking ────
  const handlePointerDown = useCallback((e, cardId) => {
    e.preventDefault();
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const card = cardsRef.current.find((c) => c.id === cardId);
    if (!card) return;

    dragIdRef.current = cardId;
    card.vx = 0;
    card.vy = 0;
    card.onGround = false;

    const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    dragOffsetRef.current = { x: clientX - rect.left - card.x, y: clientY - rect.top - card.y };
    mouseHistoryRef.current = [{ x: clientX, y: clientY, t: Date.now() }];

    el.setPointerCapture?.(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e) => {
    if (!dragIdRef.current) return;
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const card = cardsRef.current.find((c) => c.id === dragIdRef.current);
    if (!card) return;

    const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;

    // Track mouse history (keep last 5 for smooth velocity calculation)
    const now = Date.now();
    mouseHistoryRef.current.push({ x: clientX, y: clientY, t: now });
    if (mouseHistoryRef.current.length > 5) mouseHistoryRef.current.shift();

    card.x = clientX - rect.left - dragOffsetRef.current.x;
    card.y = clientY - rect.top - dragOffsetRef.current.y;

    // Clamp
    card.x = Math.max(0, Math.min(rect.width - CARD_W, card.x));
    card.y = Math.max(0, Math.min(rect.height - CARD_H, card.y));

    setRenderTick((t) => t + 1);
  }, []);

  const handlePointerUp = useCallback(() => {
    if (!dragIdRef.current) return;
    const card = cardsRef.current.find((c) => c.id === dragIdRef.current);

    if (card) {
      // Calculate velocity from mouse history (average of recent deltas for smoothness)
      const hist = mouseHistoryRef.current;
      if (hist.length >= 2) {
        // Use the oldest and newest points for a smooth average
        const oldest = hist[0];
        const newest = hist[hist.length - 1];
        const dt = (newest.t - oldest.t) || 16;
        const factor = Math.min(16 / dt, 1.5); // scale to ~60fps
        card.vx = (newest.x - oldest.x) / (hist.length - 1) * factor * 1.4;
        card.vy = (newest.y - oldest.y) / (hist.length - 1) * factor * 1.4;
      } else {
        card.vx = 0;
        card.vy = 0;
      }

      // Cap max throw velocity
      const maxV = 25;
      const speed = Math.sqrt(card.vx * card.vx + card.vy * card.vy);
      if (speed > maxV) { card.vx = (card.vx / speed) * maxV; card.vy = (card.vy / speed) * maxV; }

      // Add spin from throw direction
      card.angularVel = card.vx * 0.3;
      card.onGround = false;
    }
    dragIdRef.current = null;
    mouseHistoryRef.current = [];
  }, []);

  useEffect(() => {
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [handlePointerMove, handlePointerUp]);

  const cards = cardsRef.current;

  return (
    <section className="py-20 sm:py-28 border-y border-[#46484c]/10 overflow-hidden">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-6">
          <span className="text-xs font-bold text-[#e08efe] uppercase tracking-widest">Interactive Playground</span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mt-3 mb-3">
            Every API method, one canvas.
          </h2>
          <p className="text-[#73757a] max-w-md mx-auto">
            Drag them. Throw them. Smash them together. <span className="text-[#a9abb0]">Just like your APIs in production.</span>
          </p>
        </div>

        {/* Physics container — transparent, no border */}
        <div
          ref={containerRef}
          className="relative w-full cursor-grab active:cursor-grabbing select-none touch-none"
          style={{ height: 380 }}
        >

          {cards.map((card) => {
            const isDragging = dragIdRef.current === card.id;
            return (
              <div
                key={card.id}
                onPointerDown={(e) => handlePointerDown(e, card.id)}
                className="absolute select-none touch-none"
                style={{
                  left: Math.round(card.x),
                  top: Math.round(card.y),
                  width: CARD_W,
                  height: CARD_H,
                  zIndex: isDragging ? 50 : 10,
                  transform: `rotate(${Math.round(card.rotation)}deg) scale(${isDragging ? 1.1 : 1})`,
                }}
              >
                <div
                  className="w-full h-full rounded-full flex items-center justify-center gap-2 px-5 cursor-grab active:cursor-grabbing"
                  style={{
                    background: card.bg,
                    boxShadow: isDragging ? "0 6px 20px rgba(0,0,0,0.4)" : "0 2px 6px rgba(0,0,0,0.3)",
                  }}
                >
                  <span className="text-sm font-extrabold uppercase tracking-wide text-white">
                    {card.label}
                  </span>
                  <span className="text-xs font-bold text-white/70">
                    {card.endpoint}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Helper text */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] text-[#46484c] font-medium uppercase tracking-widest pointer-events-none">
            Drag & throw the pills
          </div>
        </div>
      </div>
    </section>
  );
};

export default PhysicsPlayground;
