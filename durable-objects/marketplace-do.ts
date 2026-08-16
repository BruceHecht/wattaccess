import { BIDDING_WINDOW_MS, type ClientMessage, type LogEntry, type Offer, type Round, type ServerMessage } from "../lib/protocol";

type Attachment = { userId: string; name: string; role: "festival_goer" | "wifi_provider" | "power_provider" | "spectator" };

type RoundRow = {
  id: string;
  status: string;
  festival_goer_id: string;
  festival_goer_name: string;
  battery_pct: number;
  wifi_signal_pct: number;
  cap_usd: number;
  opened_at: number;
  closes_at: number;
  resolved_at: number | null;
  access_token: string | null;
  wifi_offer_id: string | null;
  power_offer_id: string | null;
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
    status: row.status as Round["status"],
    festivalGoerId: row.festival_goer_id,
    festivalGoerName: row.festival_goer_name,
    batteryPct: row.battery_pct,
    wifiSignalPct: row.wifi_signal_pct,
    capUsd: row.cap_usd,
    openedAt: row.opened_at,
    closesAt: row.closes_at,
    resolvedAt: row.resolved_at,
    access:
      row.access_token && row.wifi_offer_id && row.power_offer_id && row.access_total_usd != null
        ? { token: row.access_token, wifiOfferId: row.wifi_offer_id, powerOfferId: row.power_offer_id, totalUsd: row.access_total_usd }
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
        status TEXT NOT NULL,
        festival_goer_id TEXT NOT NULL,
        festival_goer_name TEXT NOT NULL,
        battery_pct INTEGER NOT NULL,
        wifi_signal_pct INTEGER NOT NULL,
        cap_usd REAL NOT NULL,
        opened_at INTEGER NOT NULL,
        closes_at INTEGER NOT NULL,
        resolved_at INTEGER,
        access_token TEXT,
        wifi_offer_id TEXT,
        power_offer_id TEXT,
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
        await this.openRound(attachment, msg);
        break;
      case "submit-offer":
        if (attachment.role !== "wifi_provider" && attachment.role !== "power_provider") {
          return this.sendError(ws, "Only WiFi or Power providers can submit offers.");
        }
        await this.submitOffer(attachment, msg);
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

  async alarm() {
    const now = Date.now();
    const due = this.sql
      .exec("SELECT * FROM rounds WHERE status = 'open' AND closes_at <= ?", now)
      .toArray() as unknown as RoundRow[];
    for (const row of due) this.resolveRound(row);
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

  private async openRound(attachment: Attachment, msg: Extract<ClientMessage, { type: "open-round" }>) {
    const alreadyOpen = this.sql.exec("SELECT id FROM rounds WHERE status = 'open' LIMIT 1").toArray();
    if (alreadyOpen.length > 0) return;

    const now = Date.now();
    const closesAt = now + BIDDING_WINDOW_MS;
    const row: RoundRow = {
      id: crypto.randomUUID(),
      status: "open",
      festival_goer_id: attachment.userId,
      festival_goer_name: attachment.name,
      battery_pct: msg.batteryPct,
      wifi_signal_pct: msg.wifiSignalPct,
      cap_usd: msg.capUsd,
      opened_at: now,
      closes_at: closesAt,
      resolved_at: null,
      access_token: null,
      wifi_offer_id: null,
      power_offer_id: null,
      access_total_usd: null,
    };
    this.sql.exec(
      `INSERT INTO rounds (id, status, festival_goer_id, festival_goer_name, battery_pct, wifi_signal_pct, cap_usd, opened_at, closes_at, resolved_at, access_token, wifi_offer_id, power_offer_id, access_total_usd)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL)`,
      row.id,
      row.status,
      row.festival_goer_id,
      row.festival_goer_name,
      row.battery_pct,
      row.wifi_signal_pct,
      row.cap_usd,
      row.opened_at,
      row.closes_at,
    );
    await this.ctx.storage.setAlarm(closesAt);

    const log = this.addLog(
      row.id,
      "rfo",
      attachment.name,
      `Battery ${msg.batteryPct}% · signal ${msg.wifiSignalPct}% — requesting offers for power + wifi, cap $${msg.capUsd.toFixed(2)}.`,
    );
    this.broadcast({ type: "round-opened", round: toRound(row), log });
  }

  private async submitOffer(attachment: Attachment, msg: Extract<ClientMessage, { type: "submit-offer" }>) {
    const roundRows = this.sql.exec("SELECT * FROM rounds WHERE id = ? AND status = 'open'", msg.roundId).toArray() as unknown as RoundRow[];
    const round = roundRows[0];
    if (!round) return;

    // Track is derived from the authenticated role, never taken from client input — a wifi_provider
    // account cannot pose as a power offer or vice versa.
    const track = attachment.role === "wifi_provider" ? "wifi" : "power";
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

  // Coordinator: picks the cheapest open offer on each track and grants one combined Access only if
  // both tracks cleared and their combined price fits the festival-goer's cap — otherwise the round
  // expires with no access, matching the OPD's single Coordinator -> single Access.
  private resolveRound(round: RoundRow) {
    const cheapest = (track: "wifi" | "power") =>
      (this.sql
        .exec("SELECT * FROM offers WHERE round_id = ? AND track = ? AND status = 'open' ORDER BY price_usd ASC LIMIT 1", round.id, track)
        .toArray() as unknown as OfferRow[])[0];

    const wifiOffer = cheapest("wifi");
    const powerOffer = cheapest("power");
    const total = (wifiOffer?.price_usd ?? 0) + (powerOffer?.price_usd ?? 0);
    const cleared = !!wifiOffer && !!powerOffer && total <= round.cap_usd;

    if (!cleared) {
      this.sql.exec("UPDATE rounds SET status = 'expired', resolved_at = ? WHERE id = ?", Date.now(), round.id);
      const reason = !wifiOffer && !powerOffer
        ? "no offers arrived on either track"
        : !wifiOffer
          ? "no wifi offer arrived"
          : !powerOffer
            ? "no power offer arrived"
            : `cheapest combination ($${total.toFixed(2)}) exceeded the $${round.cap_usd.toFixed(2)} cap`;
      const log = this.addLog(round.id, "expire", "Coordinator", `Round expired — ${reason}.`);
      const updated = (this.sql.exec("SELECT * FROM rounds WHERE id = ?", round.id).toArray() as unknown as RoundRow[])[0];
      this.broadcast({ type: "round-expired", round: toRound(updated), log });
      return;
    }

    const token = crypto.randomUUID();
    const resolvedAt = Date.now();
    this.sql.exec(
      `UPDATE rounds SET status = 'resolved', resolved_at = ?, access_token = ?, wifi_offer_id = ?, power_offer_id = ?, access_total_usd = ? WHERE id = ?`,
      resolvedAt,
      token,
      wifiOffer.id,
      powerOffer.id,
      total,
      round.id,
    );
    this.sql.exec("UPDATE offers SET status = 'won' WHERE id IN (?, ?)", wifiOffer.id, powerOffer.id);
    this.sql.exec(
      "UPDATE offers SET status = 'lost' WHERE round_id = ? AND status = 'open' AND id NOT IN (?, ?)",
      round.id,
      wifiOffer.id,
      powerOffer.id,
    );

    const log = this.addLog(
      round.id,
      "accept",
      "Coordinator",
      `Access granted — ${wifiOffer.provider_name} (wifi, $${wifiOffer.price_usd.toFixed(2)}) + ${powerOffer.provider_name} (power, $${powerOffer.price_usd.toFixed(2)}) = $${total.toFixed(2)}.`,
    );
    const updated = (this.sql.exec("SELECT * FROM rounds WHERE id = ?", round.id).toArray() as unknown as RoundRow[])[0];
    this.broadcast({ type: "round-resolved", round: toRound(updated), log });
  }
}
