/**
 * Verify a Vercel Cron request. Vercel sends `Authorization: Bearer <CRON_SECRET>`.
 * If CRON_SECRET is unset (local dev), allow so endpoints can be triggered manually.
 */
export function verifyCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}
