import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";

// Reads CLERK_SECRET_KEY straight out of .dev.vars rather than process.env — these tests run under
// plain `node`/Playwright, not the Next.js/Workers runtime, so nothing has loaded that file into the
// environment for us. .dev.vars is gitignored; this only ever runs locally against real dev keys.
function readDevVar(name: string): string {
  const file = path.join(process.cwd(), ".dev.vars");
  const content = fs.readFileSync(file, "utf8");
  const line = content.split("\n").find((l) => l.startsWith(`${name}=`));
  const value = line?.slice(name.length + 1).trim();
  if (!value) {
    throw new Error(`${name} is not set in .dev.vars — required for Clerk test sign-in (see README setup).`);
  }
  return value;
}

const CLERK_SECRET_KEY = readDevVar("CLERK_SECRET_KEY");

export const DEMO_EMAILS = {
  festival_goer: "bruce.hecht+festivalgoer@ieee.org",
  wifi_provider: "bruce.hecht+wifiprovider@ieee.org",
  power_provider: "bruce.hecht+powerprovider@ieee.org",
} as const;

export type DemoRole = keyof typeof DEMO_EMAILS;

async function clerkApi(pathname: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`https://api.clerk.com/v1${pathname}`, {
    ...init,
    headers: { Authorization: `Bearer ${CLERK_SECRET_KEY}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    throw new Error(`Clerk API ${pathname} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

const userIdCache = new Map<DemoRole, string>();

async function userIdFor(role: DemoRole): Promise<string> {
  const cached = userIdCache.get(role);
  if (cached) return cached;
  const users = await clerkApi(`/users?email_address=${encodeURIComponent(DEMO_EMAILS[role])}`);
  const user = users[0];
  if (!user) {
    throw new Error(`No Clerk user found for ${DEMO_EMAILS[role]} — seed the three demo accounts first (see README).`);
  }
  userIdCache.set(role, user.id);
  return user.id as string;
}

async function mintSignInTicket(role: DemoRole): Promise<string> {
  const userId = await userIdFor(role);
  const body = await clerkApi("/sign_in_tokens", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, expires_in_seconds: 300 }),
  });
  return body.token as string;
}

// Signs a page's Clerk session in as one of the seeded demo accounts via Clerk's sign-in-token API —
// no password ever touches this flow. Each Playwright BrowserContext has its own cookie jar, so
// distinct pages signed in this way are genuinely independent sessions, not role-switches within one
// browser — the same property the manual verification in this session relied on.
export async function signInAs(page: Page, role: DemoRole): Promise<void> {
  const ticket = await mintSignInTicket(role);
  await page.waitForFunction(() => Boolean((window as any).Clerk?.loaded));
  const result = await page.evaluate(async (ticket) => {
    const Clerk = (window as any).Clerk;
    if (Clerk.user) await Clerk.signOut();
    const signIn = await Clerk.client.signIn.create({ strategy: "ticket", ticket });
    await Clerk.setActive({ session: signIn.createdSessionId });
    return { userId: Clerk.user?.id, role: Clerk.user?.publicMetadata?.role };
  }, ticket);
  if (!result.userId) throw new Error(`Sign-in as ${role} did not produce a Clerk user.`);
  await page.reload();
}
