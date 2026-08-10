import type { Connection, CampaignTargeting } from "@/db/schema";
import { toCode } from "@/lib/countries";

/** Pick the connection's current role (else the most recent) from work experience. */
export function pickLatestJob(
  workExperience: Array<{
    position?: string | null;
    company?: string | null;
    current?: boolean | null;
    description?: string | null;
  }> = [],
): { position: string | null; company: string | null; description: string | null } {
  const current = workExperience.find((e) => e.current);
  const chosen = current ?? workExperience[0];
  return {
    position: chosen?.position ?? null,
    company: chosen?.company ?? null,
    description: chosen?.description ?? null,
  };
}

/**
 * In-memory ICP test, mirroring the SQL in `getIcpMatches`. Empty targeting
 * (no keywords, countries, or tags) means "no ICP defined" → always matches.
 */
export function connectionMatchesIcp(
  conn: Pick<
    Connection,
    "headline" | "position" | "locationCountry" | "locationCountryCode" | "tags" | "enrichedText"
  >,
  targeting: CampaignTargeting,
): boolean {
  const keywords = (targeting.titleKeywords ?? []).map((k) => k.trim().toLowerCase()).filter(Boolean);
  const countries = (targeting.countries ?? []).filter(Boolean);
  const tags = (targeting.tags ?? []).filter(Boolean);

  if (keywords.length === 0 && countries.length === 0 && tags.length === 0) return true;

  if (keywords.length > 0) {
    // Prefer the enriched search blob (title + description + company + About);
    // fall back to headline + position for connections not yet enriched.
    const haystack = (
      conn.enrichedText ?? `${conn.headline ?? ""} ${conn.position ?? ""}`
    ).toLowerCase();
    if (!keywords.some((kw) => haystack.includes(kw))) return false;
  }

  if (countries.length > 0) {
    // Match on ISO code so names/codes/casing can't diverge. Prefer the stored
    // code, fall back to deriving it from the name (legacy rows).
    const targetCodes = new Set(countries.map((c) => toCode(c)).filter(Boolean));
    const connCode = conn.locationCountryCode ?? toCode(conn.locationCountry);
    if (!connCode || !targetCodes.has(connCode)) return false;
  }

  if (tags.length > 0) {
    const connTags = conn.tags ?? [];
    if (!tags.some((t) => connTags.includes(t))) return false;
  }

  return true;
}

/** Whether a campaign has any ICP criteria set. */
export function hasIcp(targeting: CampaignTargeting): boolean {
  return (
    (targeting.titleKeywords?.length ?? 0) +
      (targeting.countries?.length ?? 0) +
      (targeting.tags?.length ?? 0) >
    0
  );
}
