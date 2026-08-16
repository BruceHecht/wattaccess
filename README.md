# WattAccess

Prototype v0 — see [PRD.md](./PRD.md) for the full spec, scope, and decisions.

Makes the OPD flow real: **Monitoring → Connectivity Level → concurrent WiFi/Power Bidding → Coordinator → Access.**
Two independent bidding tracks run at once and resolve into a single combined Access grant.

## Stack

Next.js (App Router) on **Cloudflare Workers** via OpenNext, with a single **Durable Object** (`MarketplaceDO`) per
venue holding the live bidding state and broadcasting it over WebSocket to every connected view — the three
authenticated role dashboards plus a public, unauthenticated spectator view. Auth is **Clerk**. There's no D1/R2 —
the DO's own SQLite storage is both the live state and the durable history (closed rounds stay queryable/replayable).

This mirrors the proven pattern from the Tesselair project (`custom-worker.ts` intercepts the WebSocket upgrade,
authenticates via Clerk, then hands off to the Durable Object stub; everything else falls through to Next.js).

## Architecture at a glance

- `durable-objects/marketplace-do.ts` — the Coordinator. Holds `rounds`, `offers`, `log_entries` in DO-native SQL
  storage. On round-open it schedules a Durable Object **alarm** `BIDDING_WINDOW_MS` (20s) later; when it fires,
  it picks the cheapest offer on each track, grants one combined Access if both cleared and fit under the
  festival-goer's cap, or expires the round otherwise. Every state change broadcasts to all connected sockets.
- `custom-worker.ts` — the Worker entry point. Upgrades `/api/venues/:venueId/socket` to a WebSocket; `role=spectator`
  connects unauthenticated (read-only), any other role must be an authenticated Clerk user whose `publicMetadata.role`
  matches the role in the query string — the WiFi/Power track on an offer is derived server-side from that role, never
  from client input.
- `lib/auth.ts` — manual Clerk `authenticateRequest` (see comment in the file: Next 16 + OpenNext-Cloudflare doesn't
  yet support `clerkMiddleware()`, so there's no `middleware.ts`/`proxy.ts` — auth is checked explicitly wherever it's
  needed instead of relying on middleware having run first).
- `lib/protocol.ts` — the shared wire types (`Round`, `Offer`, `LogEntry`, client/server message unions), kept free of
  server-only or DOM-only imports so it can be shared by both the DO and the browser client.
- `hooks/useMarketSocket.ts` — client WebSocket hook (reconnect with backoff), used by all four pages.
- `app/festival-goer`, `app/wifi-provider`, `app/power-provider`, `app/spectator` — the four views from the PRD's
  demo script.

## Setup

### 1. Install

```bash
npm install
```

### 2. Clerk

Create a Clerk project (or reuse one) and set, in **`.env.local`** (for `next dev` / `next build`) **and**
**`.dev.vars`** (for `wrangler dev` / `opennextjs-cloudflare preview` — both files already exist, gitignored, with
empty placeholders):

```
CLERK_SECRET_KEY=sk_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
```

Without real keys, `next dev` still runs — Clerk's **keyless dev mode** auto-provisions temporary keys and prints a
"claim your keys" link. That's fine for poking at the UI, but the three role dashboards need real seeded accounts to
actually demo the concurrency (see below), so set real keys before the actual demo.

**Seed three demo accounts** (sign up once per role, e.g. `festivalgoer+demo@yourdomain.com`,
`wifi+demo@yourdomain.com`, `power+demo@yourdomain.com`), then in the **Clerk dashboard → Users → (each user) →
Metadata → Public metadata**, set:

```json
{ "role": "festival_goer" }
```

```json
{ "role": "wifi_provider" }
```

```json
{ "role": "power_provider" }
```

These are read by `lib/auth.ts#getAuthMarketUser` and enforced by `custom-worker.ts` — an account without a matching
`publicMetadata.role` can connect as a spectator but can't open rounds or submit offers.

For a live demo, sign in as each of the three accounts in **separate browser profiles or windows** (not just separate
tabs sharing one Clerk session) so the concurrency being demonstrated is real, not simulated.

### 3. Run

```bash
npm run dev
```

`app/page.tsx` and Clerk UI work under plain `next dev`. **The bidding mechanism does not** — `next dev` never
executes `custom-worker.ts`, so `/api/venues/:id/socket` isn't routed and every view will sit at "Connecting…"
forever. For the real thing:

```bash
npm run preview
```

(`opennextjs-cloudflare build && opennextjs-cloudflare preview` — boots the actual Worker, including the Durable
Object, locally via workerd/Miniflare. Verified working locally: the spectator view reaches "Connected" and receives
a live snapshot from `MarketplaceDO` over this path.)

### 4. Deploy

```bash
npm run deploy
```

Requires `wrangler login` (or `CLOUDFLARE_API_TOKEN`) and Clerk secrets set as Cloudflare Worker secrets (not just
`.dev.vars`, which is local-only and gitignored):

```bash
npx wrangler secret put CLERK_SECRET_KEY
npx wrangler secret put NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
```

Deploys to **`wattaccess.tesselair.com`** — reusing the Tesselair project's existing Cloudflare zone and account
rather than buying `wattaccess.io` or any other domain. Two reasons: Durable Objects (which this app depends on, same
as Tesselair's `RoomDO`) require the Workers **Paid** plan, which that account already has, and `tesselair.com` is
already a Cloudflare zone on it — so a second Worker + a new route costs nothing extra. Swapping in a dedicated domain
later (e.g. `wattaccess.io`, if it's ever actually registered — that was never confirmed, see PRD §10) is just a
one-line change to the `routes` block in `wrangler.jsonc`, no code changes.

## What's verified

Confirmed end-to-end against the three real seeded Clerk accounts, running the real Worker locally
(`wrangler dev`): sign-in, role gating, opening a round from the Festival-Goer UI, submitting offers from the WiFi
and Power Provider UIs, and the Coordinator's alarm resolving both into a single combined Access grant — matching
the demo script in PRD §7 exactly (`Access granted — wifi ($2.20) + power ($1.80) = $4.00`, both offers marked
`Won`). The expired-round path (no offers within the window) was verified too. Every view (including the
unauthenticated spectator) reflected the same state live.

**Known local-dev quirk**: `wrangler dev`'s local Durable Object alarm handling can throw an unrelated internal
error (empty message, stack trace through Miniflare's proxy worker, not through this app's code) right around when
an alarm fires, killing the dev process. The round's state — including any offers already submitted — persists to
disk (`.wrangler/state`, gitignored) regardless, so simply restarting `wrangler dev` picks up cleanly and the
pending alarm resolves on boot. Didn't reproduce this in `wrangler deploy --dry-run`'s validation, and it's a
known class of local Miniflare rough edge, not something that should follow into a real deploy — but if a local
`wrangler dev` session unexpectedly dies, that's why.
