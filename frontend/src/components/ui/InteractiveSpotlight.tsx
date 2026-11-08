import { useCallback, useRef, type HTMLAttributes, type PointerEvent, type ReactNode } from "react";

/**
 * Pointer-follow lighting. Writes --mx/--my (and --rx/--ry when tilt is on) straight onto the
 * element, throttled to one write per frame, so React never re-renders while the mouse moves.
 * Touch and pen input are ignored; the CSS gives those a plain :active state instead.
 */
export function useSpotlight(tilt = false) {
  const frame = useRef(0);

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType !== "mouse") return;
      const el = event.currentTarget;
      const { clientX, clientY } = event;
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        el.style.setProperty("--mx", `${x}px`);
        el.style.setProperty("--my", `${y}px`);
        if (tilt) {
          // Max 2 degrees either way.
          el.style.setProperty("--ry", `${((x / rect.width - 0.5) * 4).toFixed(2)}deg`);
          el.style.setProperty("--rx", `${((0.5 - y / rect.height) * 4).toFixed(2)}deg`);
        }
      });
    },
    [tilt],
  );

  const onPointerLeave = useCallback((event: PointerEvent<HTMLElement>) => {
    cancelAnimationFrame(frame.current);
    const el = event.currentTarget;
    el.style.removeProperty("--rx");
    el.style.removeProperty("--ry");
  }, []);

  return { onPointerMove, onPointerLeave };
}

type Props = HTMLAttributes<HTMLElement> & {
  as?: "div" | "section" | "article";
  tilt?: boolean;
  children?: ReactNode;
};

export default function InteractiveSpotlight({ as: Tag = "div", tilt = false, className = "", children, ...rest }: Props) {
  const handlers = useSpotlight(tilt);
  return (
    <Tag className={`spotlight ${className}`.trim()} {...handlers} {...rest}>
      {children}
    </Tag>
  );
}

/** Card classes that get pointer light from the stylesheet (see "Smart glass" in glass.css). */
const SMART_CARDS = [
  ".workspace-panel", ".metric-card", ".settings-card", ".empty-state", ".detail-panel", ".admin-card",
  ".search-result-card", ".ai-card", ".doc-card", ".stat-card", ".option-card", ".step", ".admin-table-wrap",
  ".assistant-workspace", ".audience-item", ".demo-panel",
].join(",");

/** One delegated listener for every card, so pages need no per-card handlers. Call once at startup. */
export function installSpotlight() {
  let frame = 0;
  document.addEventListener(
    "pointermove",
    (event) => {
      if (event.pointerType !== "mouse" || !(event.target instanceof Element)) return;
      const el = event.target.closest<HTMLElement>(SMART_CARDS);
      if (!el) return;
      const { clientX, clientY } = event;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${clientX - rect.left}px`);
        el.style.setProperty("--my", `${clientY - rect.top}px`);
      });
    },
    { passive: true },
  );
}
