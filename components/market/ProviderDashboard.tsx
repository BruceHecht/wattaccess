"use client";

import { useState } from "react";
import { RoundStatusCard } from "@/components/market/RoundStatusCard";
import { OfferList } from "@/components/market/OfferList";
import { NegotiationLog } from "@/components/market/NegotiationLog";
import { useMarketSocket } from "@/hooks/useMarketSocket";
import type { MarketRole, Track } from "@/lib/protocol";

const TRACK_LABEL: Record<Track, string> = { wifi: "WiFi", power: "Power" };

export function ProviderDashboard({ role, track }: { role: Extract<MarketRole, "wifi_provider" | "power_provider">; track: Track }) {
  const { connected, rounds, offers, log, submitOffer } = useMarketSocket(role);
  const [price, setPrice] = useState(track === "wifi" ? 2.2 : 1.8);
  const [terms, setTerms] = useState("");

  const activeRound = rounds.find((r) => r.status === "open") ?? null;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold">{TRACK_LABEL[track]} Provider</h1>
      <p className="mb-6 text-sm" style={{ color: "var(--muted)" }}>
        {connected ? "Connected" : "Connecting…"} — bid independently against every other {TRACK_LABEL[track]} provider watching this
        venue. The Coordinator picks the cheapest offer on each track once bidding closes.
      </p>

      {!activeRound && (
        <p className="rounded-xl border p-4 text-sm" style={{ borderColor: "var(--hairline)", color: "var(--muted)" }}>
          No open round right now — waiting for a Festival-Goer to request offers.
        </p>
      )}

      {activeRound && (
        <div className="mb-6 flex flex-col gap-4">
          <RoundStatusCard round={activeRound} />

          <div className="flex flex-wrap items-end gap-3 rounded-xl border p-4" style={{ borderColor: "var(--hairline)" }}>
            <label className="flex flex-col gap-1 text-sm">
              Price ($/hr)
              <input
                type="number"
                min={0}
                step={0.05}
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
                className="w-28 rounded border px-2 py-1"
                style={{ borderColor: "var(--hairline)" }}
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-sm">
              Terms (optional)
              <input
                type="text"
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                placeholder="e.g. priority lane included"
                className="rounded border px-2 py-1"
                style={{ borderColor: "var(--hairline)" }}
              />
            </label>
            <button
              type="button"
              disabled={activeRound.status !== "open"}
              onClick={() => submitOffer(activeRound.id, price, terms || undefined)}
              className="rounded-lg px-5 py-2 text-sm font-semibold text-white disabled:opacity-40"
              style={{ background: "var(--accent)" }}
            >
              Submit offer
            </button>
          </div>

          <OfferList track={track} offers={offers.filter((o) => o.roundId === activeRound.id)} />
        </div>
      )}

      <NegotiationLog entries={log} />
    </div>
  );
}
