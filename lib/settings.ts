import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { encryptSecret, decryptSecret } from "./crypto";

const SINGLETON = "singleton";

export interface ResolvedSettings {
  unipileDsn: string;
  unipileApiKey: string;
  unipileWebhookSecret: string;
  anthropicApiKey: string;
  qstashToken: string;
  qstashCurrentSigningKey: string;
  qstashNextSigningKey: string;
}

/** Which secrets are configured (for the UI — never exposes values). */
export interface SettingsStatus {
  unipileDsn: string; // DSN is not secret; show it
  unipileApiKey: boolean;
  unipileWebhookSecret: boolean;
  anthropicApiKey: boolean;
  qstashToken: boolean;
  qstashSigningKeys: boolean;
}

let cache: { data: ResolvedSettings; ts: number } | null = null;
const TTL_MS = 15_000;

function safeDecrypt(v: string | null | undefined): string {
  if (!v) return "";
  try {
    return decryptSecret(v);
  } catch {
    return "";
  }
}

async function loadRow() {
  try {
    const rows = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.id, SINGLETON))
      .limit(1);
    return rows[0];
  } catch {
    return undefined;
  }
}

/** Resolved config: DB value wins, falling back to environment variables. */
export async function getSettings(force = false): Promise<ResolvedSettings> {
  if (!force && cache && Date.now() - cache.ts < TTL_MS) return cache.data;
  const row = await loadRow();
  const data: ResolvedSettings = {
    unipileDsn: row?.unipileDsn || process.env.UNIPILE_DSN || "",
    unipileApiKey: safeDecrypt(row?.unipileApiKey) || process.env.UNIPILE_API_KEY || "",
    unipileWebhookSecret:
      row?.unipileWebhookSecret || process.env.UNIPILE_WEBHOOK_SECRET || "",
    anthropicApiKey: safeDecrypt(row?.anthropicApiKey) || process.env.ANTHROPIC_API_KEY || "",
    qstashToken: safeDecrypt(row?.qstashToken) || process.env.QSTASH_TOKEN || "",
    qstashCurrentSigningKey:
      row?.qstashCurrentSigningKey || process.env.QSTASH_CURRENT_SIGNING_KEY || "",
    qstashNextSigningKey:
      row?.qstashNextSigningKey || process.env.QSTASH_NEXT_SIGNING_KEY || "",
  };
  cache = { data, ts: Date.now() };
  return data;
}

export async function getSettingsStatus(): Promise<SettingsStatus> {
  const s = await getSettings(true);
  return {
    unipileDsn: s.unipileDsn,
    unipileApiKey: !!s.unipileApiKey,
    unipileWebhookSecret: !!s.unipileWebhookSecret,
    anthropicApiKey: !!s.anthropicApiKey,
    qstashToken: !!s.qstashToken,
    qstashSigningKeys: !!(s.qstashCurrentSigningKey && s.qstashNextSigningKey),
  };
}

export interface SettingsInput {
  unipileDsn?: string;
  unipileApiKey?: string;
  unipileWebhookSecret?: string;
  anthropicApiKey?: string;
  qstashToken?: string;
  qstashCurrentSigningKey?: string;
  qstashNextSigningKey?: string;
}

/**
 * Persist settings. Blank/undefined fields are left unchanged so the UI can
 * show masked secrets and only update the ones the user retypes. Secret fields
 * are encrypted before storage.
 */
export async function saveSettings(input: SettingsInput): Promise<void> {
  const existing = await loadRow();

  const set: Record<string, string> = {};
  const plain = (v: string | undefined, current: string | null | undefined) => {
    if (v !== undefined && v !== "") return v;
    return current ?? undefined;
  };
  const secret = (v: string | undefined, current: string | null | undefined) => {
    if (v !== undefined && v !== "") return encryptSecret(v);
    return current ?? undefined;
  };

  const dsn = plain(input.unipileDsn, existing?.unipileDsn);
  const uKey = secret(input.unipileApiKey, existing?.unipileApiKey);
  const wSec = plain(input.unipileWebhookSecret, existing?.unipileWebhookSecret);
  const aKey = secret(input.anthropicApiKey, existing?.anthropicApiKey);
  const qTok = secret(input.qstashToken, existing?.qstashToken);
  const qCur = plain(input.qstashCurrentSigningKey, existing?.qstashCurrentSigningKey);
  const qNext = plain(input.qstashNextSigningKey, existing?.qstashNextSigningKey);

  if (dsn !== undefined) set.unipileDsn = dsn;
  if (uKey !== undefined) set.unipileApiKey = uKey;
  if (wSec !== undefined) set.unipileWebhookSecret = wSec;
  if (aKey !== undefined) set.anthropicApiKey = aKey;
  if (qTok !== undefined) set.qstashToken = qTok;
  if (qCur !== undefined) set.qstashCurrentSigningKey = qCur;
  if (qNext !== undefined) set.qstashNextSigningKey = qNext;

  await db
    .insert(appSettings)
    .values({ id: SINGLETON, ...set, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.id, set: { ...set, updatedAt: new Date() } });

  cache = null; // invalidate
}
