"use client";
import { useState, Suspense, lazy, Component, type ReactNode } from "react";
import Link from "next/link";
import { useI18n } from "@/i18n/provider";

// Load the WebRTC SDK only after opening voice. Once mounted, it survives navigation.
const Session = lazy(() => import("./VoiceAgentSession").then(m => ({ default: m.VoiceAgentSession })));
class VoiceLoadBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
export function VoiceAgentDock({ userName }: { userName: string }) {
  const [opened, setOpened] = useState(false);
  const { t } = useI18n();
  const fallback = <div className="voice-dock fixed z-50"><Link href="/assistant" className="btn btn-primary">{t("Ask AI")}</Link></div>;
  if (opened) return <VoiceLoadBoundary fallback={fallback}><Suspense fallback={<div className="voice-dock fixed z-50"><button className="voice-launcher btn btn-primary" disabled aria-busy="true" aria-label={t("Loading…")}><span aria-hidden="true">…</span><span className="hidden sm:inline">{t("Talk to U-Estate")}</span></button></div>}><Session userName={userName} /></Suspense></VoiceLoadBoundary>;
  return <div className="voice-dock fixed z-50"><button type="button" onClick={() => setOpened(true)} className="voice-launcher rounded-full bg-ink px-5 py-3 font-semibold text-paper shadow-lg" aria-label={t("Talk to U-Estate")} aria-expanded={false}><span aria-hidden="true">🎙</span><span className="hidden sm:inline">{t("Talk to U-Estate")}</span></button></div>;
}
