"use client";

import { useEffect, useRef, useState } from "react";
import type { LogEntry, MarketRole, Offer, Round, ServerMessage } from "@/lib/protocol";

export type { LogEntry, Offer, Round };

const DEFAULT_VENUE_ID = "riverfront-field";

export function useMarketSocket(role: MarketRole | "spectator") {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let reconnectAttempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${proto}://${window.location.host}/api/venues/${DEFAULT_VENUE_ID}/socket?role=${role}`;

    // The Durable Object's connection can drop on deploys or transient network issues, so every
    // close schedules a reconnect (backing off up to 10s) rather than leaving the view stuck stale.
    const connect = () => {
      if (cancelled) return;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.addEventListener("open", () => {
        reconnectAttempt = 0;
        setConnected(true);
      });

      ws.addEventListener("close", () => {
        setConnected(false);
        if (cancelled) return;
        const delay = Math.min(1000 * 2 ** reconnectAttempt, 10000);
        reconnectAttempt += 1;
        reconnectTimer = setTimeout(connect, delay);
      });

      ws.addEventListener("message", (event) => {
        const msg = JSON.parse(event.data) as ServerMessage;
        switch (msg.type) {
          case "snapshot":
            setRounds(msg.rounds);
            setOffers(msg.offers);
            setLog(msg.log);
            break;
          case "round-opened":
            setRounds((prev) => [msg.round, ...prev]);
            setLog((prev) => [...prev, msg.log]);
            break;
          case "offer-submitted":
            setOffers((prev) => [...prev, msg.offer]);
            setLog((prev) => [...prev, msg.log]);
            break;
          case "track-accepted":
            setRounds((prev) => prev.map((r) => (r.id === msg.round.id ? msg.round : r)));
            setLog((prev) => [...prev, msg.log]);
            break;
          case "error":
            setLastError(msg.message);
            break;
        }
      });
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [role]);

  const send = (msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  };

  const openRound = (batteryPct: number, wifiSignalPct: number, capUsd: number, wantsWifi: boolean, wantsPower: boolean) =>
    send({ type: "open-round", batteryPct, wifiSignalPct, capUsd, wantsWifi, wantsPower });

  const submitOffer = (roundId: string, priceUsd: number, terms?: string) =>
    send({ type: "submit-offer", roundId, priceUsd, terms });

  const acceptOffer = (roundId: string, offerId: string) => send({ type: "accept-offer", roundId, offerId });

  return { connected, rounds, offers, log, lastError, openRound, submitOffer, acceptOffer };
}
