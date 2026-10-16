// Small inline icons for the U-Pal assistant (stroke follows currentColor), and the U-Pal avatar.
import Image from "next/image";

const base = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

export function SparkleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M12 3.5c.6 3.9 2.6 5.9 6.5 6.5-3.9.6-5.9 2.6-6.5 6.5-.6-3.9-2.6-5.9-6.5-6.5 3.9-.6 5.9-2.6 6.5-6.5Z" fill="currentColor" stroke="none" />
      <path d="M18.5 15.5c.25 1.5 1 2.25 2.5 2.5-1.5.25-2.25 1-2.5 2.5-.25-1.5-1-2.25-2.5-2.5 1.5-.25 2.25-1 2.5-2.5Z" fill="currentColor" stroke="none" />
    </svg>
  );
}
export function MicIcon() {
  return (
    <svg {...base}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </svg>
  );
}
export function SendIcon() {
  return (
    <svg {...base} className="upal-flip">
      <path d="M12 19V5M6 11l6-6 6 6" />
    </svg>
  );
}
export function CloseIcon({ size = 18 }: { size?: number }) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

/** The U-Pal avatar: the official U-Pal artwork (public/brand/u-pal.png) in a circle. Decorative: names come from text. */
export function UPalAvatar({ size = 36 }: { size?: number }) {
  return (
    <span className="upal-avatar" style={{ width: size, height: size }} aria-hidden="true">
      <Image src="/brand/u-pal.png" alt="" width={size} height={size} sizes={`${size}px`} />
    </span>
  );
}
