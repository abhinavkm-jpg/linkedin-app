import "server-only";
import { Receiver } from "@upstash/qstash";
import { getSettings } from "@/lib/settings";

/**
 * Verify an inbound QStash job request. In production, QStash signs each call
 * with the Upstash-Signature header, verified against the signing keys. When
 * signing keys aren't configured (early setup / manual trigger), verification
 * is skipped so jobs can still run.
 */
export async function verifyJobRequest(req: Request, rawBody: string): Promise<boolean> {
  const { qstashCurrentSigningKey: current, qstashNextSigningKey: next } = await getSettings();
  if (!current || !next) {
    // Unconfigured: allow. Optionally gate with a shared secret.
    return true;
  }
  const signature = req.headers.get("upstash-signature");
  if (!signature) return false;

  const receiver = new Receiver({
    currentSigningKey: current,
    nextSigningKey: next,
  });
  try {
    return await receiver.verify({ signature, body: rawBody });
  } catch {
    return false;
  }
}

/** Parse a job request body after verifying its signature. */
export async function readJob<T = Record<string, unknown>>(
  req: Request,
): Promise<{ ok: true; body: T } | { ok: false; status: number }> {
  const raw = await req.text();
  const valid = await verifyJobRequest(req, raw);
  if (!valid) return { ok: false, status: 401 };
  try {
    return { ok: true, body: (raw ? JSON.parse(raw) : {}) as T };
  } catch {
    return { ok: false, status: 400 };
  }
}
