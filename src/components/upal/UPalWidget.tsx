"use client";
import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { UPAL_COPY, UPAL_UI } from "@/i18n/upal";
import { LOCALE_INFO } from "@/lib/locale";
import { pickQuestion, questionsFor } from "@/lib/upal";
import { UPalChat } from "./UPalChat";
import { useUPal } from "./UPalProvider";
import { CloseIcon, UPalAvatar } from "./icons";

// The global U-Pal: a round button with the official U-Pal artwork in the bottom-right corner of every page, a
// Messenger-style bubble with one question for the current page, and one modal for typed and spoken chat.
// Mounted once in the root layout (through UPalProvider), rendered into <body> so no page container can clip it.

const BUBBLE_DELAY_MS = 1200;
const PHONE_BUBBLE_MS = 12_000;
const MAX_DISMISSALS = 3; // after three "not now"s, stop offering questions for the rest of the session
const DISMISSED_KEY = "upal:dismissed";
const lastKey = (kind: string) => `upal:last:${kind}`;

// sessionStorage can throw (private mode, blocked storage): the bubble then just follows in-memory state.
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
  const { open, openAssistant, closeAssistant, ask, page, locale, tier, voice } = useUPal();
  const [bubble, setBubble] = useState<{ key: string; text: string } | null>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const ui = UPAL_UI[locale];
  const inCall = voice.status === "connected";
  const pageKey = `${page.path}|${page.kind}`;

  // One contextual question per page visit: picked when the page (or its kind) changes, never on ordinary re-renders,
  // rotating so the same page does not repeat its last question.
  const questionKey = `${pageKey}|${locale}|${tier}`;
  useEffect(() => {
    if (open) return;
    const list = questionsFor(UPAL_COPY[locale].questions, page.kind, tier);
    if (list.length === 0 || Number(readSession(DISMISSED_KEY) ?? 0) >= MAX_DISMISSALS) return;
    const timer = setTimeout(() => {
      const text = pickQuestion(list, readSession(lastKey(page.kind)));
      if (!text) return;
      writeSession(lastKey(page.kind), text);
      setBubble({ key: questionKey, text });
    }, BUBBLE_DELAY_MS);
    return () => clearTimeout(timer);
    // `open` is left out on purpose: closing the assistant must not offer a new question on the same page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionKey]);
  const shownBubble = bubble?.key === questionKey && !open ? bubble.text : null;

  // Phones have little room: the question steps aside after a while (not counted as a dismissal).
  useEffect(() => {
    if (!shownBubble || !matchMedia("(max-width: 639px)").matches) return;
    const timer = setTimeout(() => setBubble(null), PHONE_BUBBLE_MS);
    return () => clearTimeout(timer);
  }, [shownBubble]);

  // The modal: a real <dialog> (top layer, focus kept inside, page inert behind it). State lives in the provider.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      const active = document.activeElement;
      returnFocus.current ??= active instanceof HTMLElement && active !== document.body ? active : null;
      dialog.showModal();
      inputRef.current?.focus({ preventScroll: true });
    } else if (!open && dialog.open) {
      dialog.close();
      const back = returnFocus.current?.isConnected ? returnFocus.current : launcherRef.current;
      returnFocus.current = null;
      back?.focus({ preventScroll: true });
    }
  }, [open, mounted]);

  function askBubble(text: string) {
    returnFocus.current = launcherRef.current; // the bubble goes away once its question is asked
    setBubble(null);
    ask(text);
  }
  function dismissBubble() {
    setBubble(null);
    writeSession(DISMISSED_KEY, String(Number(readSession(DISMISSED_KEY) ?? 0) + 1));
    launcherRef.current?.focus({ preventScroll: true });
  }

  if (!mounted) return null;

  return createPortal(
    <div className="upal-root" dir={LOCALE_INFO[locale].dir}>
      {shownBubble && (
        <div className="upal-ask" aria-live="polite">
          <button type="button" className="upal-ask-text" onClick={() => askBubble(shownBubble)} aria-describedby="upal-ask-hint" lang={locale}>
            <span className="upal-ask-name">U-Pal</span>
            {shownBubble}
          </button>
          <span id="upal-ask-hint" className="sr-only">{ui.bubble}</span>
          <button type="button" className="upal-ask-close" onClick={dismissBubble} aria-label={ui.dismiss} title={ui.dismiss}><CloseIcon size={14} /></button>
        </div>
      )}

      <button
        ref={launcherRef}
        type="button"
        className="upal-launcher"
        data-open={open}
        onClick={() => (open ? closeAssistant() : openAssistant())}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="upal-dialog"
        aria-label={inCall ? `${ui.open} (${ui.inCall})` : ui.open}
        title="U-Pal"
      >
        <Image src="/brand/u-pal.png" alt="" width={60} height={60} sizes="60px" priority={false} className="upal-launcher-img" />
        {inCall && <span aria-hidden="true" className="upal-launcher-live" />}
      </button>

      <dialog
        ref={dialogRef}
        id="upal-dialog"
        className="upal-dialog"
        aria-labelledby="upal-title"
        onCancel={(e) => {
          e.preventDefault(); // Escape: close through the provider so voice is ended and state stays in sync
          closeAssistant();
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeAssistant(); // a click on the backdrop, outside the sheet
        }}
      >
        <div className="upal-sheet" dir={LOCALE_INFO[locale].dir}>
          <header className="upal-header">
            <UPalAvatar size={40} />
            <div className="min-w-0 flex-1">
              <h2 id="upal-title" className="upal-title">U-Pal</h2>
              <p className="upal-subtitle">{ui.subtitle}</p>
            </div>
            <button type="button" className="upal-headbtn" onClick={closeAssistant} aria-label={ui.close} title={ui.close}><CloseIcon /></button>
          </header>
          {open && <UPalChat variant="panel" inputRef={inputRef} />}
        </div>
      </dialog>
    </div>,
    document.body,
  );
}
