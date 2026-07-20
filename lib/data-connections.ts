import "server-only";
import { and, or, count, desc, eq, ilike, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { connections, type Connection } from "@/db/schema";

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

export async function getConnections(f: ConnectionFilters): Promise<ConnectionsResult> {
  const page = Math.max(1, f.page ?? 1);
  const pageSize = Math.min(200, Math.max(10, f.pageSize ?? 50));
  const where = buildWhere(f);

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

/** Distinct country codes present, for the filter dropdown. */
export async function getConnectionCountries(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ country: connections.locationCountry })
    .from(connections)
    .where(sql`${connections.locationCountry} is not null`);
  return rows.map((r) => r.country!).filter(Boolean).sort();
}
