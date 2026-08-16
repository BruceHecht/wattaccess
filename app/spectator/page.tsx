"use client";

import { RoundStatusCard } from "@/components/market/RoundStatusCard";
import { OfferList } from "@/components/market/OfferList";
import { NegotiationLog } from "@/components/market/NegotiationLog";
import { useMarketSocket } from "@/hooks/useMarketSocket";

export default function SpectatorPage() {
  const { connected, rounds, offers, log } = useMarketSocket("spectator");
  const activeRound = rounds.find((r) => r.status === "open") ?? rounds[0] ?? null;

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-bold">Spectator — live negotiation</h1>
      <p className="mb-6 text-sm" style={{ color: "var(--muted)" }}>
        {connected ? "Connected" : "Connecting…"} — public, read-only view of the WattAccess marketplace at Riverfront Field.
        No sign-in required.
      </p>

      {!activeRound && (
        <p className="rounded-xl border p-6 text-center text-sm" style={{ borderColor: "var(--hairline)", color: "var(--muted)" }}>
          Nothing happening yet — waiting for a Festival-Goer to request offers.
        </p>
      )}

      {activeRound && (
        <div className="mb-6 flex flex-col gap-4">
          <RoundStatusCard round={activeRound} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <OfferList track="wifi" offers={offers.filter((o) => o.roundId === activeRound.id)} />
            <OfferList track="power" offers={offers.filter((o) => o.roundId === activeRound.id)} />
          </div>
        </div>
      )}

      <NegotiationLog entries={log} />
    </div>
  );
}
