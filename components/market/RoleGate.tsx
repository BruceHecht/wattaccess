"use client";

import { SignInButton, useUser } from "@clerk/nextjs";
import type { MarketRole } from "@/lib/protocol";

const ROLE_LABEL: Record<MarketRole, string> = {
  festival_goer: "Festival-Goer",
  wifi_provider: "WiFi Provider",
  power_provider: "Power Provider",
};

export function RoleGate({ role, children }: { role: MarketRole; children: React.ReactNode }) {
  const { isLoaded, isSignedIn, user } = useUser();

  if (!isLoaded) return null;

  if (!isSignedIn) {
    return (
      <div className="mx-auto max-w-md p-10 text-center">
        <p className="mb-4" style={{ color: "var(--muted)" }}>
          Sign in with the seeded <strong>{ROLE_LABEL[role]}</strong> demo account to open this dashboard.
        </p>
        <SignInButton mode="modal">
          <button type="button" className="rounded-lg px-5 py-2 text-sm font-semibold text-white" style={{ background: "var(--accent)" }}>
            Sign in
          </button>
        </SignInButton>
      </div>
    );
  }

  const actualRole = user.publicMetadata?.role as MarketRole | undefined;
  if (actualRole !== role) {
    return (
      <div className="mx-auto max-w-md p-10 text-center" style={{ color: "var(--muted)" }}>
        This account is signed in as <strong>{actualRole ?? "no role"}</strong>, but this dashboard is for the{" "}
        <strong>{ROLE_LABEL[role]}</strong> account. Sign in with the seeded {ROLE_LABEL[role]} demo account instead — see the README for
        how demo roles are assigned in the Clerk dashboard.
      </div>
    );
  }

  return <>{children}</>;
}
