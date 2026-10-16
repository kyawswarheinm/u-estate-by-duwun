"use client";
import Link from "next/link";
import { useId, useState } from "react";

export type GraphNode = {
  id: string;
  label: string;
  sharePct: number;
  kind: "member" | "you" | "pool" | "property";
  /** Second line in the details card, already formatted (units, value…). */
  detail?: string;
  href?: string;
};

// An ownership relationship graph: one centre (a property, or "you") and its owners or holdings around it.
// Node size and edge width follow the share. Every node is a focusable button; the details card below names the
// focused node in text, so nothing depends on colour or pointer. The page also renders the same data as a table.
const SIZE = 400, C = SIZE / 2, RING = 148;

export function OwnershipGraph({ center, nodes, title, summary, legend }: {
  center: { label: string; detail?: string };
  nodes: GraphNode[];
  title: string;
  summary: string;
  legend: { you?: string; member?: string; pool?: string; property?: string };
}) {
  const uid = useId();
  const [active, setActive] = useState<string | null>(null);
  const max = Math.max(1, ...nodes.map((n) => n.sharePct));
  const placed = nodes.map((n, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(1, nodes.length);
    const r = 9 + 21 * Math.sqrt(n.sharePct / max);
    return { ...n, x: C + RING * Math.cos(angle), y: C + RING * Math.sin(angle), r };
  });
  const current = placed.find((n) => n.id === active) ?? null;
  const showLabels = nodes.length <= 12;
  const color = (k: GraphNode["kind"]) => (k === "you" ? "var(--blue)" : k === "pool" ? "var(--silver)" : k === "property" ? "var(--midnight)" : "var(--deep)");

  return (
    <figure className="grid gap-3" aria-labelledby={`${uid}-title`}>
      <figcaption id={`${uid}-title`} className="text-sm font-semibold text-deep">{title}</figcaption>
      <div className="relative mx-auto aspect-square w-full max-w-[420px]" dir="ltr">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="absolute inset-0 h-full w-full" role="group" aria-label={summary}>
          {placed.map((n) => (
            <line key={`e-${n.id}`} x1={C} y1={C} x2={n.x} y2={n.y} stroke={color(n.kind)} strokeOpacity={active && active !== n.id ? 0.18 : 0.55}
              strokeWidth={1.5 + 9 * (n.sharePct / max)} strokeDasharray={n.kind === "pool" ? "6 6" : undefined} strokeLinecap="round" />
          ))}
          <circle cx={C} cy={C} r={46} fill="var(--midnight)" />
          {placed.map((n) => (
            <g key={n.id} role="button" tabIndex={0} aria-label={`${n.label}: ${n.sharePct}%${n.detail ? `, ${n.detail}` : ""}`} aria-pressed={active === n.id}
              onMouseEnter={() => setActive(n.id)} onMouseLeave={() => setActive((a) => (a === n.id ? null : a))}
              onFocus={() => setActive(n.id)} onBlur={() => setActive((a) => (a === n.id ? null : a))}
              onClick={() => setActive(n.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setActive(n.id); } }}
              className="cursor-pointer outline-none [&:focus-visible>circle:first-child]:stroke-[var(--blue-ink)]">
              <circle cx={n.x} cy={n.y} r={n.r + 6} fill="transparent" stroke="transparent" strokeWidth={3} />
              <circle cx={n.x} cy={n.y} r={n.r} fill={n.kind === "pool" ? "var(--paper)" : color(n.kind)} stroke={n.kind === "pool" ? "var(--field-border)" : "var(--paper)"}
                strokeWidth={n.kind === "pool" ? 2 : 3} strokeDasharray={n.kind === "pool" ? "4 3" : undefined} opacity={active && active !== n.id ? 0.55 : 1} />
            </g>
          ))}
        </svg>
        {/* HTML labels stay readable at any width (SVG text would shrink with the drawing). */}
        <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 w-[22%] -translate-x-1/2 -translate-y-1/2 text-center text-[11px] font-semibold leading-tight text-on-strong">{center.label}</span>
        {placed.map((n) => (showLabels || active === n.id) && (
          <span key={`l-${n.id}`} aria-hidden="true"
            className={`pointer-events-none absolute max-w-[28%] -translate-x-1/2 truncate rounded px-1 text-center text-[11px] leading-tight ${active === n.id ? "bg-paper font-semibold text-ink shadow" : "text-deep"}`}
            style={{ left: `${(n.x / SIZE) * 100}%`, top: `${((n.y + n.r + 4) / SIZE) * 100}%` }}>
            {n.label} · {n.sharePct}%
          </span>
        ))}
      </div>
      <div role="status" aria-live="polite" className="min-h-[3.25rem] rounded-xl border border-silver bg-ice px-4 py-2 text-sm">
        {current ? (
          <>
            <p className="font-semibold">{current.label} · {current.sharePct}%</p>
            {current.detail && <p className="text-deep">{current.detail}</p>}
            {current.href && <Link href={current.href} className="font-semibold text-blue-ink underline">{current.label} →</Link>}
          </>
        ) : (
          <p className="text-deep">{center.detail ?? center.label}</p>
        )}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-deep" aria-hidden="true">
        {legend.you && <li className="inline-flex items-center gap-1.5"><span className="inline-block size-3 rounded-full bg-blue" />{legend.you}</li>}
        {legend.member && <li className="inline-flex items-center gap-1.5"><span className="inline-block size-3 rounded-full bg-deep" />{legend.member}</li>}
        {legend.property && <li className="inline-flex items-center gap-1.5"><span className="inline-block size-3 rounded-full bg-midnight" />{legend.property}</li>}
        {legend.pool && <li className="inline-flex items-center gap-1.5"><span className="inline-block size-3 rounded-full border-2 border-dashed border-field bg-paper" />{legend.pool}</li>}
      </ul>
    </figure>
  );
}
