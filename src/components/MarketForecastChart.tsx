// Price-index forecast (adapted from IndexChart): history line, central forecast (dashed) and the p10–p90 band.
// Server-rendered SVG from the snapshot numbers only. Time runs left to right in every language.

type Point = { period: string; value: number };
type Band = { period: string; p10: number; p50: number; p90: number };

export function MarketForecastChart({ history, forecast, isSample, title, caption }: {
  history: Point[]; forecast: Band[]; isSample: boolean; title: string; caption: string;
}) {
  const hist = history.slice(-24);
  const W = 640, H = 240, P = 40;
  const values = [...hist.map((p) => p.value), ...forecast.flatMap((f) => [f.p10, f.p90])];
  const min = Math.floor(Math.min(...values) - 1), max = Math.ceil(Math.max(...values) + 1);
  const total = hist.length + forecast.length;
  const x = (i: number) => P + (i / (total - 1)) * (W - 2 * P);
  const y = (v: number) => H - P - ((v - min) / (max - min)) * (H - 2 * P);
  const last = hist[hist.length - 1];
  const fx = (k: number) => x(hist.length + k);

  const histPath = hist.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const centralPath = [`M${x(hist.length - 1).toFixed(1)},${y(last.value).toFixed(1)}`, ...forecast.map((f, k) => `L${fx(k).toFixed(1)},${y(f.p50).toFixed(1)}`)].join(" ");
  const band = [
    `${x(hist.length - 1).toFixed(1)},${y(last.value).toFixed(1)}`,
    ...forecast.map((f, k) => `${fx(k).toFixed(1)},${y(f.p90).toFixed(1)}`),
    ...forecast.map((f, k) => `${fx(k).toFixed(1)},${y(f.p10).toFixed(1)}`).reverse(),
  ].join(" ");
  const end = forecast[forecast.length - 1];

  return (
    <figure dir="ltr" className="grid gap-1">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="forecast-title forecast-desc" className="h-auto w-full">
        <title id="forecast-title">{title}</title>
        <desc id="forecast-desc">
          {`${hist[0].period} ${hist[0].value} to ${last.period} ${last.value}; forecast for ${end.period}: ${end.p10} to ${end.p90} (central ${end.p50}).${isSample ? " Sample data." : ""}`}
        </desc>
        <line x1={P} x2={W - P} y1={H - P} y2={H - P} stroke="var(--silver)" />
        <polygon points={band} fill="var(--blue)" opacity="0.15" />
        <path d={histPath} fill="none" stroke="var(--midnight)" strokeWidth="3" />
        <path d={centralPath} fill="none" stroke="var(--blue)" strokeWidth="2.5" strokeDasharray="6 5" />
        <line x1={x(hist.length - 1)} x2={x(hist.length - 1)} y1={P / 2} y2={H - P} stroke="var(--silver)" strokeDasharray="2 4" />
        <text x={P} y={H - 14} fontSize="12" fill="var(--blue-grey)">{hist[0].period}</text>
        <text x={x(hist.length - 1)} y={H - 14} fontSize="12" fill="var(--blue-grey)" textAnchor="middle">{last.period}</text>
        <text x={W - P} y={H - 14} fontSize="12" fill="var(--blue-grey)" textAnchor="end">{end.period}</text>
        <text x={P - 6} y={y(max - 1) + 4} fontSize="12" fill="var(--blue-grey)" textAnchor="end">{max - 1}</text>
        <text x={P - 6} y={y(min + 1) + 4} fontSize="12" fill="var(--blue-grey)" textAnchor="end">{min + 1}</text>
        <text x={W - P} y={y(end.p90) - 8} fontSize="12" fill="var(--blue-ink)" textAnchor="end">{`p90 ${end.p90}`}</text>
        <text x={W - P} y={y(end.p10) + 18} fontSize="12" fill="var(--blue-ink)" textAnchor="end">{`p10 ${end.p10}`}</text>
        {isSample && <text x={W / 2} y={P / 2 + 6} fontSize="15" fontWeight="700" fill="var(--amber)" textAnchor="middle">SAMPLE</text>}
      </svg>
      <figcaption className="text-sm text-ink-soft">{caption}</figcaption>
    </figure>
  );
}
