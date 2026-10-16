// Price-index history + the TimesFM-based 12-month forecast (p10–p90 band, dashed central line), D-42.
// Server-rendered from snapshot numbers only. Lines are SVG with non-scaling strokes; every label is HTML
// positioned by percentage, so text stays readable from 360 px phones to wide screens. Time runs left to
// right in every language (dir="ltr").
import type { ReactNode } from "react";

type Point = { period: string; value: number };
type Band = { period: string; p10: number; p50: number; p90: number };

const VW = 1000, VH = 400, TOP = 56, BOTTOM = 8; // viewBox units; TOP leaves room for the end label

function niceStep(span: number) {
  const raw = span / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
}

export function ForecastChart({ history, forecast, title, isSample, months = 48, labels, summary, format, axisWidth = "2.5rem" }: {
  history: Point[];
  /** May be empty: then only the history line is drawn (e.g. a portfolio's past value). */
  forecast: Band[];
  title: ReactNode;
  isSample: boolean;
  months?: number;
  /** Already translated by the caller (strings or <Text> elements). */
  labels: { history: ReactNode; band?: ReactNode; central?: ReactNode };
  /** One sentence for screen readers and as the chart's accessible name. */
  summary: string;
  /** Formats axis ticks and value labels (default: index points with one decimal). */
  format?: (v: number) => string;
  axisWidth?: string;
}) {
  const hist = history.slice(-months);
  if (hist.length === 0) return null; // nothing to draw yet
  const last = hist[hist.length - 1];
  const end = forecast[forecast.length - 1];
  const total = Math.max(2, hist.length + forecast.length);

  const values = [...hist.map((p) => p.value), ...forecast.flatMap((f) => [f.p10, f.p90])];
  const span = Math.max(...values) - Math.min(...values);
  const step = niceStep(span || Math.max(1, Math.abs(values[0]) * 0.04)); // a flat line still gets a visible scale
  let lo = Math.floor(Math.min(...values) / step) * step;
  let hi = Math.ceil(Math.max(...values) / step) * step;
  if (hi === lo) { lo -= step; hi += step; }
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 1e6; v += step) ticks.push(Math.round(v * 100) / 100);

  const x = (i: number) => (i / (total - 1)) * VW;
  const y = (v: number) => TOP + (1 - (v - lo) / (hi - lo)) * (VH - TOP - BOTTOM);
  const fx = (k: number) => x(hist.length + k);
  const pctX = (vx: number) => `${(vx / VW) * 100}%`;
  const pctY = (vy: number) => `${(vy / VH) * 100}%`;
  const xNow = x(hist.length - 1);

  const histPath = hist.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const centralPath = [`M${xNow.toFixed(1)},${y(last.value).toFixed(1)}`, ...forecast.map((f, k) => `L${fx(k).toFixed(1)},${y(f.p50).toFixed(1)}`)].join(" ");
  const band = [
    `${xNow.toFixed(1)},${y(last.value).toFixed(1)}`,
    ...forecast.map((f, k) => `${fx(k).toFixed(1)},${y(f.p90).toFixed(1)}`),
    ...forecast.map((f, k) => `${fx(k).toFixed(1)},${y(f.p10).toFixed(1)}`).reverse(),
  ].join(" ");
  // Year ticks: every January in the window (labelled with the year).
  const all = [...hist.map((p) => p.period), ...forecast.map((f) => f.period)];
  const years = all.map((p, i) => ({ p, i })).filter(({ p }) => p.endsWith("-01"));
  const fmt = format ?? ((v: number) => v.toFixed(1));
  const tick = format ?? ((v: number) => String(v));

  return (
    <figure dir="ltr" className="grid gap-3">
      <figcaption className="flex flex-wrap items-center gap-2 text-sm font-semibold text-deep">
        {title}
        {isSample && <span className="rounded bg-amber-soft px-1.5 py-0.5 text-xs font-semibold text-amber">SAMPLE</span>}
      </figcaption>

      <div className="grid gap-x-2" style={{ gridTemplateColumns: `${axisWidth} minmax(0, 1fr)` }}>
        {/* y-axis labels */}
        <div className="relative h-56 sm:h-72" aria-hidden="true">
          {ticks.map((v) => (
            <span key={v} className="absolute end-0 -translate-y-1/2 whitespace-nowrap text-xs tabular-nums text-muted" style={{ top: pctY(y(v)) }}>{tick(v)}</span>
          ))}
        </div>

        {/* plot */}
        <div role="img" aria-label={summary} className="relative h-56 sm:h-72">
          <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
            {ticks.map((v) => (
              <line key={v} x1={0} x2={VW} y1={y(v)} y2={y(v)} stroke="var(--ice)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            ))}
            <line x1={xNow} x2={xNow} y1={TOP / 2} y2={VH - BOTTOM} stroke="var(--silver)" strokeWidth={1} strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
            {end && <polygon points={band} fill="var(--blue)" opacity={0.16} />}
            <path d={histPath} fill="none" stroke="var(--midnight)" strokeWidth={2.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            {end && <path d={centralPath} fill="none" stroke="var(--blue)" strokeWidth={2.5} strokeDasharray="7 5" vectorEffect="non-scaling-stroke" />}
          </svg>

          {/* last actual: dot + label */}
          <span aria-hidden="true" className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-midnight ring-2 ring-paper" style={{ left: pctX(xNow), top: pctY(y(last.value)) }} />
          <span aria-hidden="true" className="absolute -translate-x-full translate-y-3 whitespace-nowrap rounded bg-paper/90 px-1 me-1.5 text-xs font-semibold tabular-nums text-midnight shadow-sm" style={{ left: pctX(xNow), top: pctY(y(last.value)) }}>
            {last.period}: {fmt(last.value)}
          </span>
          {/* forecast end: central value and range */}
          {end && (
            <span aria-hidden="true" className="absolute -translate-x-full -translate-y-full whitespace-nowrap pb-1 text-end text-xs font-semibold leading-tight tabular-nums text-blue-ink" style={{ left: "100%", top: pctY(y(end.p90)) }}>
              {end.period}: {fmt(end.p50)}<br /><span className="font-normal">({fmt(end.p10)}–{fmt(end.p90)})</span>
            </span>
          )}
        </div>

        {/* x-axis year labels */}
        <div aria-hidden="true" />
        <div className="relative h-5" aria-hidden="true">
          {years.map(({ p, i }) => (
            <span key={p} className="absolute -translate-x-1/2 text-xs tabular-nums text-muted" style={{ left: pctX(x(i)) }}>{p.slice(0, 4)}</span>
          ))}
        </div>
      </div>

      {/* legend: shape + colour, never colour alone */}
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-deep" aria-hidden="true">
        <li className="inline-flex items-center gap-2"><span className="inline-block h-0.5 w-6 rounded bg-midnight" />{labels.history}</li>
        {end && labels.band && <li className="inline-flex items-center gap-2"><span className="inline-block h-3 w-6 rounded-sm bg-blue/20" />{labels.band}</li>}
        {end && labels.central && <li className="inline-flex items-center gap-2"><span className="inline-block w-6 border-t-2 border-dashed border-blue" />{labels.central}</li>}
      </ul>
    </figure>
  );
}
