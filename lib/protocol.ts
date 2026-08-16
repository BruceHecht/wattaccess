// Shared wire types between the MarketplaceDO (server) and the browser client. Kept dependency-free
// (no DurableObjectState / DOM types, no @clerk/backend) so this same file can be imported from both
// server code and client components without pulling server-only auth libraries into the browser bundle.

export type MarketRole = "festival_goer" | "wifi_provider" | "power_provider";
export const MARKET_ROLES: MarketRole[] = ["festival_goer", "wifi_provider", "power_provider"];

export function isMarketRole(value: unknown): value is MarketRole {
  return typeof value === "string" && (MARKET_ROLES as string[]).includes(value);
}

export type Track = "wifi" | "power";
// "not_requested": the Festival-Goer didn't ask for this track at all (e.g. wifi-only request).
// "seeking": requested, no accepted offer yet — still open to bids.
// "accepted": this track has an accepted offer; done, independent of the other track.
export type TrackState = "not_requested" | "seeking" | "accepted";
export type OfferStatus = "open" | "won" | "lost";
export type LogKind = "rfo" | "offer" | "accept";

export type Round = {
  id: string;
  festivalGoerId: string;
  festivalGoerName: string;
  batteryPct: number;
  wifiSignalPct: number;
  capUsd: number;
  openedAt: number;
  wifiRequested: boolean;
  powerRequested: boolean;
  wifiState: TrackState;
  powerState: TrackState;
  wifiAcceptedOfferId: string | null;
  powerAcceptedOfferId: string | null;
  // Present once at least one requested track has an accepted offer; fills in independently as the
  // other track (if requested) is accepted too. totalUsd only sums the tracks actually accepted so far.
  access: {
    token: string;
    wifiOfferId: string | null;
    powerOfferId: string | null;
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
  | { type: "open-round"; batteryPct: number; wifiSignalPct: number; capUsd: number; wantsWifi: boolean; wantsPower: boolean }
  | { type: "submit-offer"; roundId: string; priceUsd: number; terms?: string }
  | { type: "accept-offer"; roundId: string; offerId: string };

export type ServerMessage =
  | { type: "snapshot"; rounds: Round[]; offers: Offer[]; log: LogEntry[] }
  | { type: "round-opened"; round: Round; log: LogEntry }
  | { type: "offer-submitted"; offer: Offer; log: LogEntry }
  | { type: "track-accepted"; round: Round; log: LogEntry }
  | { type: "error"; message: string };
