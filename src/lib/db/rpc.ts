import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { z } from "zod";

const messages: Record<string, string> = {
  MEMBERS_ONLY: "Co-buy is open to U-topia members only.", GROUP_CLOSED: "This group is closed.",
  GROUP_FULL: "This group already has ten participants.", AMOUNT_INVALID: "Enter a positive amount within the remaining target.",
  ALREADY_JOINED: "You have already joined this group.", FOREIGN_LAND: "Foreign nationals can only join houses or land as lenders.",
  CONDO_NO_LENDER: "Condo participants must be co-owners.", RATE_INVALID: "Fixed interest must be above 0% and at most 15%.",
  FOREIGN_QUOTA: "This commitment exceeds the building's foreign floor-area quota.", WALLET_BALANCE: "Not enough test money in your wallet.",
  WALLET_LIMIT: "This exceeds your per-commitment limit.", WALLET_CAP: "Your wallet has reached the test-money cap.",
  OWN_LISTING: "You cannot buy or bid on your own listing.", ROUND_CLOSED: "This offer round is closed.",
  NOT_OWNER: "Only the listing owner can do this.", NOT_SIGNED_IN: "Sign in to continue.",
};
export function dbMessage(error: { message?: string; code?: string }) {
  return messages[error.message ?? ""] ?? "The operation could not be completed. Refresh the page and try again.";
}
export async function rpc(name: string, args: Record<string, unknown> = {}) {
  const client = await supabaseServer();
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(dbMessage(error));
  return data;
}
export async function listingUuid(value: string) {
  const client = await supabaseServer();
  const column = z.uuid().safeParse(value).success ? "id" : "code";
  const { data, error } = await client.from("listings").select("id").eq(column, value).single();
  if (error || !data) throw new Error("Listing not found.");
  return data.id as string;
}
