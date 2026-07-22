import "server-only";
import { Client } from "@upstash/qstash";
import { env } from "@/lib/env";
import { getSettings } from "@/lib/settings";

export type JobName = "sync" | "enrich" | "send" | "poll-acceptance" | "auto-enroll";

/**
 * Enqueue a background job via QStash, which POSTs to our signed job endpoint.
 * The QStash token comes from Settings (or env fallback). If it's unset, this
 * is a no-op that logs — so the app still runs before background jobs are wired.
 */
export async function enqueueJob(
  job: JobName,
  body: Record<string, unknown> = {},
  opts: { delaySeconds?: number } = {},
): Promise<void> {
  const { qstashToken } = await getSettings();
  const url = `${env.APP_URL}/api/jobs/${job}`;

  if (!qstashToken) {
    console.warn(`[qstash] token unset — skipping enqueue of ${job}`, body);
    return;
  }

  const client = new Client({ token: qstashToken });
  await client.publishJSON({ url, body, delay: opts.delaySeconds, retries: 3 });
}

export interface ScheduleInfo {
  id: string;
  cron: string;
  destination: string;
}

/** The recurring schedules the app needs (QStash replaces Vercel crons). */
function wantedSchedules(base: string) {
  return [
    { path: "send", cron: "*/15 * * * *" }, // process due follow-ups every 15 min
    { path: "auto-enroll", cron: "*/30 * * * *" }, // top up active campaigns every 30 min
    { path: "poll-acceptance", cron: "0 9,13,17 * * *" }, // backup accept detection
  ].map((w) => ({ ...w, destination: `${base}/api/jobs/${w.path}` }));
}

export async function listSchedules(): Promise<ScheduleInfo[]> {
  const { qstashToken } = await getSettings();
  if (!qstashToken) return [];
  const client = new Client({ token: qstashToken });
  const items = await client.schedules.list();
  return items.map((s) => ({ id: s.scheduleId, cron: s.cron, destination: s.destination }));
}

/**
 * Create (or refresh) the recurring QStash schedules that drive background work.
 * Idempotent: existing schedules pointing at our job endpoints are removed first.
 */
export async function ensureSchedules(): Promise<{ created: string[] }> {
  const { qstashToken } = await getSettings();
  if (!qstashToken) throw new Error("Add your QStash token in Settings first.");
  const base = env.APP_URL;
  if (!base.startsWith("https://")) {
    throw new Error("APP_URL must be your public https domain to create schedules.");
  }

  const client = new Client({ token: qstashToken });
  const wanted = wantedSchedules(base);

  const existing = await client.schedules.list();
  for (const s of existing) {
    if (wanted.some((w) => s.destination === w.destination)) {
      await client.schedules.delete(s.scheduleId);
    }
  }

  const created: string[] = [];
  for (const w of wanted) {
    await client.schedules.create({
      destination: w.destination,
      cron: w.cron,
      body: JSON.stringify({}),
      headers: { "content-type": "application/json" },
    });
    created.push(`${w.path} → ${w.cron}`);
  }
  return { created };
}
