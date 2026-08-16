// @ts-ignore `.open-next/worker.js` is generated at build time
import { default as handler } from "./.open-next/worker.js";
import { getAuthMarketUser } from "./lib/auth";
import { marketplaceStubFor } from "./lib/marketplace";

export { MarketplaceDO } from "./durable-objects/marketplace-do";

function venueIdFromSocketPath(pathname: string): string | null {
  const match = pathname.match(/^\/api\/venues\/([^/]+)\/socket$/);
  return match ? match[1] : null;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const venueId = venueIdFromSocketPath(url.pathname);

    if (venueId && request.headers.get("Upgrade") === "websocket") {
      const role = url.searchParams.get("role");
      const forwarded = new Request(request, { headers: new Headers(request.headers) });

      // Spectator connections are deliberately unauthenticated — the whole point of the spectator
      // view is that anyone watching the demo can see the live negotiation without logging in.
      // Every other role is a real market participant: it must be a genuine, distinct Clerk account
      // whose publicMetadata.role actually matches the track it's connecting to, otherwise the
      // concurrency being demonstrated (independent agents bidding at once) wouldn't be real, and
      // a signed-in festival-goer could just as easily post a wifi offer as a spectator scripting
      // requests could.
      if (role !== "spectator") {
        const user = await getAuthMarketUser(request, {
          secretKey: env.CLERK_SECRET_KEY,
          publishableKey: env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
        });
        if (!user || user.role !== role) {
          return new Response("Forbidden", { status: 403 });
        }
        forwarded.headers.set("X-User-Id", user.userId);
        forwarded.headers.set("X-User-Name", user.name);
        forwarded.headers.set("X-User-Role", user.role);
      }

      const stub = marketplaceStubFor(env, venueId);
      return stub.fetch(forwarded);
    }

    return handler.fetch(request, env, ctx);
  },
  async scheduled(event, env, ctx) {
    // @ts-ignore optional on the generated handler
    return handler.scheduled?.(event, env, ctx);
  },
} satisfies ExportedHandler<CloudflareEnv>;

// Re-exports required by OpenNext's cache/queue support.
// @ts-ignore `.open-next/worker.js` is generated at build time
export { DOQueueHandler, DOShardedTagCache } from "./.open-next/worker.js";
