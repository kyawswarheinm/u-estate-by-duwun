// Illustrations for listing cards when there is no uploaded photo. Original artwork drawn in code, never a copied photo:
// external listings never show photos (facts only, TECH_STACK §4), and sample listings say "Illustration" on the card.
// Decorative: the card text says what the property is, so the SVG is aria-hidden.

export type ArtVariant = "condo" | "luxury" | "townhouse" | "house" | "apartment" | "office" | "land";

/** Picks a drawing from the property type and title words (apartment / office / luxury). */
export function artVariant(type: string, title = ""): ArtVariant {
  if (/office/i.test(title)) return "office";
  if (/apartment/i.test(title)) return "apartment";
  if (/luxury/i.test(title)) return "luxury";
  if (type === "townhouse" || type === "house" || type === "land" || type === "condo") return type;
  return "apartment"; // other whole buildings
}

const INK = "#253e5b", GLASS = "#cfe0f3", WARM = "#f6d8a8", GROUND = "#c7d4de", TREE = "#5f8f6b";

function windows(x: number, y: number, cols: number, rows: number, w: number, h: number, gx: number, gy: number, fill = GLASS) {
  const out = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push(<rect key={`${r}-${c}`} x={x + c * (w + gx)} y={y + r * (h + gy)} width={w} height={h} rx="1" fill={(r * 7 + c * 3) % 5 === 0 ? WARM : fill} />);
  return out;
}

function tree(x: number, key: string) {
  return (
    <g key={key}>
      <rect x={x - 2} y="158" width="4" height="14" fill="#6b5b45" />
      <circle cx={x} cy="152" r="11" fill={TREE} />
    </g>
  );
}

function scene(v: ArtVariant) {
  switch (v) {
    case "condo":
      return (
        <>
          <rect x="70" y="70" width="60" height="100" fill="#3b5675" />
          {windows(78, 80, 4, 8, 8, 6, 5, 5)}
          <rect x="140" y="38" width="78" height="132" fill={INK} />
          {windows(148, 48, 5, 11, 8, 6, 6, 5)}
          {tree(240, "t1")}{tree(262, "t2")}
        </>
      );
    case "luxury":
      return (
        <>
          <rect x="128" y="20" width="64" height="150" rx="3" fill="#1d3550" />
          <rect x="128" y="20" width="64" height="8" fill="#c9a24a" />
          {windows(134, 34, 4, 13, 10, 6, 4, 4, "#9fc3ea")}
          <rect x="200" y="96" width="70" height="74" fill="#2c4766" />
          {windows(206, 104, 4, 6, 10, 6, 5, 4, "#9fc3ea")}
          <rect x="40" y="164" width="70" height="8" rx="4" fill="#7fc4e8" />
          {tree(60, "t1")}{tree(98, "t2")}
        </>
      );
    case "townhouse":
      return (
        <>
          {[60, 130, 200].map((x, i) => (
            <g key={x}>
              <rect x={x} y="100" width="62" height="70" fill={["#e7d8c4", "#d9e3ec", "#eadfcf"][i]} stroke={INK} strokeWidth="1" />
              <polygon points={`${x - 4},100 ${x + 31},74 ${x + 66},100`} fill="#8a5a44" />
              {windows(x + 8, 110, 2, 2, 14, 12, 18, 10)}
              <rect x={x + 24} y="146" width="14" height="24" fill={INK} />
            </g>
          ))}
        </>
      );
    case "house":
      return (
        <>
          <rect x="100" y="96" width="120" height="74" fill="#ece3d6" stroke={INK} strokeWidth="1" />
          <polygon points="92,96 160,56 228,96" fill="#8a5a44" />
          {windows(112, 108, 2, 1, 22, 18, 52, 0)}
          <rect x="150" y="134" width="20" height="36" fill={INK} />
          {tree(60, "t1")}{tree(256, "t2")}
        </>
      );
    case "apartment":
      return (
        <>
          <rect x="60" y="58" width="200" height="112" fill="#e3e8ee" stroke={INK} strokeWidth="1" />
          <rect x="60" y="50" width="200" height="10" fill="#9aa9b8" />
          {windows(70, 68, 9, 6, 14, 10, 7, 6)}
          {[78, 96, 114, 132, 150].map((y) => <rect key={y} x="60" y={y} width="200" height="2" fill="#9aa9b8" />)}
          <rect x="148" y="146" width="24" height="24" fill={INK} />
        </>
      );
    case "office":
      return (
        <>
          <rect x="90" y="40" width="140" height="130" fill="#2f5d8f" />
          {[48, 66, 84, 102, 120, 138].map((y) => <rect key={y} x="96" y={y} width="128" height="12" fill="#9fc3ea" />)}
          <rect x="146" y="150" width="28" height="20" fill={INK} />
          {tree(60, "t1")}{tree(262, "t2")}
        </>
      );
    case "land":
      return (
        <>
          <rect x="30" y="140" width="260" height="30" fill="#a8c49a" />
          {[50, 90, 130, 170, 210, 250].map((x) => <rect key={x} x={x} y="146" width="20" height="3" fill="#8bab7c" />)}
          <rect x="150" y="104" width="4" height="40" fill="#6b5b45" />
          <rect x="132" y="96" width="40" height="18" rx="2" fill="#fff" stroke={INK} />
          {tree(70, "t1")}{tree(250, "t2")}
        </>
      );
  }
}

export function MarketPropertyArt({ variant, className = "" }: { variant: ArtVariant; className?: string }) {
  return (
    <svg viewBox="0 0 320 200" aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid slice" className={className}>
      <rect width="320" height="200" fill="#e6eef6" />
      <circle cx="270" cy="40" r="16" fill="#fbe3b0" />
      <rect y="170" width="320" height="30" fill={GROUND} />
      {scene(variant)}
    </svg>
  );
}
