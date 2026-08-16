"use client";

import { useState } from "react";
import { RoleGate } from "@/components/market/RoleGate";
import { RoundStatusCard } from "@/components/market/RoundStatusCard";
import { OfferList } from "@/components/market/OfferList";
import { NegotiationLog } from "@/components/market/NegotiationLog";
import { useMarketSocket } from "@/hooks/useMarketSocket";

const BATTERY_THRESHOLD = 15;
const WIFI_THRESHOLD = 20;

function FestivalGoerDashboard() {
  const { connected, rounds, offers, log, lastError, openRound, acceptOffer } = useMarketSocket("festival_goer");
  const [batteryPct, setBatteryPct] = useState(12);
  const [wifiSignalPct, setWifiSignalPct] = useState(8);
  const [capUsd, setCapUsd] = useState(8);
  const [wantsWifi, setWantsWifi] = useState(true);
  const [wantsPower, setWantsPower] = useState(true);

  const activeRound = rounds.find((r) => r.wifiState === "seeking" || r.powerState === "seeking") ?? rounds[0] ?? null;
  const belowThreshold = batteryPct <= BATTERY_THRESHOLD || wifiSignalPct <= WIFI_THRESHOLD;
  const hasActiveRequest = rounds.some((r) => r.wifiState === "seeking" || r.powerState === "seeking");
  const canOpen = belowThreshold && !hasActiveRequest && (wantsWifi || wantsPower);

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold">Festival-Goer</h1>
      <p className="mb-6 text-sm" style={{ color: "var(--muted)" }}>
        {connected ? "Connected" : "Connecting…"} — Monitoring watches your battery and wifi signal. When either crosses its
        threshold, it opens a bidding round for whichever tracks you request. WiFi and power are negotiated, coordinated, and
        accepted independently — request either, or both.
      </p>

      <div className="mb-4 grid grid-cols-1 gap-4 rounded-xl border p-4 sm:grid-cols-3" style={{ borderColor: "var(--hairline)" }}>
        <label className="flex flex-col gap-1 text-sm">
          Battery % <span className="text-xs" style={{ color: "var(--muted)" }}>(threshold {BATTERY_THRESHOLD}%)</span>
          <input type="range" min={0} max={100} value={batteryPct} onChange={(e) => setBatteryPct(Number(e.target.value))} />
          <span className="font-mono">{batteryPct}%</span>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          WiFi signal % <span className="text-xs" style={{ color: "var(--muted)" }}>(threshold {WIFI_THRESHOLD}%)</span>
          <input type="range" min={0} max={100} value={wifiSignalPct} onChange={(e) => setWifiSignalPct(Number(e.target.value))} />
          <span className="font-mono">{wifiSignalPct}%</span>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Spend cap ($)
          <input
            type="number"
            min={0}
            step={0.5}
            value={capUsd}
            onChange={(e) => setCapUsd(Number(e.target.value))}
            className="rounded border px-2 py-1"
            style={{ borderColor: "var(--hairline)" }}
          />
        </label>
      </div>

      <div className="mb-4 flex items-center gap-6 text-sm">
        <label className="flex items-center gap-2">
          <input data-testid="wants-wifi" type="checkbox" checked={wantsWifi} onChange={(e) => setWantsWifi(e.target.checked)} />
          Request WiFi
        </label>
        <label className="flex items-center gap-2">
          <input data-testid="wants-power" type="checkbox" checked={wantsPower} onChange={(e) => setWantsPower(e.target.checked)} />
          Request Power
        </label>
      </div>

      <button
        type="button"
        data-testid="open-round-button"
        disabled={!canOpen}
        onClick={() => openRound(batteryPct, wifiSignalPct, capUsd, wantsWifi, wantsPower)}
        className="mb-2 rounded-lg px-5 py-2 text-sm font-semibold text-white disabled:opacity-40"
        style={{ background: "var(--accent)" }}
      >
        {hasActiveRequest ? "Request already seeking offers" : belowThreshold ? "Request offers now" : "Above threshold — lower battery or signal to trigger"}
      </button>
      {lastError && (
        <p className="mb-4 text-sm" style={{ color: "var(--warn)" }}>
          {lastError}
        </p>
      )}

      {activeRound && (
        <div className="mb-6 mt-4 flex flex-col gap-4">
          <RoundStatusCard round={activeRound} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {activeRound.wifiRequested && (
              <OfferList
                track="wifi"
                offers={offers.filter((o) => o.roundId === activeRound.id)}
                canAccept={activeRound.wifiState === "seeking"}
                onAccept={(offerId) => acceptOffer(activeRound.id, offerId)}
              />
            )}
            {activeRound.powerRequested && (
              <OfferList
                track="power"
                offers={offers.filter((o) => o.roundId === activeRound.id)}
                canAccept={activeRound.powerState === "seeking"}
                onAccept={(offerId) => acceptOffer(activeRound.id, offerId)}
              />
            )}
          </div>
        </div>
      )}

      <NegotiationLog entries={log} />
    </div>
  );
}

export default function FestivalGoerPage() {
  return (
    <RoleGate role="festival_goer">
      <FestivalGoerDashboard />
    </RoleGate>
  );
}
