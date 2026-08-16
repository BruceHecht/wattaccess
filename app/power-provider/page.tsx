"use client";

import { RoleGate } from "@/components/market/RoleGate";
import { ProviderDashboard } from "@/components/market/ProviderDashboard";

export default function PowerProviderPage() {
  return (
    <RoleGate role="power_provider">
      <ProviderDashboard role="power_provider" track="power" />
    </RoleGate>
  );
}
