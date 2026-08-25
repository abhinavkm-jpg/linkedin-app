-- n8n LinkedIn Campaign Engine — Postgres schema
-- Run this once in your Neon SQL Editor (or via psql / an n8n Postgres node).

create table if not exists campaign_config (
  id int primary key default 1,
  account_id text not null,
  title_keywords text[] not null default '{}',
  countries text[] not null default '{}',
  tags text[] not null default '{}',
  invites_per_day int not null default 25,
  messages_per_day int not null default 40,
  cooldown_min_sec int not null default 120,
  cooldown_max_sec int not null default 600,
  voice text,
  sequence jsonb not null default '[]',
  next_send_at timestamptz            -- account-wide send cooldown
);

create table if not exists leads (
  id bigserial primary key,
  account_id text not null,
  provider_id text,                   -- Unipile provider id (for invite/DM)
  public_id text,
  full_name text,
  headline text,
  company text,
  title text,
  country_code text,
  state text not null default 'queued',  -- queued|awaiting_accept|accepted|in_followup|messaged|replied|completed|failed|skipped
  step int not null default 0,
  chat_id text,
  next_run_at timestamptz,
  enriched boolean not null default false,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, provider_id)
);

create table if not exists counters (
  account_id text not null,
  day date not null,
  invites int not null default 0,
  messages int not null default 0,
  primary key (account_id, day)
);

-- Helpful index for the send-engine "pick due lead" query:
create index if not exists leads_due_idx on leads (state, next_run_at);

-- Optional: seed one config row so WF2 has something to read before WF1 runs.
-- insert into campaign_config (id, account_id) values (1, 'YOUR_UNIPILE_ACCOUNT_ID')
--   on conflict (id) do nothing;
