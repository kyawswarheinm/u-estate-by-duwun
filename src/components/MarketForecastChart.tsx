// /market price-index forecast. Same chart as the listing pages (ForecastChart), so both show the
// TimesFM-based p10–p90 band the same way. Props unchanged for the market page.
import { Text } from "@/i18n/Text";
import { ForecastChart } from "./ForecastChart";

type Point = { period: string; value: number };
type Band = { period: string; p10: number; p50: number; p90: number };

export function MarketForecastChart({ history, forecast, isSample, title, caption }: {
  history: Point[]; forecast: Band[]; isSample: boolean; title: string; caption: string;
}) {
  const last = history[history.length - 1];
  const end = forecast[forecast.length - 1];
  return (
    <div className="grid gap-2">
      <ForecastChart
        history={history}
        forecast={forecast}
        isSample={isSample}
        months={36}
        title={title}
        labels={{ history: isSample ? <Text message="SAMPLE INDEX DATA" /> : <Text message="Bank of Thailand index" />, band: <Text message="80% range (p10–p90)" />, central: <Text message="Central forecast" /> }}
        summary={`${title}: ${last.period} ${last.value}; forecast for ${end.period}: ${end.p10} to ${end.p90} (central ${end.p50}).${isSample ? " Sample data." : ""}`}
      />
      <p className="text-sm text-ink-soft">{caption}</p>
    </div>
  );
}
