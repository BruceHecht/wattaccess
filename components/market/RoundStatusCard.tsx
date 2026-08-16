"use client";

import type { Round } from "@/lib/protocol";
import { Countdown } from "./Countdown";

const STATUS_LABEL: Record<Round["status"], string> = { open: "Bidding open", resolved: "Access granted", expired: "Expired — no access" };
const STATUS_COLOR: Record<Round["status"], string> = { open: "var(--accent)", resolved: "var(--good)", expired: "var(--warn)" };

export function RoundStatusCard({ round }: { round: Round }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold" style={{ color: STATUS_COLOR[round.status] }}>
          {STATUS_LABEL[round.status]}
        </span>
        {round.status === "open" && <Countdown closesAt={round.closesAt} />}
      </div>
      <div className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
        {round.festivalGoerName} · battery {round.batteryPct}% · signal {round.wifiSignalPct}% · cap ${round.capUsd.toFixed(2)}
      </div>
      {round.access && (
        <div className="mt-3 rounded-lg border-l-4 p-3 text-sm" style={{ borderColor: "var(--good)", background: "var(--background)" }}>
          <div className="font-bold" style={{ color: "var(--good)" }}>
            Access token: <span className="font-mono">{round.access.token.slice(0, 8)}</span>
          </div>
          <div style={{ color: "var(--muted)" }}>Combined: ${round.access.totalUsd.toFixed(2)}</div>
        </div>
      )}
    </div>
  );
}
