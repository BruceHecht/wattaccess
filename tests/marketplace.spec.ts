import { test, expect } from "@playwright/test";
import { signInAs } from "./helpers/clerk";

// One MarketplaceDO instance backs the whole venue, and only one round can be "seeking" at a time
// (see marketplace-do.ts openRound's guard) — so these run serially, each one fully resolving its
// round before the next opens one. Each role gets its own BrowserContext (own cookie jar), so the
// three simultaneous logins are genuinely independent sessions, not a role-switch in one browser.
test.describe.serial("WattAccess marketplace", () => {
  test("wifi-only: request, offer, accept — power track stays untouched", async ({ browser }) => {
    const fg = await (await browser.newContext()).newPage();
    const wifi = await (await browser.newContext()).newPage();
    const spectator = await (await browser.newContext()).newPage();

    await fg.goto("/festival-goer");
    await signInAs(fg, "festival_goer");
    await wifi.goto("/wifi-provider");
    await signInAs(wifi, "wifi_provider");
    await spectator.goto("/spectator");

    await fg.getByTestId("wants-power").uncheck();
    await expect(fg.getByTestId("wants-wifi")).toBeChecked();
    await fg.getByTestId("open-round-button").click();

    await expect(wifi.getByTestId("submit-offer-button")).toBeVisible({ timeout: 10_000 });
    await wifi.getByTestId("submit-offer-button").click();

    await expect(fg.getByTestId("accept-offer")).toBeVisible({ timeout: 10_000 });
    await fg.getByTestId("accept-offer").click();

    await expect(fg.getByTestId("access-grant")).toBeVisible();
    await expect(fg.getByTestId("track-state-wifi")).toHaveAttribute("data-state", "accepted");
    await expect(fg.getByTestId("track-state-power")).toHaveAttribute("data-state", "not_requested");

    // The public spectator view reflects the exact same resolution live, no sign-in.
    await expect(spectator.getByTestId("access-grant")).toBeVisible({ timeout: 10_000 });
    await expect(spectator.getByTestId("track-state-power")).toHaveAttribute("data-state", "not_requested");
  });

  test("power-only: request, offer, accept — wifi track stays untouched", async ({ browser }) => {
    const fg = await (await browser.newContext()).newPage();
    const power = await (await browser.newContext()).newPage();

    await fg.goto("/festival-goer");
    await signInAs(fg, "festival_goer");
    await power.goto("/power-provider");
    await signInAs(power, "power_provider");

    await fg.getByTestId("wants-wifi").uncheck();
    await expect(fg.getByTestId("wants-power")).toBeChecked();
    await fg.getByTestId("open-round-button").click();

    await expect(power.getByTestId("submit-offer-button")).toBeVisible({ timeout: 10_000 });
    await power.getByTestId("submit-offer-button").click();

    await expect(fg.getByTestId("accept-offer")).toBeVisible({ timeout: 10_000 });
    await fg.getByTestId("accept-offer").click();

    await expect(fg.getByTestId("access-grant")).toBeVisible();
    await expect(fg.getByTestId("track-state-power")).toHaveAttribute("data-state", "accepted");
    await expect(fg.getByTestId("track-state-wifi")).toHaveAttribute("data-state", "not_requested");
  });

  test("both requested: wifi and power negotiated, coordinated, and accepted independently", async ({ browser }) => {
    const fg = await (await browser.newContext()).newPage();
    const wifi = await (await browser.newContext()).newPage();
    const power = await (await browser.newContext()).newPage();

    await fg.goto("/festival-goer");
    await signInAs(fg, "festival_goer");
    await wifi.goto("/wifi-provider");
    await signInAs(wifi, "wifi_provider");
    await power.goto("/power-provider");
    await signInAs(power, "power_provider");

    // Both boxes are checked by default.
    await fg.getByTestId("open-round-button").click();

    // Only wifi clears first — power must stay "seeking", proving the two tracks don't wait on each other.
    await expect(wifi.getByTestId("submit-offer-button")).toBeVisible({ timeout: 10_000 });
    await wifi.getByTestId("submit-offer-button").click();
    await expect(fg.getByTestId("accept-offer")).toBeVisible({ timeout: 10_000 });
    await fg.getByTestId("accept-offer").click();

    await expect(fg.getByTestId("track-state-wifi")).toHaveAttribute("data-state", "accepted");
    await expect(fg.getByTestId("track-state-power")).toHaveAttribute("data-state", "seeking");
    // Access already exists from the wifi side alone — it doesn't wait for power.
    await expect(fg.getByTestId("access-grant")).toBeVisible();

    // Now power clears too, independently.
    await expect(power.getByTestId("submit-offer-button")).toBeVisible({ timeout: 10_000 });
    await power.getByTestId("submit-offer-button").click();
    await expect(fg.getByTestId("accept-offer")).toBeVisible({ timeout: 10_000 });
    await fg.getByTestId("accept-offer").click();

    await expect(fg.getByTestId("track-state-wifi")).toHaveAttribute("data-state", "accepted");
    await expect(fg.getByTestId("track-state-power")).toHaveAttribute("data-state", "accepted");
    const grantText = await fg.getByTestId("access-grant").innerText();
    expect(grantText).toContain("WiFi accepted");
    expect(grantText).toContain("Power accepted");
  });
});
