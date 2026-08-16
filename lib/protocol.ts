// Shared wire types between the MarketplaceDO (server) and the browser client. Kept dependency-free
// (no DurableObjectState / DOM types, no @clerk/backend) so this same file can be imported from both
// server code and client components without pulling server-only auth libraries into the browser bundle.

export type MarketRole = "festival_goer" | "wifi_provider" | "power_provider";
export const MARKET_ROLES: MarketRole[] = ["festival_goer", "wifi_provider", "power_provider"];

export function isMarketRole(value: unknown): value is MarketRole {
  return typeof value === "string" && (MARKET_ROLES as string[]).includes(value);
}

export type Track = "wifi" | "power";
export type RoundStatus = "open" | "resolved" | "expired";
export type OfferStatus = "open" | "won" | "lost";
export type LogKind = "rfo" | "offer" | "accept" | "expire";

export type Round = {
  id: string;
  status: RoundStatus;
  festivalGoerId: string;
  festivalGoerName: string;
  batteryPct: number;
  wifiSignalPct: number;
  capUsd: number;
  openedAt: number;
  closesAt: number;
  resolvedAt: number | null;
  access: {
    token: string;
    wifiOfferId: string;
    powerOfferId: string;
    totalUsd: number;
  } | null;
};

export type Offer = {
  id: string;
  roundId: string;
  track: Track;
  providerId: string;
  providerName: string;
  priceUsd: number;
  terms: string | null;
  submittedAt: number;
  status: OfferStatus;
};

export type LogEntry = {
  id: string;
  roundId: string;
  kind: LogKind;
  actor: string;
  text: string;
  createdAt: number;
};

export type ClientMessage =
  | { type: "open-round"; batteryPct: number; wifiSignalPct: number; capUsd: number }
  | { type: "submit-offer"; roundId: string; priceUsd: number; terms?: string };

export type ServerMessage =
  | { type: "snapshot"; rounds: Round[]; offers: Offer[]; log: LogEntry[] }
  | { type: "round-opened"; round: Round; log: LogEntry }
  | { type: "offer-submitted"; offer: Offer; log: LogEntry }
  | { type: "round-resolved"; round: Round; log: LogEntry }
  | { type: "round-expired"; round: Round; log: LogEntry }
  | { type: "error"; message: string };

// How long a round stays open for bids before the Coordinator resolves it — short enough to keep a
// live demo moving, long enough for a presenter to flip between the two provider tabs and bid.
export const BIDDING_WINDOW_MS = 20_000;
