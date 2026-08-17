import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { connections, type Connection, type LinkedinAccount, type ConnectionEnrichment } from "@/db/schema";
import { getProfile } from "@/lib/unipile/client";
import { incrementCounter, type SendKind } from "@/lib/rate-limit";
import { pickLatestJob } from "@/lib/icp";
import { countryFromLocation } from "@/lib/countries";

/** Lowercased searchable blob for enriched ICP keyword matching. */
export function buildEnrichedText(parts: {
  headline?: string | null;
  position?: string | null;
  company?: string | null;
  description?: string | null;
  summary?: string | null;
}): string {
  return [parts.headline, parts.position, parts.company, parts.description, parts.summary]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .trim();
}

/**
 * Enrich one connection via GET /users/{id} and persist the latest job (title,
 * company, description), About summary, country (name + ISO code from the real
 * searchable `enrichedText`, and provider id. Increments the given daily
 * counter (`enrich` for send-time / lazy, `autoEnrich` for the daily job).
 * Throws on API error so callers can distinguish rate-limits.
 */
export async function enrichConnectionRow(
  conn: Connection,
  account: LinkedinAccount,
  opts: { counter: Extract<SendKind, "enrich" | "autoEnrich"> },
): Promise<Connection> {
  const identifier = conn.publicIdentifier || conn.providerId || conn.memberId;
  if (!identifier) return conn;

  const profile = await getProfile(identifier, {
    accountId: account.unipileAccountId,
    sections: ["experience", "about"],
    notify: false,
  });
  await incrementCounter(account.id, opts.counter);

  const { position, company, description } = pickLatestJob(profile.work_experience ?? []);
  // Real location comes from profile.location (a free-text string like
  // "Bengaluru, Karnataka, India"), NOT primary_locale (that's the UI locale,
  // ~always "US" for English LinkedIn). Derive both the country name + ISO code.
  const rawLocation = profile.location ?? null;
  const country = countryFromLocation(rawLocation);
  const enrichment: ConnectionEnrichment = {
    summary: profile.summary ?? null,
    location: rawLocation,
    workExperience: (profile.work_experience ?? []).slice(0, 6).map((e) => ({
      position: e.position ?? null,
      company: e.company ?? null,
      current: e.current ?? null,
      description: e.description ?? null,
    })),
  };

  const nextPosition = position ?? conn.position;
  const nextCompany = company ?? conn.company;
  const enrichedText = buildEnrichedText({
    headline: conn.headline,
    position: nextPosition,
    company: nextCompany,
    description,
    summary: profile.summary,
  });

  const [updated] = await db
    .update(connections)
    .set({
      providerId: profile.provider_id ?? conn.providerId,
      // Refresh the avatar too — LinkedIn photo URLs are signed/expiring, so a
      // fresh one from each enrichment keeps images from silently 404-ing.
      profilePictureUrl: profile.profile_picture_url ?? conn.profilePictureUrl,
      company: nextCompany,
      position: nextPosition,
      locationCountry: country?.name ?? null,
      locationCountryCode: country?.code ?? null,
      enrichment,
      enrichedText,
      enrichedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(connections.id, conn.id))
    .returning();
  return updated ?? conn;
}
