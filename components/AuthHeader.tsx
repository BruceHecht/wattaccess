"use client";

import { SignInButton, SignOutButton, SignUpButton, UserButton, useUser } from "@clerk/nextjs";
import Link from "next/link";
import type { MarketRole } from "@/lib/protocol";

const ROLE_LABEL: Record<MarketRole, string> = {
  festival_goer: "Festival-Goer",
  wifi_provider: "WiFi Provider",
  power_provider: "Power Provider",
};

const ROLE_HREF: Record<MarketRole, string> = {
  festival_goer: "/festival-goer",
  wifi_provider: "/wifi-provider",
  power_provider: "/power-provider",
};

export function AuthHeader() {
  const { isLoaded, isSignedIn, user } = useUser();
  const role = user?.publicMetadata?.role as MarketRole | undefined;

  return (
    <header className="flex items-center justify-between gap-3 border-b px-6 py-3" style={{ borderColor: "var(--hairline)" }}>
      <div className="flex items-center gap-6">
        <Link href="/" className="text-xl font-bold">
          Watt<span style={{ color: "var(--accent)" }}>Access</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm font-medium" style={{ color: "var(--muted)" }}>
          <Link href="/spectator" className="hover:underline">
            Spectator
          </Link>
          <Link href="/history" className="hover:underline">
            History
          </Link>
          {isLoaded && isSignedIn && role && (
            <Link href={ROLE_HREF[role]} className="hover:underline" style={{ color: "var(--accent)" }}>
              {ROLE_LABEL[role]} dashboard
            </Link>
          )}
          {isLoaded && isSignedIn && !role && <span className="italic">No market role set — see README</span>}
        </nav>
      </div>

      {isLoaded && !isSignedIn && (
        <div className="flex items-center gap-2">
          <SignInButton mode="modal">
            <button type="button" className="rounded-lg border px-4 py-1.5 text-sm font-semibold" style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>
              Sign in
            </button>
          </SignInButton>
          <SignUpButton mode="modal">
            <button type="button" className="rounded-lg px-4 py-1.5 text-sm font-semibold text-white" style={{ background: "var(--accent)" }}>
              Sign up
            </button>
          </SignUpButton>
        </div>
      )}

      {isLoaded && isSignedIn && (
        <div className="flex items-center gap-3">
          <UserButton />
          <SignOutButton>
            <button type="button" className="rounded-lg border px-4 py-1.5 text-sm font-semibold" style={{ borderColor: "var(--hairline)" }}>
              Sign out
            </button>
          </SignOutButton>
        </div>
      )}
    </header>
  );
}
