/**
 * Motion for the landing page.
 *
 * Three rules hold everything here together:
 *
 *  – **Only transform, opacity and filter animate.** Nothing in these hooks
 *    writes a property that makes the browser lay the page out again, so a
 *    scroll stays at frame rate on a laptop that is already busy.
 *  – **The work stops when it is done.** Every observer disconnects after it
 *    has fired, and every pointer handler is folded into one animation frame,
 *    so an idle page costs nothing.
 *  – **The OS setting wins.** `prefers-reduced-motion: reduce` means content
 *    appears in its final state immediately — visible, never hidden by a
 *    transition that was asked not to run.
 */
import { useCallback, useEffect, useRef, useState } from "react";

/** True when the visitor has asked for less movement. */
export const prefersReducedMotion = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

/**
 * Reveal a block the first time it scrolls into view: attach `ref`, and the
 * element gets `data-visible="true"` once. The CSS decides what that means,
 * so a section can rise, a line can draw, or a number can start counting
 * from the same signal.
 */
export const useReveal = ({ threshold = 0.18, rootMargin = "0px 0px -8% 0px", once = true } = {}) => {
  const ref = useRef(null);
  // Without an observer, or with motion turned down, the block starts shown
  // rather than being revealed — decided here so no effect has to undo it.
  const [visible, setVisible] = useState(
    () => prefersReducedMotion() || typeof IntersectionObserver === "undefined",
  );

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    if (visible) {
      element.dataset.visible = "true";
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            if (!once) {
              setVisible(false);
              element.dataset.visible = "false";
            }
            return;
          }
          setVisible(true);
          element.dataset.visible = "true";
          if (once) observer.disconnect();
        });
      },
      { threshold, rootMargin },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [threshold, rootMargin, once, visible]);

  return [ref, visible];
};

/**
 * Count from zero to `value` once the element is in view. The text sits at
 * the final number whenever motion is reduced, so nobody reads a figure
 * that is still climbing.
 */
export const useCountUp = (value, { duration = 1100 } = {}) => {
  const [ref, visible] = useReveal({ threshold: 0.4 });
  const [shown, setShown] = useState(0);
  const reduced = prefersReducedMotion();

  useEffect(() => {
    if (!visible || reduced) return undefined;
    let frame = 0;
    const started = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - started) / duration);
      // Ease out cubic: fast at first, settling into the number.
      setShown(Math.round(value * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [visible, value, duration, reduced]);

  // Reduced motion reads the final figure, never one still climbing.
  return [ref, reduced ? value : shown];
};

/**
 * A light that follows the pointer across a card. The handler only writes
 * two custom properties, and only inside an animation frame, so hovering a
 * grid of cards costs one style recalculation per frame at most.
 */
export const useSpotlight = () => {
  const frame = useRef(0);

  const onPointerMove = useCallback((event) => {
    const element = event.currentTarget;
    if (frame.current) return;
    const { clientX, clientY } = event;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const rect = element.getBoundingClientRect();
      element.style.setProperty("--mx", `${((clientX - rect.left) / rect.width) * 100}%`);
      element.style.setProperty("--my", `${((clientY - rect.top) / rect.height) * 100}%`);
    });
  }, []);

  useEffect(() => () => frame.current && cancelAnimationFrame(frame.current), []);

  // A touch screen has no pointer to follow, and reduced motion means none either.
  if (prefersReducedMotion()) return {};
  return { onPointerMove, className: "spotlight" };
};

/**
 * Parallax for the hero art: the panel leans a few pixels towards the
 * pointer. Bounded to `depth` px so it reads as depth rather than drift,
 * and switched off entirely for touch and reduced motion.
 */
export const usePointerParallax = ({ depth = 10 } = {}) => {
  const ref = useRef(null);
  const frame = useRef(0);

  useEffect(() => {
    const element = ref.current;
    if (!element || prefersReducedMotion()) return undefined;
    if (typeof window !== "undefined" && window.matchMedia("(hover: none)").matches) return undefined;

    const onMove = (event) => {
      if (frame.current) return;
      const { clientX, clientY } = event;
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        const x = (clientX / window.innerWidth - 0.5) * 2;
        const y = (clientY / window.innerHeight - 0.5) * 2;
        element.style.setProperty("--px", `${(x * depth).toFixed(2)}px`);
        element.style.setProperty("--py", `${(y * depth * 0.6).toFixed(2)}px`);
        element.style.setProperty("--rx", `${(-y * 1.6).toFixed(2)}deg`);
        element.style.setProperty("--ry", `${(x * 2).toFixed(2)}deg`);
      });
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [depth]);

  return ref;
};
