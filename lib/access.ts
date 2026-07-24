import "server-only";
import { eq, or, isNull, inArray, sql, type SQL, type Column } from "drizzle-orm";
import { db } from "@/db";
import { linkedinAccounts, users } from "@/db/schema";

export type Role = "admin" | "member";
export interface AccessUser {
  id: string;
  role?: Role;
}

export function isAdmin(user?: { role?: Role } | null): boolean {
  return user?.role === "admin";
}

export function assertAdmin(user?: { role?: Role } | null): void {
  if (!isAdmin(user)) throw new Error("Admins only");
}

/**
 * Account ids the user may access. Admin → `null` (unrestricted). Member →
 * array of owned account ids (possibly empty).
 */
export async function getAccessibleAccountIds(user: AccessUser): Promise<string[] | null> {
  if (isAdmin(user)) return null;
  const rows = await db
    .select({ id: linkedinAccounts.id })
    .from(linkedinAccounts)
    .where(eq(linkedinAccounts.ownerUserId, user.id));
  return rows.map((r) => r.id);
}

/**
 * A WHERE clause scoping `column` to accessible accounts. `null` ids → no
 * filter (admin); empty array → matches nothing.
 */
export function accountScope(column: Column, ids: string[] | null): SQL | undefined {
  if (ids === null) return undefined;
  if (ids.length === 0) return sql`false`;
  return inArray(column, ids);
}

/**
 * Owner-based visibility for shared resources (templates, AI prompts):
 * - Admins see everything (→ `undefined`, no filter).
 * - Members see items they own, items with no owner (legacy/seeded = shared),
 *   and any item owned by an admin (admins' items are shared to everyone).
 */
export async function ownerVisibilityScope(
  ownerColumn: Column,
  user: AccessUser,
): Promise<SQL | undefined> {
  if (isAdmin(user)) return undefined;
  const admins = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
  const adminIds = admins.map((a) => a.id);
  const clauses: SQL[] = [isNull(ownerColumn), eq(ownerColumn, user.id)];
  if (adminIds.length > 0) clauses.push(inArray(ownerColumn, adminIds));
  return or(...clauses);
}
