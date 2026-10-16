"use client";
// Accessible single-select menu (button + popup listbox, WAI-ARIA "select-only combobox" style):
// arrow keys, Home/End, type-ahead, Enter/Space to choose, Escape to close; the chosen option shows "Current".
// Shared by the language and currency menus so they look and behave the same.

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export type MenuOption<V extends string> = {
  value: V;
  /** Plain text: type-ahead and the trigger's accessible name. */
  text: string;
  label: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  lang?: string;
};

export function OptionMenu<V extends string>({
  title, value, options, trigger, triggerLabel, onSelect, currentLabel, footer, pending = false, block = false, compact = false,
}: {
  title: string;
  value: V;
  options: MenuOption<V>[];
  trigger: ReactNode;
  triggerLabel: string;
  onSelect: (value: V) => void;
  currentLabel: string;
  footer?: ReactNode;
  pending?: boolean;
  /** Full-width trigger and popup (mobile menu). */
  block?: boolean;
  /** Small header trigger: icon + short code. */
  compact?: boolean;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));

  const openMenu = (index = selectedIndex) => { setActive(index); setOpen(true); };
  const close = (refocus: boolean) => { setOpen(false); if (refocus) buttonRef.current?.focus(); };
  const choose = (index: number) => {
    const option = options[index];
    close(true);
    if (option && option.value !== value) onSelect(option.value);
  };

  useEffect(() => {
    if (!open) return;
    listRef.current?.focus();
    const onPointer = (e: PointerEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  useEffect(() => {
    if (open) document.getElementById(`${id}-opt-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, id]);

  const onListKey = (e: React.KeyboardEvent) => {
    const last = options.length - 1;
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); setActive((i) => (i >= last ? 0 : i + 1)); break;
      case "ArrowUp": e.preventDefault(); setActive((i) => (i <= 0 ? last : i - 1)); break;
      case "Home": e.preventDefault(); setActive(0); break;
      case "End": e.preventDefault(); setActive(last); break;
      case "Enter": case " ": e.preventDefault(); choose(active); break;
      case "Escape": e.preventDefault(); e.stopPropagation(); close(true); break; // close only this menu
      case "Tab": setOpen(false); break;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const now = e.timeStamp; // the event's own clock keeps render pure
          typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : "") + e.key.toLowerCase(), at: now };
          // Match the start of any word, so "t" finds "ภาษาไทย Thai" and "e" finds "EUR Euro".
          const hit = options.findIndex((o) => o.text.toLowerCase().split(/\s+/).some((w) => w.startsWith(typed.current.text)));
          if (hit >= 0) setActive(hit);
        }
    }
  };

  return (
    <div ref={rootRef} className={`relative ${block ? "w-full" : ""}`}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={triggerLabel}
        aria-busy={pending || undefined}
        // Not `disabled` while saving: a disabled button drops keyboard focus to the page top.
        aria-disabled={pending || undefined}
        onClick={() => {
          if (pending) return;
          if (open) close(false);
          else openMenu();
        }}
        onKeyDown={(e) => {
          if (pending) return;
          if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); openMenu(e.key === "ArrowUp" ? options.length - 1 : selectedIndex); }
        }}
        className={`inline-flex items-center rounded-full border border-silver bg-paper font-medium text-ink transition-colors hover:border-field hover:bg-ice aria-disabled:cursor-progress aria-disabled:opacity-70 aria-expanded:border-field aria-expanded:bg-ice ${compact ? "h-9 gap-1.5 px-2.5 text-[13px]" : "min-h-11 gap-2 px-3 text-sm"} ${block ? "w-full justify-between rounded-xl" : ""}`}
      >
        <span className={`inline-flex min-w-0 items-center ${compact ? "gap-1.5" : "gap-2"}`}>{trigger}</span>
        {pending ? (
          <span aria-hidden="true" className="size-3.5 animate-spin rounded-full border-2 border-silver border-t-ink" />
        ) : (
          <svg aria-hidden="true" viewBox="0 0 12 12" className={`${compact ? "size-2.5" : "size-3"} shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        )}
      </button>

      {open && (
        <div className={`menu-pop z-50 rounded-2xl border border-silver bg-paper p-1.5 text-ink shadow-[var(--shadow-lg)] ${block ? "relative mt-2 w-full" : "absolute top-[calc(100%+8px)] end-0 w-72 max-w-[calc(100vw-2rem)]"}`}>
          <p id={`${id}-title`} className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted">{title}</p>
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-labelledby={`${id}-title`}
            aria-activedescendant={`${id}-opt-${active}`}
            onKeyDown={onListKey}
            className="max-h-[min(60vh,22rem)] overflow-y-auto outline-none"
          >
            {options.map((o, i) => {
              const selected = o.value === value;
              return (
                <li
                  key={o.value}
                  id={`${id}-opt-${i}`}
                  role="option"
                  aria-selected={selected}
                  onPointerMove={() => setActive(i)}
                  onClick={() => choose(i)}
                  className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 ${i === active ? "bg-ice" : ""} ${selected ? "font-semibold" : ""}`}
                >
                  {o.icon}
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate" lang={o.lang}>{o.label}</span>
                    {o.description && <span className="block truncate text-xs font-normal text-muted">{o.description}</span>}
                  </span>
                  {selected && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-blue/12 px-2 py-0.5 text-xs font-semibold text-blue-ink">
                      <svg aria-hidden="true" viewBox="0 0 12 12" className="size-3"><path d="m2.5 6.2 2.3 2.3 4.7-4.9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      {currentLabel}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {footer && <div className="mt-1 border-t border-silver px-3 pb-2 pt-2 text-xs leading-relaxed text-muted">{footer}</div>}
        </div>
      )}
    </div>
  );
}
