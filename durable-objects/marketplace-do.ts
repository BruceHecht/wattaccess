import type { ClientMessage, LogEntry, Offer, Round, ServerMessage, Track, TrackState } from "../lib/protocol";

type Attachment = { userId: string; name: string; role: "festival_goer" | "wifi_provider" | "power_provider" | "spectator" };

type RoundRow = {
  id: string;
  festival_goer_id: string;
  festival_goer_name: string;
  battery_pct: number;
  wifi_signal_pct: number;
  cap_usd: number;
  opened_at: number;
  wifi_requested: number;
  power_requested: number;
  wifi_state: string;
  power_state: string;
  wifi_accepted_offer_id: string | null;
  power_accepted_offer_id: string | null;
  access_token: string | null;
  access_total_usd: number | null;
};

type OfferRow = {
  id: string;
  round_id: string;
  track: string;
  provider_id: string;
  provider_name: string;
  price_usd: number;
  terms: string | null;
  submitted_at: number;
  status: string;
};

type LogRow = { id: string; round_id: string; kind: string; actor: string; text: string; created_at: number };

function toRound(row: RoundRow): Round {
  return {
    id: row.id,
    festivalGoerId: row.festival_goer_id,
    festivalGoerName: row.festival_goer_name,
    batteryPct: row.battery_pct,
    wifiSignalPct: row.wifi_signal_pct,
    capUsd: row.cap_usd,
    openedAt: row.opened_at,
    wifiRequested: !!row.wifi_requested,
    powerRequested: !!row.power_requested,
    wifiState: row.wifi_state as TrackState,
    powerState: row.power_state as TrackState,
    wifiAcceptedOfferId: row.wifi_accepted_offer_id,
    powerAcceptedOfferId: row.power_accepted_offer_id,
    access:
      row.access_token && row.access_total_usd != null
        ? { token: row.access_token, wifiOfferId: row.wifi_accepted_offer_id, powerOfferId: row.power_accepted_offer_id, totalUsd: row.access_total_usd }
        : null,
  };
}

function toOffer(row: OfferRow): Offer {
  return {
    id: row.id,
    roundId: row.round_id,
    track: row.track as Offer["track"],
    providerId: row.provider_id,
    providerName: row.provider_name,
    priceUsd: row.price_usd,
    terms: row.terms,
    submittedAt: row.submitted_at,
    status: row.status as Offer["status"],
  };
}

function toLog(row: LogRow): LogEntry {
  return { id: row.id, roundId: row.round_id, kind: row.kind as LogEntry["kind"], actor: row.actor, text: row.text, createdAt: row.created_at };
}

