"use client";

import { useState } from "react";
import { OfferList } from "@/components/market/OfferList";
import { useMarketSocket } from "@/hooks/useMarketSocket";
import type { Round, TrackState } from "@/lib/protocol";

const STATE_LABEL: Record<TrackState, string> = { not_requested: "—", seeking: "Seeking", accepted: "Accepted" };
const STATE_COLOR: Record<TrackState, string> = { not_requested: "var(--muted)", seeking: "var(--accent)", accepted: "var(--good)" };

function TrackCell({ state }: { state: TrackState }) {
  return (
    <span className="text-sm font-semibold" style={{ color: STATE_COLOR[state] }}>
      {STATE_LABEL[state]}
    </span>
  );
}

function RoundRowDetail({ round, offers }: { round: Round; offers: ReturnType<typeof useMarketSocket>["offers"] }) {
  const [open, setOpen] = useState(false);
  const roundOffers = offers.filter((o) => o.roundId === round.id);

  return (
    <>
      <tr className="border-b" style={{ borderColor: "var(--hairline)" }}>
        <td className="py-2 pr-4 text-sm" style={{ color: "var(--muted)" }}>
          {new Date(round.openedAt).toLocaleString()}
        </td>
        <td className="py-2 pr-4 text-sm">{round.festivalGoerName}</td>
        <td className="py-2 pr-4">{round.wifiRequested ? <TrackCell state={round.wifiState} /> : <span style={{ color: "var(--hairline)" }}>—</span>}</td>
        <td className="py-2 pr-4">{round.powerRequested ? <TrackCell state={round.powerState} /> : <span style={{ color: "var(--hairline)" }}>—</span>}</td>
        <td className="py-2 pr-4 text-sm">${round.capUsd.toFixed(2)}</td>
        <td className="py-2 pr-4 text-sm font-mono">{round.access ? `$${round.access.totalUsd.toFixed(2)}` : "—"}</td>
        <td className="py-2">
          <button type="button" onClick={() => setOpen((v) => !v)} className="text-xs font-semibold underline" style={{ color: "var(--accent)" }}>
            {open ? "Hide offers" : `Offers (${roundOffers.length})`}
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={7} className="pb-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {round.wifiRequested && <OfferList track="wifi" offers={roundOffers} />}
              {round.powerRequested && <OfferList track="power" offers={roundOffers} />}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function HistoryPage() {
  const { connected, rounds, offers } = useMarketSocket("spectator");

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-bold">History</h1>
      <p className="mb-6 text-sm" style={{ color: "var(--muted)" }}>
        {connected ? "Connected" : "Connecting…"} — every request and offer this venue has seen, most recent first.
        Public, unauthenticated, same live data the spectator view shows in the moment.
      </p>

      {rounds.length === 0 ? (
        <p className="rounded-xl border p-6 text-center text-sm" style={{ borderColor: "var(--hairline)", color: "var(--muted)" }}>
          No requests yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b text-left text-xs font-bold uppercase tracking-wide" style={{ borderColor: "var(--hairline)", color: "var(--muted)" }}>
                <th className="py-2 pr-4">Opened</th>
                <th className="py-2 pr-4">Festival-Goer</th>
                <th className="py-2 pr-4">WiFi</th>
                <th className="py-2 pr-4">Power</th>
                <th className="py-2 pr-4">Cap</th>
                <th className="py-2 pr-4">Access total</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rounds.map((round) => (
                <RoundRowDetail key={round.id} round={round} offers={offers} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
