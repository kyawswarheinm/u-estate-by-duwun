export type PropertyType = "condo" | "house" | "land" | "townhouse" | "building";

export interface Profile {
  isReviewer?: boolean;
  id: string;
  name: string;
  nationality: string;
  isThai: boolean;
  utopiaMember: boolean;
  /** Premium entitlement (Co-Invest). Set only by the premium upgrade (server side), never by the browser. */
  premium?: boolean;
  premiumSince?: string;
  roles: string[];
  /** Demo personas are seeded people you can switch to with one click (DEMO_MODE). */
  isDemoPersona?: boolean;
  email?: string; // public-safe copy for display; credentials live in `accounts`
  locale?: "en" | "th" | "ar" | "zh-Hant" | "es";
  createdAt?: string;
  utopiaLinkedAt?: string; // demo: when the member linked their U-topia membership
  payoutMethod?: "utopia_wallet" | "escrow_bank_transfer";
  maxCommitThb?: number; // wallet setting: largest single co-buy commitment allowed
}

/** Sign-in credentials. Never sent to the browser. Passwords are stored only as scrypt hashes. */
export interface Account {
  userId: string;
  email: string; // lower-case, a made-up demo address (real inbox providers are refused)
  passwordHash: string; // "scrypt$N$r$p$salt$hash"
  createdAt: string;
  passwordChangedAt?: string;
}

/** Server-side session. The cookie holds a random token; only its SHA-256 is stored. */
export interface Session {
  tokenHash: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

/** Test-money wallet movements. Credits are positive, debits negative; co-buy commitments are holds, not movements. */
export type WalletKind = "demo_grant" | "top_up" | "premium_fee" | "share_purchase" | "share_sale" | "refund";
export interface WalletTxn {
  id: string;
  userId: string;
  kind: WalletKind;
  amountThb: number; // signed: + money in, − money out
  note: string;
  createdAt: string;
  offeringId?: string;
  tradeId?: string;
  requestId?: string;
}

export interface Building {
  id: string;
  name: string;
  totalFloorAreaSqm: number;
  foreignAreaUsedSqm: number;
}

export interface Property {
  id: string;
  type: PropertyType;
  title: string;
  province: string;
  district: string;
  areaSqm: number;
  buildingId?: string;
  buildYear?: number;
  deedType: string;
  officialAppraisalThb: number; // 0 = not provided (seller-created listings)
  appraisalSource: string;
  appraisalDate: string;
  lastSalePriceThb?: number;
  lastSaleDate?: string; // YYYY-MM
  indexSeries: "condo_bkk" | "house_bkk";
}

export type VerificationStatus = "unverified" | "verified_sample" | "needs_review";

export interface Listing {
  archivedAt?: string;
  code?: string;
  id: string;
  propertyId: string;
  sellerId: string;
  kind: "sale" | "rent";
  askingPriceThb: number;
  status: "active" | "under_offer" | "sold";
  verificationStatus: VerificationStatus;
  verificationReasons: string[];
  cobuyEnabled: boolean;
  createdAt: string;
}

export interface DeedFlag {
  severity: "info" | "warning" | "critical";
  message: string;
}

export interface DocumentCheck {
  id: string;
  listingId?: string;
  fileName: string;
  createdAt: string;
  extraction: Record<string, unknown>;
  flags: DeedFlag[];
  outcome: VerificationStatus;
  humanReview: "pending";
}

export interface OfferCriterion {
  key: "price" | "funding" | "closing" | "conditions";
  label: string;
  weight: number; // percent, sums to 100
}

export interface OfferRound {
  offerCount?: number;
  id: string;
  listingId: string;
  criteria: OfferCriterion[];
  rulesPublishedAt: string;
  closesAt: string;
  status: "open" | "closed" | "decided";
  acceptedOfferId?: string;
  aiSummary?: string;
}

export type FundingReadiness = "pre_approved" | "proof_uploaded" | "declared" | "cash";

export interface Offer {
  id: string;
  roundId: string;
  buyerId: string;
  priceThb: number;
  funding: FundingReadiness;
  closingDays: number;
  conditions: string;
  submittedAt: string;
  status: "submitted" | "accepted" | "declined";
}

export type CobuyLane = "co_owner" | "lender";

export interface CobuyGroup {
  id: string;
  listingId: string;
  targetThb: number;
  deadline: string;
  status: "forming" | "funded" | "cancelled";
  createdBy: string;
  createdAt: string;
}

export interface CobuyParticipant {
  id: string;
  groupId: string;
  userId: string;
  lane: CobuyLane;
  amountThb: number;
  interestRatePct?: number;
  areaSqmAttributed?: number;
  fetRequired: boolean;
  joinedAt: string;
}

export type LedgerType =
  | "commit_test_funds"
  | "co_owner_share"
  | "loan"
  | "offer_submitted"
  | "offer_accepted"
  | "document_checked"
  | "share_transfer";

export interface LedgerEntry {
  id: number;
  createdAt: string;
  userId: string;
  entryType: LedgerType;
  amountThb?: number;
  listingId?: string;
  groupId?: string;
  details: string;
  isSimulated: true;
}

/** A fingerprint of the ledger published on Avalanche Fuji (D-33). Contains no personal data. */
export interface LedgerAnchor {
  id: string;
  upToEntryId: number;
  entryCount: number;
  headHash: string; // sha256 hex of the hash chain up to upToEntryId
  message: string; // the exact UTF-8 text written into the transaction data
  chainId: number;
  network: string;
  txHash: string;
  explorerUrl: string;
  createdAt: string;
}

/** Co-Invest (premium): a property split into equal units of simulated co-ownership (D-44). Test money only. */
export interface CoinvestOffering {
  id: string;
  code: string;
  propertyId: string;
  totalUnits: number;
  unitParThb: number; // price per unit while funding
  targetThb: number; // totalUnits × unitParThb
  unitsOutstanding: number; // units held by members; the rest sit in the U-Estate pool
  status: "funding" | "active" | "closed";
  baseValueThb: number; // value at baseMonth (the funding price)
  baseMonth: string; // YYYY-MM
  currentValueThb: number; // index-tracked estimate at valuedMonth, set by code from the BOT index
  valuedMonth: string;
  grossYieldPct: number; // assumption for the simulated rental income
  maxHolders: number;
  opensAt: string;
  fundedAt?: string;
  createdAt: string;
}

export interface CoinvestHolding {
  offeringId: string;
  userId: string;
  units: number;
  costThb: number; // what the member paid for the units they still hold
  areaSqmAttributed: number; // condos, foreign holders: floor area counted against the 49% quota
  fetRequired: boolean;
  updatedAt: string;
}

export interface CoinvestTrade {
  id: string;
  offeringId: string;
  userId: string;
  side: "buy" | "sell";
  phase: "funding" | "active";
  units: number;
  unitPriceThb: number;
  amountThb: number;
  requestId?: string;
  createdAt: string;
}

export interface DB {
  profiles: Profile[];
  buildings: Building[];
  properties: Property[];
  listings: Listing[];
  documentChecks: DocumentCheck[];
  offerRounds: OfferRound[];
  offers: Offer[];
  cobuyGroups: CobuyGroup[];
  cobuyParticipants: CobuyParticipant[];
  ledger: LedgerEntry[];
  anchors: LedgerAnchor[];
  accounts: Account[];
  sessions: Session[];
  walletTxns: WalletTxn[];
  coinvestOfferings: CoinvestOffering[];
  coinvestHoldings: CoinvestHolding[];
  coinvestTrades: CoinvestTrade[];
}
