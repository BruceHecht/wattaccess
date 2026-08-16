"use client";

import type { Offer, Track } from "@/lib/protocol";

const STATUS_LABEL: Record<Offer["status"], string> = { open: "Open", won: "Accepted", lost: "Lost" };
const STATUS_COLOR: Record<Offer["status"], string> = { open: "var(--muted)", won: "var(--good)", lost: "var(--muted)" };

export function OfferList({
  track,
  offers,
  onAccept,
  canAccept = false,
}: {
  track: Track;
  offers: Offer[];
  onAccept?: (offerId: string) => void;
  canAccept?: boolean;
}) {
  const trackOffers = offers.filter((o) => o.track === track).sort((a, b) => a.priceUsd - b.priceUsd);

  return (
    <div data-testid={`offers-${track}`} className="rounded-xl border p-3" style={{ borderColor: "var(--hairline)" }}>
      <div className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
        {track === "wifi" ? "WiFi track" : "Power track"}
      </div>
      {trackOffers.length === 0 && (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          No offers yet.
        </p>
      )}
      <ul className="flex flex-col gap-1.5">
        {trackOffers.map((offer) => (
          <li key={offer.id} className="flex items-center justify-between text-sm">
            <span>
              {offer.providerName}
              {offer.terms ? <span style={{ color: "var(--muted)" }}> — {offer.terms}</span> : null}
            </span>
            <span className="flex items-center gap-2">
              <span className="font-mono font-semibold">${offer.priceUsd.toFixed(2)}</span>
              {canAccept && offer.status === "open" && onAccept ? (
                <button
                  type="button"
                  data-testid="accept-offer"
                  onClick={() => onAccept(offer.id)}
                  className="rounded-md px-2.5 py-1 text-xs font-semibold text-white"
                  style={{ background: "var(--accent)" }}
                >
                  Accept
                </button>
              ) : (
                <span className="text-xs" style={{ color: STATUS_COLOR[offer.status] }}>
                  {STATUS_LABEL[offer.status]}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
