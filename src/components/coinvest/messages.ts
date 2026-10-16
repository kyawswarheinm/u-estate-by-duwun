import type { MessageKey } from "@/i18n";
import type { CoinvestState } from "@/app/coinvest/actions";

/** Server result codes → translated, plain-language messages. Never shows a database or provider error. */
export const COINVEST_ERROR: Record<NonNullable<CoinvestState["code"]>, MessageKey> = {
  NOT_SIGNED_IN: "Sign in to continue.",
  PREMIUM_ONLY: "Co-Invest trading is for Premium members.",
  ALREADY_PREMIUM: "You are already a Premium member.",
  OFFERING_CLOSED: "This offering is closed.",
  UNITS_INVALID: "Enter a whole number of units between 1 and 1,000.",
  NOT_ENOUGH_UNITS: "Not enough units: check the units available or the units you hold.",
  POOL_EMPTY: "No units are available right now.",
  HOLDERS_FULL: "This property already has the maximum number of co-owners.",
  FOREIGN_LAND: "Foreign members cannot hold units in houses or land (Thai law). Choose a condo.",
  FOREIGN_QUOTA: "This would exceed the building's 49% foreign ownership quota.",
  BUILDING_MISSING: "Foreign ownership cannot be checked for this condo yet.",
  WALLET_BALANCE: "Not enough test money in your wallet.",
  REQUEST_MISMATCH: "This request was already used. Refresh the page and try again.",
  VALIDATION: "Something was missing. Refresh the page and try again.",
  GENERIC: "The operation could not be completed. Try again.",
};
