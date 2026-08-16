import { defineConfig, devices } from "@playwright/test";

// Runs against the real Worker (wrangler dev), not `next dev` — the bidding mechanism lives in
// custom-worker.ts, which plain `next dev` never executes. Uses its own persistence directory so test
// runs don't collide with whatever state a developer has from manually poking at `npm run dev`.
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:8787",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npx opennextjs-cloudflare build && npx wrangler dev --port 8787 --persist-to .wrangler/state-test",
    url: "http://localhost:8787",
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: "pipe",
    stderr: "pipe",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
