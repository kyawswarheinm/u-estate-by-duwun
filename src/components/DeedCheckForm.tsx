"use client";
import { Label, Text } from "@/i18n/Text";

import { useState } from "react";

type Flag = { severity: "info" | "warning" | "critical"; message: string };
type Result = {
  result: { deed_type_label: string; owner_name: string | null; area_text: string | null; parcel_or_unit_number: string | null; confidence: string; summary: string; marked_as_sample: boolean };
  flags: Flag[];
  outcome: "verified_sample" | "needs_review";
};

export function DeedCheckForm({ listings, defaultListingId }: { listings: { id: string; title: string }[]; defaultListingId?: string }) {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setData(null);
    setStatus("Reading the document… this can take about 20 seconds.");
    try {
      const r = await fetch("/api/check-document", { method: "POST", body: new FormData(e.currentTarget) });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error ?? "Check failed.");
        setStatus("");
      } else {
        setData(j as Result);
        setStatus("Check complete.");
      }
    } catch {
      setError("Network error. Try again.");
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  const sev = { critical: "bg-red-soft text-red", warning: "bg-amber-soft text-amber", info: "bg-mist text-ink-soft" } as const;
  const icon = { critical: "✕", warning: "!", info: "i" } as const;

  return (
    <div className="grid gap-5">
      <form onSubmit={onSubmit} method="post" encType="multipart/form-data" className="grid gap-4">
        <div className="grid gap-1">
          <label htmlFor="listingId" className="font-semibold"><Text message="Listing" /></label>
          <select id="listingId" name="listingId" required defaultValue={defaultListingId} className="input">
            {listings.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
          </select>
        </div>
        <div className="grid gap-1">
          <label htmlFor="deed" className="font-semibold"><Text message="Title deed photo (SAMPLE documents only)" /></label>
          <input id="deed" name="deed" type="file" required accept="image/jpeg,image/png,image/webp" aria-describedby="deed-help" className="input" />
          <p id="deed-help" className="text-sm text-ink-soft"><Text message={"JPG, PNG or WebP, up to 5 MB. Never upload a real person's deed in this demo."} /></p>
        </div>
        <button type="submit" disabled={busy} className="justify-self-start rounded-lg bg-blue-ink px-5 py-3 font-semibold text-paper disabled:opacity-60">
          <Label>{busy ? "Checking…" : "Check this deed"}</Label>
        </button>
        <p role="status" aria-live="polite" className="text-sm text-ink-soft">{status}</p>
        {error && <p role="alert" className="rounded-lg bg-red-soft p-3 font-semibold text-red">{error}</p>}
      </form>

      {data && (
        <section aria-labelledby="result-title" className="rounded-xl border border-line p-5">
          <h2 id="result-title" className="text-xl font-bold">
            {data.outcome === "verified_sample" ? "✓ Deed checked (sample): no blocking issues found" : "! Needs human review"}
          </h2>
          <p className="mt-1">{data.result.summary}</p>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-ink-soft"><Text message="Deed type" /></dt><dd>{data.result.deed_type_label}</dd>
            <dt className="text-ink-soft"><Text message="Owner name" /></dt><dd>{data.result.owner_name ?? "Not readable"}</dd>
            <dt className="text-ink-soft"><Text message="Area" /></dt><dd>{data.result.area_text ?? "Not readable"}</dd>
            <dt className="text-ink-soft"><Text message="Parcel / unit no." /></dt><dd>{data.result.parcel_or_unit_number ?? "Not readable"}</dd>
            <dt className="text-ink-soft"><Text message="AI confidence" /></dt><dd>{data.result.confidence}</dd>
          </dl>
          <h3 className="mt-4 font-semibold"><Text message="Why" /></h3>
          <ul className="mt-2 grid gap-2">
            {data.flags.map((f) => (
              <li key={f.message} className={`rounded-lg p-3 text-sm ${sev[f.severity]}`}>
                <span aria-hidden="true" className="me-2 font-bold">{icon[f.severity]}</span>
                <span className="sr-only">{f.severity}: </span>{f.message}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
