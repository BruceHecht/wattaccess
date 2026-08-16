"use client";

import { RoleGate } from "@/components/market/RoleGate";
import { ProviderDashboard } from "@/components/market/ProviderDashboard";

export default function WifiProviderPage() {
  return (
    <RoleGate role="wifi_provider">
      <ProviderDashboard role="wifi_provider" track="wifi" />
    </RoleGate>
  );
}
