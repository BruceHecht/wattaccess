import Link from "next/link";

const SURFACES = [
  { href: "/festival-goer", label: "Festival-Goer", desc: "Monitors battery + signal, triggers a bidding round." },
  { href: "/wifi-provider", label: "WiFi Provider", desc: "Bids independently on the wifi track." },
  { href: "/power-provider", label: "Power Provider", desc: "Bids independently on the power track." },
  { href: "/spectator", label: "Spectator", desc: "Public, unauthenticated live view — no sign-in.", accent: true },
  { href: "/history", label: "History", desc: "Every request and offer over time, most recent first.", accent: true },
];

export default function Home() {
  return (
    <div>
      <div className="relative h-64 w-full overflow-hidden sm:h-80">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/hero.jpg" alt="" className="h-full w-full object-cover" style={{ objectPosition: "50% 35%" }} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, transparent 40%, var(--background) 100%)" }} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to right, var(--background), transparent 35%, transparent 65%, var(--background))" }} />
      </div>

      <div className="mx-auto max-w-3xl p-10 pt-0">
        <div className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--accent)" }}>
          Prototype v0
        </div>
        <h1 className="mb-3 text-3xl font-bold">
          Watt<span style={{ color: "var(--accent)" }}>Access</span>
        </h1>
        <p className="mb-8 max-w-xl text-base" style={{ color: "var(--muted)" }}>
          People staying in contact in outdoor settings need power + wifi where resources are limited. This prototype makes
          the Monitoring → Connectivity Level → WiFi/Power Bidding → Coordinator → Access flow real: request either track,
          or both — each is negotiated, coordinated, and accepted entirely independently, with no timer forcing a decision.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {SURFACES.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="rounded-xl border p-4 transition-colors hover:border-current"
              style={{ borderColor: s.accent ? "var(--accent)" : "var(--hairline)" }}
            >
              <div className="font-semibold" style={{ color: s.accent ? "var(--accent)" : "var(--foreground)" }}>
                {s.label}
              </div>
              <div className="text-sm" style={{ color: "var(--muted)" }}>
                {s.desc}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
