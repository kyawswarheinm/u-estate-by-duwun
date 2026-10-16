"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { UPAL_COPY, UPAL_UI } from "@/i18n/upal";
import { LOCALE_INFO } from "@/lib/locale";
import { UPalChat } from "./UPalChat";
import { useUPal } from "./UPalProvider";
import { CloseIcon, MinimizeIcon, SparkleIcon, UPalAvatar } from "./icons";

// Floating U-Pal: a compact pill in the corner that opens a chat panel. Rendered through a portal into <body>,
// so no page container's overflow or stacking context can clip it. Layers use the --z-* tokens in globals.css.

const INVITE_DELAY_MS = 1500;
const INVITE_SHOW_MS = 7000;
const DISMISSED_KEY = "upal:invites-dismissed";
const SEEN_KEY = "upal:invites-seen";

// sessionStorage can throw (private mode, blocked storage): invitations then just follow the in-memory state.
function readSession(key: string) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeSession(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {}
}

const subscribeNoop = () => () => {};
const useMounted = () => useSyncExternalStore(subscribeNoop, () => true, () => false);

export function UPalWidget() {
  const mounted = useMounted();
  const { open, setOpen, page, locale, voice } = useUPal();
  const [invite, setInvite] = useState<string | null>(null);
  const pillRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const seen = useRef<Set<string>>(new Set());
  const ui = UPAL_UI[locale];
  const onAssistantPage = page.kind === "assistant";
  const inCall = voice.status === "connected";

  // The /assistant page is the full-size chat: hide the floating panel there.
  const [lastKind, setLastKind] = useState(page.kind);
  if (lastKind !== page.kind) {
    setLastKind(page.kind);
    if (page.kind === "assistant" && open) setOpen(false);
    if (invite) setInvite(null);
  }

  // A short, dismissible invitation per kind of page, once per session, never while the chat is open.
  useEffect(() => {
    if (open || onAssistantPage) return;
    const text = UPAL_COPY[locale].invite[page.kind];
    if (!text || readSession(DISMISSED_KEY)) return;
    const stored = readSession(SEEN_KEY);
    if (stored) for (const k of stored.split(",")) seen.current.add(k);
    if (seen.current.has(page.kind)) return;
    let hide: ReturnType<typeof setTimeout> | undefined;
    const show = setTimeout(() => {
      seen.current.add(page.kind);
      writeSession(SEEN_KEY, [...seen.current].join(","));
      setInvite(text);
      hide = setTimeout(() => setInvite(null), INVITE_SHOW_MS);
    }, INVITE_DELAY_MS);
    return () => {
      clearTimeout(show);
      if (hide) clearTimeout(hide);
    };
  }, [page.kind, open, onAssistantPage, locale]);

  useEffect(() => {
    if (open) inputRef.current?.focus({ preventScroll: true });
  }, [open]);

  function openPanel() {
    setInvite(null);
    setOpen(true);
  }
  function minimize() {
    setOpen(false);
    pillRef.current?.focus();
  }
  function close() {
    if (inCall) voice.end();
    minimize();
  }
  function dismissInvite() {
    setInvite(null);
    writeSession(DISMISSED_KEY, "1");
  }

  if (!mounted || onAssistantPage) return null;

  return createPortal(
    <div className="upal-root" dir={LOCALE_INFO[locale].dir}>
      <section
        id="upal-panel"
        role="dialog"
        aria-modal="false"
        aria-labelledby="upal-title"
        data-open={open}
        inert={!open}
        className="upal-panel"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            minimize();
          }
        }}
      >
        <header className="upal-header">
          <UPalAvatar size={36} />
          <div className="min-w-0 flex-1">
            <h2 id="upal-title" className="upal-title">U-Pal</h2>
            <p className="upal-subtitle">{ui.subtitle}</p>
          </div>
          <button type="button" className="upal-headbtn" onClick={minimize} aria-label={ui.minimize} title={ui.minimize}><MinimizeIcon /></button>
          <button type="button" className="upal-headbtn" onClick={close} aria-label={ui.close} title={ui.close}><CloseIcon /></button>
        </header>
        <UPalChat variant="panel" inputRef={inputRef} />
      </section>

      {invite && !open && (
        <div className="upal-invite" role="status">
          <button type="button" className="upal-invite-text" onClick={openPanel}>{invite}</button>
          <button type="button" className="upal-invite-close" onClick={dismissInvite} aria-label={ui.dismiss} title={ui.dismiss}><CloseIcon size={14} /></button>
        </div>
      )}

      <button
        ref={pillRef}
        type="button"
        className="upal-pill"
        onClick={() => (open ? minimize() : openPanel())}
        aria-expanded={open}
        aria-controls="upal-panel"
      >
        <span className="upal-pill-icon"><SparkleIcon size={16} /></span>
        <span>{inCall ? ui.inCall : ui.open}</span>
        {inCall && <span aria-hidden="true" className="upal-live-dot" />}
      </button>
    </div>,
    document.body,
  );
}
