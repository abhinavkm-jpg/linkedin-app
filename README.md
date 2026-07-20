# LinkedIn Outreach App

Multi-account LinkedIn outreach built on Next.js + Unipile. Sync your network,
run invite → accept → follow-up sequences (or DM existing connections), track
replies, and stay within LinkedIn's limits — all in one dashboard.

## Stack

- **Next.js 16** (App Router, TypeScript) on **Vercel**
- **Tailwind v4 + shadcn/ui** (Base UI primitives)
- **Neon** serverless Postgres + **Drizzle ORM**
- **Auth.js (NextAuth v5)** — Google OAuth, team logins
- **Upstash QStash** — chunked background jobs (sync / enrich / send / poll)
- **Anthropic Claude** — AI-generated outreach (default `claude-sonnet-5`)
- **Unipile** — LinkedIn data + messaging

## How it works

- **Accounts** connect via Unipile Hosted Auth. Each connected LinkedIn account
  has its own `account_id` under one workspace DSN.
- **Sync** pulls the full network via `GET /users/relations` (cursor-paged,
  1000/page), chunked across QStash invocations so 20k+ connections load safely.
- **Enrichment** (`GET /users/{id}`, `notify=false`) is lazy and capped (~100/day)
  since LinkedIn rate-limits profile views.
- **Sequences**: LinkedIn forbids cold DMs, so non-connections go invite (≤300
  chars) → acceptance (webhook / poller) → welcome → timed follow-ups. Existing
  connections can be messaged directly.
- **Rate limits**: there is no quota API, so the app keeps per-account daily
  counters (invites/messages/InMail/enrichments) and backs off on 429 / 422.
- **Replies** arrive via the `message_received` webhook, which pauses that
  connection's sequence and surfaces the thread in the Inbox.

## Configuration model

Only **two** values are set at deploy time (the app needs a database before it
can store anything you type in the UI):

- `DATABASE_URL` — your Neon Postgres connection string
- `AUTH_SECRET` — session + settings-encryption secret (`npx auth secret`)

Everything else — **Unipile DSN + API key, Anthropic key, QStash token, webhook
secret, rate limits** — is entered on the in-app **Settings** page and stored
encrypted in your database. Login is **email + password**; the first person to
sign up becomes the admin and adds teammates from Settings.

## Local setup

1. `npm install`
2. Copy `.env.example` to `.env.local`, set `DATABASE_URL` and `AUTH_SECRET`.
3. `npm run db:push` to create tables, then `npm run db:seed` for the default AI prompt.
4. `npm run dev` → http://localhost:3000 → create the admin account.
5. Open **Settings** and paste your Unipile / Anthropic / QStash keys.

> Background jobs run via QStash posting back to your public URL. Locally, either
> expose your dev server with a tunnel and set `APP_URL`, or trigger
> `/api/jobs/*` manually (signature check is skipped until signing keys are set).

## Deploy (Vercel)

1. Push this folder to a GitHub repo, then **Import** it in Vercel.
2. In Vercel → Project → **Settings → Environment Variables**, add:
   - `DATABASE_URL` (from Neon)
   - `AUTH_SECRET` (run `npx auth secret`)
   - `APP_URL` = your production domain (e.g. `https://your-app.vercel.app`)
   - `CRON_SECRET` = any random string
3. Deploy. Then create tables against the production DB:
   `DATABASE_URL="<prod url>" npm run db:migrate && DATABASE_URL="<prod url>" npm run db:seed`
   (or `db:push`).
4. Open the site, create your admin account, go to **Settings**, and paste your
   Unipile DSN + API key, Anthropic key, QStash token (+ signing keys), and a
   webhook secret. Click **Test Unipile**.
5. In **Unipile**, add a webhook pointing to
   `https://<domain>/api/webhooks/unipile?secret=<the webhook secret you set>`
   (subscribe to account, messaging, and users sources).
6. `vercel.json` already registers the crons (15-min send tick, 3×/day accept poll).

### Where to get each key

- **Neon** (database): https://neon.tech → new project → copy the pooled connection string.
- **Unipile** (LinkedIn): https://www.unipile.com → dashboard → your **DSN** (base URL incl. port) and **API key**. Connect the LinkedIn account itself later, in-app, via the Accounts page.
- **Anthropic** (Claude): https://console.anthropic.com → API keys.
- **Upstash QStash** (jobs): https://console.upstash.com/qstash → copy the **token** and the **current/next signing keys**.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:generate` | Generate SQL migrations from the schema |
| `npm run db:push` | Push schema directly to the database |
| `npm run db:migrate` | Apply generated migrations |
| `npm run db:seed` | Seed the default AI prompt |

## Reference

The original Make.com scenario this replaces is described in the project plan.
Unipile API docs: https://developer.unipile.com/reference/
