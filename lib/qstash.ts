import "server-only";
import { Client } from "@upstash/qstash";
import { env } from "@/lib/env";
import { getSettings } from "@/lib/settings";

export type JobName = "sync" | "enrich" | "send" | "poll-acceptance";

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
