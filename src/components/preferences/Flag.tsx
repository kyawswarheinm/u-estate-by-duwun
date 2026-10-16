// Issuer flags for the currency menu, drawn as tiny inline SVGs (3:2). Emoji flags are not used because
// Windows renders them as two letters. Flags mark the currency's issuer, never a language.

type Issuer = "TH" | "US" | "EU" | "CN";

/** Points of a five-pointed star centred on (cx, cy), outer radius r, first point straight up. */
function star(cx: number, cy: number, r: number, rotate = 0) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2 + rotate;
    const rad = i % 2 === 0 ? r : r * 0.382;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
}

const BODY: Record<Issuer, React.ReactNode> = {
  // Thailand: red, white, double-width blue, white, red.
  TH: (
    <>
      <rect width="30" height="20" fill="#a51931" />
      <rect y="3.33" width="30" height="13.34" fill="#f4f5f8" />
      <rect y="6.67" width="30" height="6.66" fill="#2d2a4a" />
    </>
  ),
  // United States: 13 stripes and the blue canton (stars simplified to a dot grid at this size).
  US: (
    <>
      <rect width="30" height="20" fill="#fff" />
      {Array.from({ length: 7 }, (_, i) => <rect key={i} y={(i * 2 * 20) / 13} width="30" height={20 / 13} fill="#b22234" />)}
      <rect width="12" height={(7 * 20) / 13} fill="#3c3b6e" />
      {Array.from({ length: 12 }, (_, i) => <circle key={i} cx={1.5 + (i % 4) * 3} cy={1.6 + Math.floor(i / 4) * 3.2} r="0.55" fill="#fff" />)}
    </>
  ),
  // European Union: twelve gold stars in a circle on blue.
  EU: (
    <>
      <rect width="30" height="20" fill="#003399" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (Math.PI / 6) * i;
        return <polygon key={i} points={star(15 + 6.5 * Math.sin(a), 10 - 6.5 * Math.cos(a), 1.05)} fill="#ffcc00" />;
      })}
    </>
  ),
  // China: one large and four small gold stars on red.
  CN: (
    <>
      <rect width="30" height="20" fill="#ee1c25" />
      <polygon points={star(5, 5, 3)} fill="#ffde00" />
      <polygon points={star(10, 2, 1)} fill="#ffde00" />
      <polygon points={star(12, 4, 1)} fill="#ffde00" />
      <polygon points={star(12, 7, 1)} fill="#ffde00" />
      <polygon points={star(10, 9, 1)} fill="#ffde00" />
    </>
  ),
};

export function Flag({ issuer, className = "" }: { issuer: Issuer; className?: string }) {
  return (
    <svg viewBox="0 0 30 20" aria-hidden="true" focusable="false" className={`h-[14px] w-[21px] shrink-0 overflow-hidden rounded-[3px] shadow-[0_0_0_1px_rgb(0_0_0/0.12)] ${className}`}>
      {BODY[issuer]}
    </svg>
  );
}