export class MarketplaceDO {
  private ctx: DurableObjectState;
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState) {
    this.ctx = ctx;
    this.sql = ctx.storage.sql;
    this.ctx.blockConcurrencyWhile(async () => this.initSchema());
  }

  private initSchema() {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS rounds (
        id TEXT PRIMARY KEY,
        festival_goer_id TEXT NOT NULL,
        festival_goer_name TEXT NOT NULL,
        battery_pct INTEGER NOT NULL,
        wifi_signal_pct INTEGER NOT NULL,
        cap_usd REAL NOT NULL,
        opened_at INTEGER NOT NULL,
        wifi_requested INTEGER NOT NULL,
        power_requested INTEGER NOT NULL,
        wifi_state TEXT NOT NULL,
        power_state TEXT NOT NULL,
        wifi_accepted_offer_id TEXT,
        power_accepted_offer_id TEXT,
        access_token TEXT,
        access_total_usd REAL
      );
    `);
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS offers (
        id TEXT PRIMARY KEY,
        round_id TEXT NOT NULL,
        track TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        provider_name TEXT NOT NULL,
        price_usd REAL NOT NULL,
        terms TEXT,
        submitted_at INTEGER NOT NULL,
        status TEXT NOT NULL
      );
    `);
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS log_entries (
        id TEXT PRIMARY KEY,
        round_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        actor TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") === "websocket") {
      return this.handleWebSocketUpgrade(request);
    }
    return new Response("Not found", { status: 404 });
  }

  private handleWebSocketUpgrade(request: Request): Response {
    const url = new URL(request.url);
    const role = (url.searchParams.get("role") ?? "spectator") as Attachment["role"];
    const userId = request.headers.get("X-User-Id") ?? "spectator";
    const name = request.headers.get("X-User-Name") ?? "Spectator";
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ userId, name, role } satisfies Attachment);
    this.sendSnapshot(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string") return;
    let msg: ClientMessage;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }
    const attachment = ws.deserializeAttachment() as Attachment | null;
    if (!attachment) return;

    switch (msg.type) {
      case "open-round":
        if (attachment.role !== "festival_goer") return this.sendError(ws, "Only a Festival-Goer can open a bidding round.");
        await this.openRound(ws, attachment, msg);
        break;
      case "submit-offer":
        if (attachment.role !== "wifi_provider" && attachment.role !== "power_provider") {
          return this.sendError(ws, "Only WiFi or Power providers can submit offers.");
        }
        await this.submitOffer(attachment, msg);
        break;
      case "accept-offer":
        if (attachment.role !== "festival_goer") return this.sendError(ws, "Only the Festival-Goer who opened the round can accept an offer.");
        await this.acceptOffer(ws, attachment, msg);
        break;
    }
  }

  async webSocketClose(ws: WebSocket) {
    try {
      ws.close();
    } catch {
      // already closed
    }
  }

  private send(ws: WebSocket, msg: ServerMessage) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // socket may be closing; ignore
    }
  }

  private sendError(ws: WebSocket, message: string) {
    this.send(ws, { type: "error", message });
  }

  private broadcast(msg: ServerMessage) {
    const payload = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(payload);
      } catch {
        // socket may be closing; ignore
      }
    }
  }

  private sendSnapshot(ws: WebSocket) {
    const rounds = (this.sql.exec("SELECT * FROM rounds ORDER BY opened_at DESC LIMIT 25").toArray() as unknown as RoundRow[]).map(toRound);
    const offers = (this.sql.exec("SELECT * FROM offers ORDER BY submitted_at ASC").toArray() as unknown as OfferRow[]).map(toOffer);
    const log = (this.sql.exec("SELECT * FROM log_entries ORDER BY created_at ASC LIMIT 200").toArray() as unknown as LogRow[]).map(toLog);
    this.send(ws, { type: "snapshot", rounds, offers, log });
  }

  private addLog(roundId: string, kind: LogEntry["kind"], actor: string, text: string): LogEntry {
    const row: LogRow = { id: crypto.randomUUID(), round_id: roundId, kind, actor, text, created_at: Date.now() };
    this.sql.exec(
      "INSERT INTO log_entries (id, round_id, kind, actor, text, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      row.id,
      row.round_id,
      row.kind,
      row.actor,
      row.text,
      row.created_at,
    );
    return toLog(row);
  }

  private getRound(id: string): RoundRow | undefined {
    return (this.sql.exec("SELECT * FROM rounds WHERE id = ?", id).toArray() as unknown as RoundRow[])[0];
  }

  private async openRound(ws: WebSocket, attachment: Attachment, msg: Extract<ClientMessage, { type: "open-round" }>) {
    if (!msg.wantsWifi && !msg.wantsPower) {
      return this.sendError(ws, "Request at least one of wifi or power.");
    }
    // One active round at a time keeps the demo legible — "active" means some requested track is
    // still seeking. A round where every requested track has already been accepted doesn't block a
    // new one; the two tracks are independent, but re-opening while one is still seeking would be
    // confusing (two concurrent RFOs from the same Festival-Goer racing each other).
    const active = this.sql
      .exec("SELECT id FROM rounds WHERE (wifi_requested = 1 AND wifi_state = 'seeking') OR (power_requested = 1 AND power_state = 'seeking') LIMIT 1")
      .toArray();
    if (active.length > 0) {
      return this.sendError(ws, "A round is already seeking offers — wait for it to finish.");
    }

    const now = Date.now();
    const row: RoundRow = {
      id: crypto.randomUUID(),
      festival_goer_id: attachment.userId,
      festival_goer_name: attachment.name,
      battery_pct: msg.batteryPct,
      wifi_signal_pct: msg.wifiSignalPct,
      cap_usd: msg.capUsd,
      opened_at: now,
      wifi_requested: msg.wantsWifi ? 1 : 0,
      power_requested: msg.wantsPower ? 1 : 0,
      wifi_state: msg.wantsWifi ? "seeking" : "not_requested",
      power_state: msg.wantsPower ? "seeking" : "not_requested",
      wifi_accepted_offer_id: null,
      power_accepted_offer_id: null,
      access_token: null,
      access_total_usd: null,
    };
    this.sql.exec(
      `INSERT INTO rounds (id, festival_goer_id, festival_goer_name, battery_pct, wifi_signal_pct, cap_usd, opened_at, wifi_requested, power_requested, wifi_state, power_state, wifi_accepted_offer_id, power_accepted_offer_id, access_token, access_total_usd)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL)`,
      row.id,
      row.festival_goer_id,
      row.festival_goer_name,
      row.battery_pct,
      row.wifi_signal_pct,
      row.cap_usd,
      row.opened_at,
      row.wifi_requested,
      row.power_requested,
      row.wifi_state,
      row.power_state,
    );

    const wants = [msg.wantsWifi && "wifi", msg.wantsPower && "power"].filter(Boolean).join(" + ");
    const log = this.addLog(
      row.id,
      "rfo",
      attachment.name,
      `Battery ${msg.batteryPct}% · signal ${msg.wifiSignalPct}% — requesting offers for ${wants}, cap $${msg.capUsd.toFixed(2)}.`,
    );
    this.broadcast({ type: "round-opened", round: toRound(row), log });
  }

  private async submitOffer(attachment: Attachment, msg: Extract<ClientMessage, { type: "submit-offer" }>) {
    const round = this.getRound(msg.roundId);
    if (!round) return;

    // Track is derived from the authenticated role, never taken from client input — a wifi_provider
    // account cannot pose as a power offer or vice versa.
    const track: Track = attachment.role === "wifi_provider" ? "wifi" : "power";
    const state = track === "wifi" ? round.wifi_state : round.power_state;
    if (state !== "seeking") return; // not requested, or already accepted — no longer taking bids

    const row: OfferRow = {
      id: crypto.randomUUID(),
      round_id: round.id,
      track,
      provider_id: attachment.userId,
      provider_name: attachment.name,
      price_usd: msg.priceUsd,
      terms: msg.terms ?? null,
      submitted_at: Date.now(),
      status: "open",
    };
    this.sql.exec(
      "INSERT INTO offers (id, round_id, track, provider_id, provider_name, price_usd, terms, submitted_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      row.id,
      row.round_id,
      row.track,
      row.provider_id,
      row.provider_name,
      row.price_usd,
      row.terms,
      row.submitted_at,
      row.status,
    );

    const log = this.addLog(
      round.id,
      "offer",
      attachment.name,
      `${attachment.name} offered $${msg.priceUsd.toFixed(2)}${msg.terms ? ` — ${msg.terms}` : ""} (${track}).`,
    );
    this.broadcast({ type: "offer-submitted", offer: toOffer(row), log });
  }

  // Coordinator: the Festival-Goer accepts a specific offer on a specific track, independent of the
  // other track — wifi and power are negotiated, coordinated, and accepted entirely separately. No
  // timer; a track just sits "seeking" for as long as it takes.
  private async acceptOffer(ws: WebSocket, attachment: Attachment, msg: Extract<ClientMessage, { type: "accept-offer" }>) {
    const round = this.getRound(msg.roundId);
    if (!round) return this.sendError(ws, "Round not found.");
    if (round.festival_goer_id !== attachment.userId) {
      return this.sendError(ws, "Only the Festival-Goer who opened this round can accept an offer on it.");
    }

    const offerRows = this.sql.exec("SELECT * FROM offers WHERE id = ? AND round_id = ?", msg.offerId, msg.roundId).toArray() as unknown as OfferRow[];
    const offer = offerRows[0];
    if (!offer || offer.status !== "open") return this.sendError(ws, "That offer is no longer available.");

    const track = offer.track as Track;
    const state = track === "wifi" ? round.wifi_state : round.power_state;
    if (state !== "seeking") return this.sendError(ws, `The ${track} track isn't open to accept right now.`);

    const alreadyAcceptedUsd =
      (round.wifi_accepted_offer_id
        ? ((this.sql.exec("SELECT price_usd FROM offers WHERE id = ?", round.wifi_accepted_offer_id).toArray() as unknown as OfferRow[])[0]?.price_usd ?? 0)
        : 0) +
      (round.power_accepted_offer_id
        ? ((this.sql.exec("SELECT price_usd FROM offers WHERE id = ?", round.power_accepted_offer_id).toArray() as unknown as OfferRow[])[0]?.price_usd ?? 0)
        : 0);
    const newTotal = alreadyAcceptedUsd + offer.price_usd;
    if (newTotal > round.cap_usd) {
      return this.sendError(ws, `Accepting $${offer.price_usd.toFixed(2)} would bring the total to $${newTotal.toFixed(2)}, over the $${round.cap_usd.toFixed(2)} cap.`);
    }

    this.sql.exec("UPDATE offers SET status = 'won' WHERE id = ?", offer.id);
    this.sql.exec("UPDATE offers SET status = 'lost' WHERE round_id = ? AND track = ? AND status = 'open' AND id != ?", round.id, track, offer.id);

    const token = round.access_token ?? crypto.randomUUID();
    if (track === "wifi") {
      this.sql.exec(
        "UPDATE rounds SET wifi_state = 'accepted', wifi_accepted_offer_id = ?, access_token = ?, access_total_usd = ? WHERE id = ?",
        offer.id,
        token,
        newTotal,
        round.id,
      );
    } else {
      this.sql.exec(
        "UPDATE rounds SET power_state = 'accepted', power_accepted_offer_id = ?, access_token = ?, access_total_usd = ? WHERE id = ?",
        offer.id,
        token,
        newTotal,
        round.id,
      );
    }

    const log = this.addLog(
      round.id,
      "accept",
      attachment.name,
      `Accepted ${offer.provider_name}'s ${track} offer at $${offer.price_usd.toFixed(2)} — running total $${newTotal.toFixed(2)}.`,
    );
    const updated = this.getRound(round.id)!;
    this.broadcast({ type: "track-accepted", round: toRound(updated), log });
  }
}
