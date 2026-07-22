import "server-only";
import {
  and,
  or,
  count,
  desc,
  eq,
  ne,
  ilike,
  inArray,
  notExists,
  arrayOverlaps,
  sql,
  type SQL,
} from "drizzle-orm";
import { db } from "@/db";
import { connections, enrollments, type Connection, type CampaignTargeting } from "@/db/schema";
import { accountScope } from "@/lib/access";

export interface ConnectionFilters {
  accountId?: string;
  search?: string;
  country?: string;
  status?: string;
  tag?: string;
  page?: number;
  pageSize?: number;
}

export interface ConnectionsResult {
  rows: Connection[];
  total: number;
  page: number;
  pageSize: number;
}

function buildWhere(f: ConnectionFilters): SQL | undefined {
  const clauses: SQL[] = [];
  if (f.accountId) clauses.push(eq(connections.accountId, f.accountId));
  if (f.country) clauses.push(eq(connections.locationCountry, f.country));
  if (f.status) clauses.push(eq(connections.relationshipStatus, f.status as Connection["relationshipStatus"]));
  if (f.tag) clauses.push(sql`${f.tag} = ANY(${connections.tags})`);
  if (f.search) {
    const q = `%${f.search}%`;
    const term = or(
      ilike(connections.firstName, q),
      ilike(connections.lastName, q),
      ilike(connections.headline, q),
      ilike(connections.company, q),
      ilike(connections.position, q),
    );
    if (term) clauses.push(term);
  }
  return clauses.length ? and(...clauses) : undefined;
}

export async function getConnections(
  f: ConnectionFilters,
  accessibleIds: string[] | null = null,
): Promise<ConnectionsResult> {
  const page = Math.max(1, f.page ?? 1);
  const pageSize = Math.min(200, Math.max(10, f.pageSize ?? 50));
  const base = buildWhere(f);
  const scope = accountScope(connections.accountId, accessibleIds);
  const parts = [base, scope].filter(Boolean) as SQL[];
  const where = parts.length === 0 ? undefined : parts.length === 1 ? parts[0] : and(...parts);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(connections)
      .where(where)
      .orderBy(desc(connections.connectedAt), desc(connections.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(connections).where(where),
  ]);

  return { rows, total: Number(total), page, pageSize };
}

export interface IcpMatchResult {
  count: number;
  ids: string[];
}

/**
 * Find connections matching a campaign's ICP (targeting), excluding those
 * already enrolled in the campaign. Title keywords match the LinkedIn headline
 * OR (when enriched) the position; countries match only enriched rows.
 */
export async function getIcpMatches(
  accountId: string,
  targeting: CampaignTargeting,
  opts: { excludeCampaignId?: string; idLimit?: number; dedupe?: boolean } = {},
): Promise<IcpMatchResult> {
  // Pool = all of the account's connections (they are all 1st-degree), minus
  // anyone flagged do-not-contact. Empty targeting matches the whole pool.
  const clauses: SQL[] = [
    eq(connections.accountId, accountId),
    ne(connections.relationshipStatus, "do_not_contact"),
  ];

  const keywords = (targeting.titleKeywords ?? []).map((k) => k.trim()).filter(Boolean);
  if (keywords.length > 0) {
    // Match against the enriched search blob (title + job description + company
    // + About), OR the headline for connections not yet enriched.
    const kwClause = or(
      ...keywords.flatMap((kw) => [
        ilike(connections.enrichedText, `%${kw}%`),
        ilike(connections.headline, `%${kw}%`),
      ]),
    );
    if (kwClause) clauses.push(kwClause);
  }

  const countries = (targeting.countries ?? []).filter(Boolean);
  if (countries.length > 0) clauses.push(inArray(connections.locationCountry, countries));

  const tags = (targeting.tags ?? []).filter(Boolean);
  if (tags.length > 0) clauses.push(arrayOverlaps(connections.tags, tags));

  // Per-campaign dedup: only when the campaign wants unique contacts.
  if (opts.excludeCampaignId && opts.dedupe !== false) {
    clauses.push(
      notExists(
        db
          .select({ x: sql`1` })
          .from(enrollments)
          .where(
            and(
              eq(enrollments.campaignId, opts.excludeCampaignId),
              eq(enrollments.connectionId, connections.id),
            ),
          ),
      ),
    );
  }

  const where = and(...clauses);
  const [[{ total }], rows] = await Promise.all([
    db.select({ total: count() }).from(connections).where(where),
    db
      .select({ id: connections.id })
      .from(connections)
      .where(where)
      // Enriched connections first — they matched on real data and are ready to send.
      .orderBy(sql`${connections.enrichedAt} desc nulls last`)
      .limit(opts.idLimit ?? 1000),
  ]);

  return { count: Number(total), ids: rows.map((r) => r.id) };
}

/** Distinct country codes present, for the filter dropdown. */
export async function getConnectionCountries(accessibleIds: string[] | null = null): Promise<string[]> {
  const scope = accountScope(connections.accountId, accessibleIds);
  const where = scope
    ? and(sql`${connections.locationCountry} is not null`, scope)
    : sql`${connections.locationCountry} is not null`;
  const rows = await db
    .selectDistinct({ country: connections.locationCountry })
    .from(connections)
    .where(where);
  return rows.map((r) => r.country!).filter(Boolean).sort();
}
