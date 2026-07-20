import "server-only";

/**
 * Bootstrap environment variables. Only the database URL is truly required at
 * deploy time (the app needs a database before it can read UI-configured
 * settings). AUTH_SECRET is read directly by Auth.js. All integration secrets
 * (Unipile, Anthropic, QStash) are configured in the app Settings UI and read
 * via `lib/settings.ts` — they may optionally be provided as env fallbacks.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const env = {
  get DATABASE_URL() {
    return required("DATABASE_URL");
  },

  /** Public base URL of this deployment, for job/webhook callback URLs. */
  get APP_URL() {
    return (
      process.env.APP_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
    );
  },
} as const;

export const DEFAULT_AI_MODEL = "claude-sonnet-5";
export const HIGH_QUALITY_AI_MODEL = "claude-opus-4-8";
