import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { readDb } from "@/lib/store";
import { currentUser } from "@/lib/session";
import { COBUY, GOVERNANCE, coOwnerShares, committedThb, foreignAreaInGroup, loanSchedule, thb } from "@/lib/rules";
import { Card } from "@/components/ui";
import { JoinCobuyForm } from "@/components/JoinCobuyForm";
import { TokenCheck } from "@/components/TokenCheck";
import { walletSummary } from "@/lib/wallet";

/** Whole days from now until an ISO date (server-rendered per request). */
function daysUntil(iso: string) {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - new Date().getTime()) / 86_400_000));
}

export default async function CobuyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [db, me] = await Promise.all([readDb(), currentUser()]);
  const group = db.cobuyGroups.find((g) => g.id === id);
  if (!group) notFound();
  const listing = db.listings.find((l) => l.id === group.listingId)!;
  const property = db.properties.find((p) => p.id === listing.propertyId)!;
  const building = property.buildingId ? db.buildings.find((b) => b.id === property.buildingId) : undefined;
  const participants = db.cobuyParticipants.filter((p) => p.groupId === id);
  const committed = committedThb(participants);
  const remaining = group.targetThb - committed;
  const shares = coOwnerShares(participants);
  const isCondo = property.type === "condo";
  const name = (uid: string) => db.profiles.find((p) => p.id === uid)!;
  const quotaLimit = building ? (COBUY.foreignQuotaPct / 100) * building.totalFloorAreaSqm : 0;
  const quotaUsed = building ? building.foreignAreaUsedSqm + foreignAreaInGroup(participants) : 0;

  return (
    <article className="grid gap-5">
      <header>
        <p className="text-sm text-ink-soft"><Link href={`/listing/${listing.id}`} className="underline">← {property.title}</Link></p>
        <h1 className="text-3xl font-bold">Co-buy group</h1>
        <p className="mt-1 text-ink-soft">Target {thb(group.targetThb)} · {property.type} · status: <strong>{group.status}</strong> · <span className="font-semibold text-amber">TEST MONEY ONLY</span></p>
      </header>

      <Card>
        <h2 className="text-xl font-bold">Funding progress</h2>
        <label htmlFor="funding" className="mt-2 block">{thb(committed)} of {thb(group.targetThb)} committed ({Math.round((committed / group.targetThb) * 100)}%)</label>
        <progress id="funding" max={group.targetThb} value={committed} className="mt-2 h-4 w-full">{Math.round((committed / group.targetThb) * 100)}%</progress>
        {isCondo && building && (
          <div className="mt-4">
            <label htmlFor="quota" className="block text-sm">Building foreign-ownership quota: {Math.round(quotaUsed)} of {Math.round(quotaLimit)} m² used ({COBUY.foreignQuotaPct}% of floor area)</label>
            <meter id="quota" min={0} max={quotaLimit} low={quotaLimit * 0.8} high={quotaLimit * 0.95} optimum={0} value={quotaUsed} className="mt-1 h-3 w-full">{Math.round(quotaUsed)} m²</meter>
          </div>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="text-xl font-bold">Participants</h2>
          {participants.length === 0 ? (
            <p className="mt-2 text-ink-soft">No one has joined yet.</p>
          ) : (
            <table className="mt-3 w-full text-left text-sm">
              <caption className="sr-only">Participants and their registered rights</caption>
              <thead><tr className="border-b border-line"><th scope="col" className="py-2">Member</th><th scope="col">Role</th><th scope="col">Amount</th><th scope="col">Registered right</th></tr></thead>
              <tbody>
                {participants.map((p) => {
                  const prof = name(p.userId);
                  const share = shares.find((s) => s.userId === p.userId);
                  return (
                    <tr key={p.id} className="border-b border-line align-top">
                      <th scope="row" className="py-2 font-semibold">{prof.name}<br /><span className="font-normal text-ink-soft">{prof.isThai ? "Thai" : prof.nationality}</span></th>
                      <td>{p.lane === "lender" ? "Lender" : "Co-owner"}</td>
                      <td>{thb(p.amountThb)}</td>
                      <td>
                        {p.lane === "lender" ? `Mortgage loan, ${p.interestRatePct}% fixed` : `${share?.sharePct ?? 0}% of title`}
                        {p.fetRequired && <span className="block text-xs text-amber">Funds must come from abroad (FET form)</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {participants.filter((p) => p.lane === "lender").map((p) => (
            <details key={p.id} className="mt-3 text-sm">
              <summary className="cursor-pointer font-semibold">Loan schedule: {name(p.userId).name}</summary>
              <table className="mt-2 w-full text-left">
                <thead><tr><th scope="col">Year</th><th scope="col">Interest</th><th scope="col">Principal repaid</th></tr></thead>
                <tbody>{loanSchedule(p.amountThb, p.interestRatePct ?? COBUY.defaultInterestPct).map((r) => (
                  <tr key={r.year}><td>{r.year}</td><td>{thb(r.interestThb)}</td><td>{thb(r.principalRepaidThb)}</td></tr>
                ))}</tbody>
              </table>
            </details>
          ))}
        </Card>

        <Card>
          {!me ? (
            <div className="grid justify-items-start gap-3">
              <h2 className="text-xl font-bold">Join this group</h2>
              <p className="text-deep">Co-buy groups are open to U-topia members. Sign in to commit test money.</p>
              <div className="flex flex-wrap gap-2">
                <Link href={`/signin?next=/cobuy/${group.id}`} className="btn btn-primary">Sign in</Link>
                <Link href={`/signup?next=/cobuy/${group.id}`} className="btn btn-secondary">Create account</Link>
              </div>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-bold">Join as {me.name}</h2>
              <p className="mt-1 text-sm text-ink-soft">
                {me.isThai ? "Thai national" : `${me.nationality} national`} · {me.utopiaMember ? "U-topia member" : "not a U-topia member"} ·{" "}
                <Link href="/account/wallet" className="underline">{thb(walletSummary(db, me.id).availableThb)} test money available</Link>
              </p>
              {group.status === "forming" ? (
                <div className="mt-3">
                  <JoinCobuyForm requestId={randomUUID()} groupId={group.id} isCondo={isCondo} isThai={me.isThai} remainingThb={remaining} maxRate={COBUY.maxInterestPct} defaultRate={COBUY.defaultInterestPct} />
                  <div className="mt-4">
                    <TokenCheck
                      defaultDepositThb={Math.min(remaining, 1_000_000)}
                      payWithinDays={daysUntil(group.deadline)}
                      context="your co-buy share"
                    />
                  </div>
                </div>
              ) : (
                <p className="mt-3 font-semibold text-teal">Fully funded. Next step (simulated): sign the co-owner agreement and register at the Land Office.</p>
              )}
            </>
          )}
        </Card>
      </div>

      <Card>
        <h2 className="text-xl font-bold">Co-owner agreement summary</h2>
        <p className="text-sm text-amber">Summary for discussion, not a legal contract. A Thai lawyer must review before signing.</p>
        <ol className="mt-3 list-inside list-decimal grid gap-1">
          {GOVERNANCE.map((g) => <li key={g}>{g}</li>)}
        </ol>
      </Card>
    </article>
  );
}
