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
    "headline" | "position" | "company" | "locationCountry" | "locationCountryCode" | "tags" | "enrichedText"
  >,
  targeting: CampaignTargeting,
): boolean {
  const keywords = (targeting.titleKeywords ?? []).map((k) => k.trim().toLowerCase()).filter(Boolean);
  const countries = (targeting.countries ?? []).filter(Boolean);
  const tags = (targeting.tags ?? []).filter(Boolean);
  const excludeCompanies = (targeting.excludeCompanies ?? [])
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
  const excludeTitles = (targeting.excludeTitleKeywords ?? [])
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  // Exclusions always apply (even with no inclusion criteria).
  if (excludeCompanies.length > 0) {
    const hay = `${conn.company ?? ""} ${conn.enrichedText ?? ""}`.toLowerCase();
    if (excludeCompanies.some((c) => hay.includes(c))) return false;
  }
  // Title/level exclusion: drop anyone whose ROLE contains an excluded word
  // (e.g. Specialist, Coordinator, Account Executive → keeps Manager+ marketing).
  if (excludeTitles.length > 0) {
    const roleHay = `${conn.position ?? ""} ${conn.headline ?? ""}`.toLowerCase();
    if (excludeTitles.some((t) => roleHay.includes(t))) return false;
  }

  if (keywords.length === 0 && countries.length === 0 && tags.length === 0) return true;

  if (keywords.length > 0) {
    // Match against the actual JOB TITLE: the position when we have it, else the
    // headline (un-enriched rows). This keeps the FUNCTION honest — a "Marketing
    // Manager" matches, but an "Account Manager" whose headline merely mentions
    // marketing does not qualify.
    const title = (conn.position?.trim() ? conn.position : conn.headline ?? "").toLowerCase();
    if (!keywords.some((kw) => title.includes(kw))) return false;
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
      (targeting.tags?.length ?? 0) +
      (targeting.excludeCompanies?.length ?? 0) +
      (targeting.excludeTitleKeywords?.length ?? 0) >
    0
  );
}
