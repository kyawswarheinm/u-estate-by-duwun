"use client";

// One floating panel for the market filters, rendered into <body> so no container's overflow or stacking context can
// clip it. "popover": below its trigger, kept inside the viewport. "drawer": a side panel. On phones both become a
// bottom sheet. Closes on outside click and Escape, moves focus in on open and back to the trigger on close.
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

const PHONE = "(max-width: 639px)";
const subscribe = (cb: () => void) => {
  const mq = window.matchMedia(PHONE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const usePhone = () => useSyncExternalStore(subscribe, () => window.matchMedia(PHONE).matches, () => false);
const GUTTER = 16;

export function FilterPopover({ open, onClose, anchorRef, title, children, footer, variant = "popover", width = 360, id, closeLabel }: {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  variant?: "popover" | "drawer";
  width?: number;
  id: string;
  closeLabel: string;
}) {
  const phone = usePhone();
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const floating = variant === "popover" && !phone;

  // Below the trigger, aligned to its start edge, nudged back inside the viewport.
  useLayoutEffect(() => {
    if (!open || !floating) return;
    const place = () => {
      const r = anchorRef.current?.getBoundingClientRect();
      if (!r) return;
      const w = Math.min(width, window.innerWidth - 2 * GUTTER);
      const rtl = document.documentElement.dir === "rtl";
      const start = rtl ? r.right - w : r.left;
      setPos({ top: r.bottom + 8, left: Math.min(Math.max(start, GUTTER), window.innerWidth - w - GUTTER) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, floating, anchorRef, width]);

  useEffect(() => {
    if (!open) return;
    const anchor = anchorRef.current;
    const first = panelRef.current?.querySelector<HTMLElement>("input, select, button, [href], [tabindex]:not([tabindex='-1'])");
    first?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !anchor?.contains(t)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
      anchor?.focus({ preventScroll: true });
    };
  }, [open, onClose, anchorRef]);

  if (!open || typeof document === "undefined") return null;

  const shape = floating ? "filter-pop" : phone ? "filter-sheet" : "filter-drawer";
  return createPortal(
    <>
      {!floating && <div className="filter-backdrop" aria-hidden="true" />}
      <div
        ref={panelRef}
        id={id}
        role="dialog"
        aria-modal={!floating}
        aria-labelledby={`${id}-title`}
        className={shape}
        style={floating ? { top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: Math.min(width, window.innerWidth - 2 * GUTTER) } : undefined}
      >
        <div className="filter-pop-head">
          <h2 id={`${id}-title`} className="filter-pop-title">{title}</h2>
          {!floating && (
            <button type="button" className="filter-pop-close" onClick={onClose} aria-label={closeLabel}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          )}
        </div>
        <div className="filter-pop-body">{children}</div>
        {footer && <div className="filter-pop-foot">{footer}</div>}
      </div>
    </>,
    document.body,
  );
}
