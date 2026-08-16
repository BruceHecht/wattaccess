import { createClerkClient } from "@clerk/backend";
import { isMarketRole, type MarketRole } from "./protocol";

export type { MarketRole };

// Next 16's Proxy defaults to the Node.js runtime, which @opennextjs/cloudflare doesn't support yet,
// so this app runs with no clerkMiddleware()/proxy.ts at all. `auth()` from "@clerk/nextjs/server"
// requires that middleware to have run first, so route handlers and the WebSocket upgrade path
// authenticate requests manually here instead.
//
// Keys are passed in explicitly (from the Workers `env` bindings) rather than read from ambient
// `process.env` — custom-worker.ts calls this before OpenNext's own request handling ever runs, at
// which point process.env hasn't been populated yet, so relying on it there throws
// "Publishable key is missing" even though the exact same code works fine from a Next.js route handler.
function clientFor(keys: { secretKey?: string; publishableKey?: string } = {}) {
  return createClerkClient({
    secretKey: keys.secretKey ?? process.env.CLERK_SECRET_KEY,
    publishableKey: keys.publishableKey ?? process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  });
}

export async function getAuthUserId(
  request: Request,
  keys: { secretKey?: string; publishableKey?: string } = {},
): Promise<string | null> {
  const state = await clientFor(keys).authenticateRequest(request, { authorizedParties: undefined });
  const auth = state.toAuth();
  if (auth && "userId" in auth && auth.userId) return auth.userId;
  return null;
}

export type MarketUser = { userId: string; role: MarketRole; name: string };

// Every seeded demo account has its market role stored in Clerk publicMetadata (set from the Clerk
// dashboard — see README). Reading it here means the socket layer can enforce "only a wifi_provider
// account can post to the wifi track" instead of trusting a client-supplied query param.
export async function getAuthMarketUser(
  request: Request,
  keys: { secretKey?: string; publishableKey?: string } = {},
): Promise<MarketUser | null> {
  const client = clientFor(keys);
  const state = await client.authenticateRequest(request, { authorizedParties: undefined });
  const auth = state.toAuth();
  if (!auth || !("userId" in auth) || !auth.userId) return null;

  const user = await client.users.getUser(auth.userId);
  const role = user.publicMetadata?.role;
  if (!isMarketRole(role)) return null;

  const name = user.firstName || user.username || user.emailAddresses[0]?.emailAddress || auth.userId;
  return { userId: auth.userId, role, name };
}
