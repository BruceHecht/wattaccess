"use client";

import type { Round, TrackState } from "@/lib/protocol";

const STATE_LABEL: Record<TrackState, string> = { not_requested: "Not requested", seeking: "Seeking offers", accepted: "Accepted" };
const STATE_COLOR: Record<TrackState, string> = { not_requested: "var(--muted)", seeking: "var(--accent)", accepted: "var(--good)" };

function TrackChip({ label, track, state }: { label: string; track: "wifi" | "power"; state: TrackState }) {
  return (
    <span
      data-testid={`track-state-${track}`}
      data-state={state}
      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold"
      style={{ borderColor: STATE_COLOR[state], color: STATE_COLOR[state] }}
    >
      {label}: {STATE_LABEL[state]}
    </span>
  );
}

export function RoundStatusCard({ round }: { round: Round }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}>
      <div className="flex flex-wrap items-center gap-2">
        <TrackChip label="WiFi" track="wifi" state={round.wifiState} />
        <TrackChip label="Power" track="power" state={round.powerState} />
      </div>
      <div className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
        {round.festivalGoerName} · battery {round.batteryPct}% · signal {round.wifiSignalPct}% · cap ${round.capUsd.toFixed(2)}
      </div>
      {round.access && (
        <div data-testid="access-grant" className="mt-3 rounded-lg border-l-4 p-3 text-sm" style={{ borderColor: "var(--good)", background: "var(--background)" }}>
          <div className="font-bold" style={{ color: "var(--good)" }}>
            Access token: <span className="font-mono">{round.access.token.slice(0, 8)}</span>
          </div>
          <div style={{ color: "var(--muted)" }}>
            {round.access.wifiOfferId && "WiFi accepted"}
            {round.access.wifiOfferId && round.access.powerOfferId && " · "}
            {round.access.powerOfferId && "Power accepted"}
            {" — running total $"}
            {round.access.totalUsd.toFixed(2)}
          </div>
        </div>
      )}
    </div>
  );
}
