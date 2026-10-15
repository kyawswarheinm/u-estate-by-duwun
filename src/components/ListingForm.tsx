"use client";
import { Label, Text } from "@/i18n/Text";

import { useActionState, useState } from "react";
import { createListing } from "@/app/sell/actions";
import type { AuthState } from "@/app/auth/actions";
import { DEED_TYPES, PROPERTY_TYPES } from "@/lib/listing-options";
import { describe, Field, FormMessage } from "./FormBits";

export function ListingForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(createListing, null);
  const fe = state?.fieldErrors ?? {};
  const v = state?.values ?? {};
  const [type, setType] = useState(v.type || "condo");
  const [kind, setKind] = useState(v.kind || "sale");
  const [cobuy, setCobuy] = useState(v.cobuyEnabled === "on");

  return (
    <form action={action} className="grid gap-5" noValidate>
      <fieldset className="grid gap-2">
        <legend className="mb-1 font-semibold"><Text message="I want to" /></legend>
        <div className="flex flex-wrap gap-2">
          {[{ v: "sale", l: "Sell" }, { v: "rent", l: "Rent out" }].map((o) => (
            <label key={o.v} className="panel flex min-h-11 cursor-pointer items-center gap-2 px-4 has-[:checked]:border-blue has-[:checked]:bg-[#eef5ff]">
              <input type="radio" name="kind" value={o.v} checked={kind === o.v} onChange={() => setKind(o.v)} className="size-4" />
              {o.l}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="type" label="Property type" error={fe.type}>
          <select {...describe("type", fe.type)} value={type} onChange={(e) => setType(e.target.value)} className="input">
            {PROPERTY_TYPES.map((t) => <option key={t.value} value={t.value}><Label>{t.label}</Label></option>)}
          </select>
        </Field>
        <Field id="deedType" label="Title deed type" hint="We check it when you upload the deed." error={fe.deedType}>
          <select {...describe("deedType", fe.deedType, true)} defaultValue={v.deedType || (type === "condo" ? DEED_TYPES[3] : DEED_TYPES[0])} key={type} className="input">
            {DEED_TYPES.map((d) => <option key={d}>{d}</option>)}
          </select>
        </Field>
      </div>

      <Field id="title" label="Listing title" hint="Short and specific, e.g. “2-bed condo near MRT, Huai Khwang”." error={fe.title}>
        <input {...describe("title", fe.title, true)} required maxLength={80} defaultValue={v.title} className="input" />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="district" label="District" error={fe.district}>
          <input {...describe("district", fe.district)} required maxLength={40} defaultValue={v.district} placeholder="e.g. Huai Khwang" className="input" />
        </Field>
        <Field id="province" label="Province" error={fe.province}>
          <input {...describe("province", fe.province)} required maxLength={40} defaultValue={v.province || "Bangkok"} className="input" />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="areaSqm" label="Size (m²)" error={fe.areaSqm}>
          <input {...describe("areaSqm", fe.areaSqm)} inputMode="decimal" required defaultValue={v.areaSqm} className="input" />
        </Field>
        <Field id="askingPriceThb" label={kind === "rent" ? "Monthly rent (THB)" : "Asking price (THB)"} error={fe.askingPriceThb}>
          <input {...describe("askingPriceThb", fe.askingPriceThb)} inputMode="numeric" required defaultValue={v.askingPriceThb} placeholder={kind === "rent" ? "e.g. 18,000" : "e.g. 3,500,000"} className="input" />
        </Field>
        <Field id="buildYear" label="Year built (optional)" error={fe.buildYear}>
          <input {...describe("buildYear", fe.buildYear)} inputMode="numeric" maxLength={4} defaultValue={v.buildYear} className="input" />
        </Field>
      </div>

      <Field id="appraisalThb" label="Official appraisal (THB, optional)" hint="From the Treasury Department lookup, if you know it. Shown to buyers with its source." error={fe.appraisalThb}>
        <input {...describe("appraisalThb", fe.appraisalThb, true)} inputMode="numeric" defaultValue={v.appraisalThb} className="input max-w-xs" />
      </Field>

      {kind === "sale" && (
        <label className="flex items-start gap-3">
          <input type="checkbox" name="cobuyEnabled" checked={cobuy} onChange={(e) => setCobuy(e.target.checked)} className="mt-1 size-5" />
          <span><strong><Text message="Allow co-buying" /></strong><span className="block text-sm text-deep"><Text message="U-topia members can buy together as registered co-owners (or lenders, for houses and land)." /></span></span>
        </label>
      )}

      {type === "condo" && kind === "sale" && cobuy && (
        <fieldset className="grid gap-4 rounded-[14px] bg-ice p-4">
          <legend className="sr-only"><Text message="Building details for the foreign quota" /></legend>
          <p className="text-sm text-deep"><Text message={"Foreigners may own up to 49% of a condo building's floor area. These numbers let U-Estate check the quota. Ask the juristic person (building office)."} /></p>
          <Field id="buildingName" label="Building name" error={fe.buildingName}>
            <input {...describe("buildingName", fe.buildingName)} maxLength={80} defaultValue={v.buildingName} className="input" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="buildingTotalSqm" label="Total floor area of all units (m²)" error={fe.buildingTotalSqm}>
              <input {...describe("buildingTotalSqm", fe.buildingTotalSqm)} inputMode="numeric" defaultValue={v.buildingTotalSqm} className="input" />
            </Field>
            <Field id="buildingForeignSqm" label="Foreign-owned floor area today (m²)" error={fe.buildingForeignSqm}>
              <input {...describe("buildingForeignSqm", fe.buildingForeignSqm)} inputMode="numeric" defaultValue={v.buildingForeignSqm} placeholder="0 if unknown" className="input" />
            </Field>
          </div>
        </fieldset>
      )}

      <FormMessage state={state && !state.ok ? state : null} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="btn btn-primary"><Label>{pending ? "Publishing…" : "Publish listing"}</Label></button>
        <p className="hint"><Text message="Your fee if it sells: 1.5% (0.75% for U-topia members). Buyers pay ฿0." /></p>
      </div>
    </form>
  );
}
