// Put a React node (a link, bold text) inside a translated sentence without splitting the sentence into
// fragments: translate with the placeholder set to SLOT, then render the node where SLOT landed.
// Usage: withSlot(t("Prefer to talk? Use {voice} (bottom corner).", { voice: SLOT }), <strong>…</strong>)
import { Fragment, type ReactNode } from "react";

export const SLOT = "\u0000";

export function withSlot(translated: string, node: ReactNode): ReactNode {
  const [before, ...rest] = translated.split(SLOT);
  return <Fragment>{before}{node}{rest.join("")}</Fragment>;
}
