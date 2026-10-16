import type { ReactNode } from "react";
import { Label } from "@/i18n/Text";

/** Explicit mobile labels; real table headers remain available to assistive technology. */
export function RecordCell({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return <td className={className}><span className="record-label" aria-hidden="true"><Label>{label}</Label></span><div className="record-value">{children}</div></td>;
}
