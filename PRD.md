# WattAccess — Prototype PRD (v0, one-day build)

**Date:** Aug 16, 2026 · **Working name:** WattAccess (wattaccess.io) · **Owners:** Bruce & Elaine
**Prior art:** this replaces the "WattLoop" naming (wattloop.com is an active, unrelated EV-battery-certification company — confirmed conflict, avoid). Concept assets from that exploration (landing page, agent-demo mock, tech spec, canvases) are reused below where still applicable, trimmed to what's actually buildable today.

---

## 1 · Problem statement

> People staying in contact in outdoor settings need power + wifi where resources are limited.

**System problem statement**
- **To** communicate online
- **By** accessing on-demand power + wifi
- **Using** an agentic service marketplace

---

## 2 · Core mechanism (from the OPD sketch)

This is the process the prototype has to make real — not simulated with a canned script, but actually running:

```
Festival-Goer ──triggers──▶ Monitoring
                               │
                    ┌──────────┴──────────┐
                    ▼                     ▼
               WiFi Strength        Battery [state]
                    │                     │
                    └──────────┬──────────┘
                               ▼
                      Connectivity Level
                               │
                 ┌─────────────┴─────────────┐
                 ▼                             ▼
        Bidding for Access              Bidding for Access
             (WiFi)                          (Power)
                 ▲                             ▲
          WiFi Provider                 Power Provider
                 │                             │
                 └─────────────┬───────────────┘
                                ▼
                          Coordinator
                                │
                                ▼
                             Access
```

Three actors, one object crossing a system boundary (**Access**):
- **Festival-Goer** (buyer) — the human whose falling connectivity/battery state triggers the whole flow.
- **WiFi Provider** and **Power Provider** (sellers) — independent agents that bid concurrently, not sequentially, once a request is open.
- **Coordinator** — resolves the two simultaneous bidding processes into one **Access** grant.

The demonstrable moment for today's build is that concurrency: two bidding processes running at once, converging at a coordinator, watched live.

---

## 3 · Scope for today

**In scope (v0):**
- Real Connectivity Level monitor: a Festival-Goer client reports/simulates battery % and wifi signal, and crosses a low-threshold trigger that opens a bidding round.
- Real, live bidding: 2+ seeded WiFi Provider agents and 2+ seeded Power Provider agents submit/counter bids against the open request, running concurrently (not scripted in sequence).
- Coordinator logic: evaluates both bidding tracks, picks winners, emits a single **Access** object (a token/code — no real hardware).
- Three authenticated role views (Festival-Goer, WiFi Provider, Power Provider) + one **public, unauthenticated spectator view** showing the live negotiation log and current state of all open rounds, for demoing to onlookers.
- Persistence of the negotiation log (every RFO/offer/counter/accept message), so a completed round can be replayed/shown after the fact.

**Explicitly out of scope today** (real, but deferred — from the earlier WattLoop spec, kept for later phases):
- Physical pods/hardware, BLE/NFC unlock, firmware.
- Connectivity supply-chain sourcing (eSIM wholesale, MVNE, OpenRoaming/neutral-host offload, satellite).
- Real payments/Stripe, AP2-style signed mandates, x402 metering.
- Sponsored local discovery / vendor ads (`discover_nearby`).
- Rent-to-own credit ladder, carrier-affiliate off-ramp.
- Battery-safety/certification concerns (UL 1974/2054, UN 38.3) — not relevant, no hardware today.

---

## 4 · Actors & identity

| Role | Auth | Notes |
|---|---|---|
| Festival-Goer | Clerk session (seeded test account) | Triggers monitoring; sets a spend/priority cap; sees offers arrive and can accept/let-agent-decide. |
| WiFi Provider | Clerk session (seeded test account) | Runs its own pricing/inventory; submits offers into open rounds it can serve. |
| Power Provider | Clerk session (seeded test account) | Same pattern, separate agent identity — must be a genuinely distinct session, not the same user role-switching, so the concurrency is real. |
| Spectator | none (public route) | Read-only live view of all open/closed bidding rounds — this is the "demonstrate the operating idea" surface for judges/onlookers. |

Rationale for 3 distinct seeded accounts rather than 1: the point being demonstrated is *concurrent, independent* agents negotiating — a single user switching roles would misrepresent the mechanism.

---

## 5 · Architecture

**Stack:** Cloudflare Workers + Durable Objects + Clerk (real-time, simultaneous-view pattern — matches the requirement that multiple viewers watch one live negotiation state, not the Railway/Supabase pattern used for interactive knowledge/story systems).

- **Next.js on Cloudflare Workers** (OpenNext), same deploy pattern as prior Cloudflare builds.
- **One Durable Object per bidding round** — holds the authoritative state (open request, WiFi track, Power track, message log) and broadcasts updates over WebSocket to every connected view (buyer, both provider types, spectator) simultaneously. This is what makes the concurrency visible instead of just internally true.
- **Clerk** for the three authenticated roles; spectator route is unauthenticated and reads a public, redacted projection of DO state.
- **KV or D1** for durable history (closed rounds, for replay) — DO state is the live/hot path, not the archive.

## 6 · Data model (minimal)

```
BiddingRound {
  id, festival_goer_id, opened_at, status: open|resolved|expired,
  trigger: { battery_pct, wifi_signal, threshold_crossed }
  wifi_track:  { offers: Offer[], winner_offer_id? }
  power_track: { offers: Offer[], winner_offer_id? }
  access?: { token, granted_at, wifi_offer_id, power_offer_id }
}

Offer {
  id, round_id, track: wifi|power, provider_id,
  price, terms, submitted_at, status: open|countered|accepted|rejected
}
```

Every state transition (RFO opened, offer submitted, counter, accept, coordinator resolution) is appended to the round's message log — this log **is** the thing the spectator view renders live, and the thing replayed after a round closes.

---

## 7 · Demo script (what actually happens today)

1. Festival-Goer client shows battery/signal draining (simulated slider or timer) → crosses threshold → opens a `BiddingRound`.
2. Both provider dashboards (open in separate browser sessions/windows, logged in as their own Clerk identity) see the open request appear in real time and submit offers independently.
3. Spectator view (projected, no login) shows both tracks filling in live, side by side — this is the "two bidding processes running in parallel" moment from the diagram, made visible.
4. Festival-Goer's agent auto-accepts the cheapest offer under cap on each track, no human click — Coordinator waits for **both** tracks to clear, then resolves.
5. A single combined `Access` token (covering both wifi + power) is issued and shown on all four views simultaneously — the payoff moment.
6. Round moves to history; can be replayed from the log.

---

## 8 · Success criteria for today

- A festival-goer client and at least 2 wifi + 2 power provider clients, running as genuinely separate authenticated sessions, can complete one full round end-to-end without a scripted/hardcoded sequence.
- A spectator can watch the whole thing live, unauthenticated, with no manual refresh.
- The negotiation log for a completed round is inspectable afterward.
- No real hardware, payment, or provisioning dependency blocks the demo.

---

## 9 · Decisions

- **Accept flow: auto-accept.** Festival-Goer's agent auto-accepts the cheapest offer under cap on each track, no human click — matches "Maya never opens an app," keeps the demo hands-off.
- **Resolution model: combined.** Coordinator waits for both WiFi and Power tracks to clear, then issues one combined Access token — matches the OPD diagram as drawn (both tracks → one Coordinator → one Access).

## 10 · Open questions

- wattaccess.io — confirm registration at a registrar before using it publicly; not yet verified as claimed.
