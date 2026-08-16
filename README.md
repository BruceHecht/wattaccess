# WattAccess

Prototype v0 — see [PRD.md](./PRD.md) for the full spec, scope, and decisions.

Makes the OPD flow real: **Monitoring → Connectivity Level → WiFi/Power Bidding → Coordinator → Access.** A round can
request wifi, power, or both — each track is negotiated, coordinated, and accepted entirely independently, with no
timer forcing a decision. `Access` is one token that fills in progressively as each requested track is accepted.

## Stack

Next.js (App Router) on **Cloudflare Workers** via OpenNext, with a single **Durable Object** (`MarketplaceDO`) per
venue holding the live bidding state and broadcasting it over WebSocket to every connected view — the three
authenticated role dashboards plus a public, unauthenticated spectator view. Auth is **Clerk**. There's no D1/R2 —
the DO's own SQLite storage is both the live state and the durable history (closed rounds stay queryable/replayable).

This mirrors the proven pattern from the Tesselair project (`custom-worker.ts` intercepts the WebSocket upgrade,
authenticates via Clerk, then hands off to the Durable Object stub; everything else falls through to Next.js).

## Architecture at a glance

- `durable-objects/marketplace-do.ts` — the Coordinator. Holds `rounds`, `offers`, `log_entries` in DO-native SQL
  storage. Each track (`wifi`/`power`) on a round has its own `not_requested | seeking | accepted` state — no timer,
  no round-level status. The Festival-Goer accepts a specific offer on a specific track whenever they choose
  (`accept-offer`); the server still enforces the spend cap (rejects an accept that would push the running total
  over it) and marks every other open offer on that same track `lost`. Every state change broadcasts to all
  connected sockets.
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

**Sign-in method matters.** Clerk's default sign-in tries password, then falls back to email code or any enabled
social connection (e.g. Google) — a bare username by itself isn't something Clerk can verify anyone's identity with.
For throwaway demo accounts, enable **Password** under **Configure → User & Authentication → Email, Phone, Username →
Authentication strategies** so username+password sign-in works without needing an inbox to check or a Google account
per persona. This repo's live demo accounts (`festivalgoer`, `wifiprovider`, `powerprovider`) are set up this way —
**the shared demo password is not written here since this repo is public; get it from Bruce directly.**

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

## Testing

```bash
npm run test:e2e
```

Playwright drives the real thing — `wrangler dev` (via `playwright.config.ts`'s `webServer`, using its own
`.wrangler/state-test` persistence dir so it never collides with your manual `npm run dev` state), the actual
Clerk-authenticated UI, and the real `MarketplaceDO`. `tests/helpers/clerk.ts` signs each role in via Clerk's
sign-in-token API (same technique used for manual verification earlier — no password ever touches this flow) against
the three seeded demo accounts, so this requires them to already exist (see Setup above) and `CLERK_SECRET_KEY` to be
set in `.dev.vars`.

Each role gets its own Playwright `BrowserContext` (own cookie jar) — the three simultaneous sign-ins are genuinely
independent sessions, the same property a real multi-person demo relies on, not a role-switch inside one browser.

`tests/marketplace.spec.ts` covers the three flows this model exists to support: wifi requested alone, power
requested alone, and both requested with each accepted independently at different times (accepting wifi is asserted
*not* to affect power's `seeking` state, and `Access` is asserted to exist after only one track clears — proving
the tracks really don't wait on each other). All three currently pass.

## What's verified

Confirmed via the Playwright suite above, against the real Worker and the three real seeded Clerk accounts: opening
a round for either or both tracks, providers submitting offers independently, the Festival-Goer explicitly accepting
an offer on one track without affecting the other, and the public spectator view reflecting it all live. An earlier,
now-superseded version of this mechanism (fixed 20s timer, combined-only resolution) was also manually verified
end-to-end before being replaced by the model described above (PRD §9).
