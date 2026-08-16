import { loadEnvConfig } from "@next/env";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";

// Ensure .env.local is loaded before Next evaluates proxy / server bundles (avoids empty Clerk keys in dev).
loadEnvConfig(process.cwd());

// Gives `npm run dev` (plain Next dev server) access to local D1/DO bindings via getCloudflareContext(),
// same as `wrangler dev` — reads bindings from wrangler.jsonc.
initOpenNextCloudflareForDev();

if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim()) {
  console.warn(
    "\n[Clerk] NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is missing or empty. Add it to .env.local — the three role dashboards and the Coordinator's auth check won't work without it.\n",
  );
}

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
