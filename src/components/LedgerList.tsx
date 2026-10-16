"use client";
import { useMemo, useState } from "react";
import { useI18n } from "@/i18n/provider";
import type { MessageKey } from "@/i18n";
import { STATUS_LABEL, type EntryStatus } from "@/lib/ledger/status";

export type LedgerRow = {
  id: number;
  type: MessageKey;
  createdAt: string;
  who: string;
  amount: string | null;
  details: string;
  hash: string;
  status: EntryStatus;
  explorerUrl: string | null;
  simulated: boolean;
};

const STATUS_STYLE: Record<EntryStatus, string> = {
  verified: "bg-teal-soft text-teal",
  pending_anchor: "bg-amber-soft text-amber",
  recorded: "bg-ice text-deep",
};
const STATUS_MARK: Record<EntryStatus, string> = { verified: "✓", pending_anchor: "…", recorded: "•" };

/** The ledger timeline with search and filters. Rows are prepared on the server; this only filters them. */
export function LedgerList({ rows }: { rows: LedgerRow[] }) {
  const { t, locale } = useI18n();
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState<"" | EntryStatus>("");
  const types = useMemo(() => [...new Set(rows.map((r) => r.type))], [rows]);
  const q = query.trim().toLowerCase();
  const shown = rows.filter((r) =>
    (!type || r.type === type) && (!status || r.status === status) &&
    (!q || [t(r.type), r.who, r.details, String(r.id), r.hash].some((v) => v.toLowerCase().includes(q))));

  return (
    <section aria-labelledby="ledger-records" className="grid gap-4">
      <h2 id="ledger-records" className="section-title">{t("Records")}</h2>
      <form role="search" className="surface-card grid gap-3 p-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]" onSubmit={(e) => e.preventDefault()}>
        <label className="field-label">{t("Search records")}
          <input type="search" className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("Name, record number or fingerprint")} />
        </label>
        <label className="field-label">{t("Type")}
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">{t("All types")}</option>
            {types.map((x) => <option key={x} value={x}>{t(x)}</option>)}
          </select>
        </label>
        <label className="field-label">{t("Status")}
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as "" | EntryStatus)}>
            <option value="">{t("All statuses")}</option>
            {(Object.keys(STATUS_LABEL) as EntryStatus[]).map((s) => <option key={s} value={s}>{t(STATUS_LABEL[s])}</option>)}
          </select>
        </label>
      </form>
      <p role="status" className="text-sm text-deep">{t("{count} records", { count: shown.length })}</p>
      {shown.length === 0 ? (
        <p className="surface-card p-5 text-deep">{rows.length === 0 ? t("No activity yet. Check a deed, make an offer or join a co-buy group.") : t("No records match these filters.")}</p>
      ) : (
        <ol className="ledger-timeline">
          {shown.map((e) => (
            <li key={e.id} className="ledger-event">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="card-title">{t(e.type)}</h3>
                <time className="text-xs text-deep" dateTime={e.createdAt}>{new Date(e.createdAt).toLocaleString(locale, { numberingSystem: "latn", timeZone: "Asia/Bangkok" })}</time>
              </div>
              <p className="mt-2 text-sm text-deep"><bdi>{e.who}</bdi>{e.amount ? <> · <span className="font-semibold text-ink">{e.amount}</span></> : null}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className={`pill ${STATUS_STYLE[e.status]}`}><span aria-hidden="true">{STATUS_MARK[e.status]}</span> {t(STATUS_LABEL[e.status])}</span>
                {e.simulated && <span className="pill bg-amber-soft text-amber">{t("simulated")}</span>}
              </div>
              <details className="mt-4">
                <summary>{t("recordDetails")}</summary>
                <p className="mt-3 text-sm">{e.details}</p>
                <p className="mt-3 break-all font-mono text-xs text-deep">#{e.id} / {e.hash}</p>
                {e.explorerUrl && <p className="mt-2 text-sm"><a href={e.explorerUrl} target="_blank" rel="noreferrer" className="font-semibold underline">{t("Open the network record ↗")}</a></p>}
              </details>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
