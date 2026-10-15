import { Text } from "@/i18n/Text";
import { trendLine } from "@/lib/price";

/** Server-rendered SVG: index history (solid) + 12-month trend line (dashed, "trend, not a prediction"). */
export function IndexChart({ series, isSample, title }: { series: { month: string; value: number }[]; isSample: boolean; title: string }) {
  const hist = series.slice(-48);
  const trend = trendLine(series);
  const W = 640, H = 220, P = 36;
  const all = [...hist.map((p) => p.value), ...trend.map((t) => t.value)];
  const min = Math.floor(Math.min(...all) - 2), max = Math.ceil(Math.max(...all) + 2);
  const total = hist.length + 12;
  const x = (i: number) => P + (i / (total - 1)) * (W - 2 * P);
  const y = (v: number) => H - P - ((v - min) / (max - min)) * (H - 2 * P);
  const histPath = hist.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const trendPath = trend.map((t, k) => `${k ? "L" : "M"}${x(hist.length - 1 + k).toFixed(1)},${y(t.value).toFixed(1)}`).join(" ");
  const last = hist[hist.length - 1];

  return (
    <figure dir="ltr">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="chart-title chart-desc" className="h-auto w-full">
        <title id="chart-title">{title}</title>
        <desc id="chart-desc">
          Index from {hist[0].month} ({hist[0].value}) to {last.month} ({last.value}). Dashed line shows a 12-month trend, not a prediction.
          {isSample ? " Sample data." : ""}
        </desc>
        <line x1={P} x2={W - P} y1={H - P} y2={H - P} stroke="var(--line)" />
        <text x={P} y={H - 10} fontSize="12" fill="var(--ink-soft)">{hist[0].month}</text>
        <text x={x(hist.length - 1)} y={H - 10} fontSize="12" fill="var(--ink-soft)" textAnchor="middle">{last.month}</text>
        <text x={W - P} y={H - 10} fontSize="12" fill="var(--ink-soft)" textAnchor="end"><Text message="+12 months" /></text>
        <text x={P - 6} y={y(max - 2)} fontSize="12" fill="var(--ink-soft)" textAnchor="end">{max - 2}</text>
        <text x={P - 6} y={y(min + 2)} fontSize="12" fill="var(--ink-soft)" textAnchor="end">{min + 2}</text>
        <path d={histPath} fill="none" stroke="var(--teal)" strokeWidth="3" />
        <path d={trendPath} fill="none" stroke="var(--ink-soft)" strokeWidth="2" strokeDasharray="6 6" />
        <circle cx={x(hist.length - 1)} cy={y(last.value)} r="5" fill="var(--teal)" />
        {isSample && (
          <text x={W / 2} y={P} fontSize="16" fontWeight="700" fill="var(--amber)" textAnchor="middle"><Text message="SAMPLE INDEX DATA" /></text>
        )}
      </svg>
      <figcaption className="mt-1 text-sm text-ink-soft">
        Solid: price index history. Dashed: 12-month trend line (<strong><Text message="a trend, not a prediction" /></strong>).
      </figcaption>
    </figure>
  );
}
