export const DEFAULT_VENUE_ID = "riverfront-field";

export function marketplaceStubFor(env: CloudflareEnv, venueId: string) {
  const id = env.MARKETPLACE_DO.idFromName(venueId);
  return env.MARKETPLACE_DO.get(id);
}
