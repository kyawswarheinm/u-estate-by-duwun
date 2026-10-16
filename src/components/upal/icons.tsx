// Small inline icons for the U-Pal widget (stroke follows currentColor).

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
export function MinimizeIcon() {
  return (
    <svg {...base} width={18} height={18}>
      <path d="M6 12h12" />
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

/** The U-Pal avatar: a soft orb in the brand blues with a sparkle. */
export function UPalAvatar({ size = 36 }: { size?: number }) {
  return (
    <span className="upal-avatar" style={{ width: size, height: size }} aria-hidden="true">
      <SparkleIcon size={Math.round(size * 0.5)} />
    </span>
  );
}
