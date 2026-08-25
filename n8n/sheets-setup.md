# Google Sheets datastore — setup

Using Google Sheets instead of Postgres. Same logic, different store. Because
Sheets has no SQL, the pattern is: **Get rows → filter & decide in a Code node →
write the row back**. Fine for hundreds–low thousands of leads.

---

## 1. Create the spreadsheet

Make one spreadsheet, e.g. **"LinkedIn Campaign Engine"**, with **3 tabs**. Row 1
of each tab is the header row — the column names must match **exactly** (n8n maps
by header name).

### Tab `Config` — one settings row (row 2)
| account_id | title_keywords | countries | tags | invites_per_day | messages_per_day | cooldown_min_sec | cooldown_max_sec | voice | sequence | next_send_at |
|---|---|---|---|---|---|---|---|---|---|---|

- `title_keywords`, `countries`, `tags`, `sequence` are **JSON text** in the cell.
- Example row 2:
  - `account_id` → `YOUR_UNIPILE_ACCOUNT_ID`
  - `title_keywords` → `["VP Marketing","Demand Gen","Head of Growth"]`
  - `countries` → `["US","GB","CA"]`
  - `tags` → `[]`
  - `invites_per_day` → `25`  · `messages_per_day` → `40`
  - `cooldown_min_sec` → `120` · `cooldown_max_sec` → `600`
  - `voice` → `Senior B2B leader, first person, concise, no emojis, one question, never pitch early.`
  - `sequence` →
    ```json
    [{"type":"invite","mode":"ai","delay_hours":0,"prompt":"Invite note <300 chars, one genuine reason to connect. No pitch."},
     {"type":"message","mode":"ai","delay_hours":24,"prompt":"Warm thank-you + one relevant observation. No pitch/ask/link."},
     {"type":"message","mode":"ai","delay_hours":72,"prompt":"One sharp insight + a single open question."},
     {"type":"message","mode":"template","delay_hours":96,"text":"Hi {{first_name}}, sharing this in case it helps: https://yoursite.com/blog/x"}]
    ```
  - `next_send_at` → leave blank

### Tab `Leads` — one row per person (WF1 fills this)
| account_id | provider_id | public_id | full_name | headline | company | title | country_code | state | step | chat_id | next_run_at | enriched | last_error | updated_at |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

- `state` starts `queued`, `step` starts `0`. Dates (`next_run_at`, `updated_at`) are ISO strings.

### Tab `Counters` — daily send tally
| key | account_id | day | invites | messages |
|---|---|---|---|---|

- `key` = `account_id + "_" + YYYY-MM-DD` (so we can match/update one row per account per day).

---

## 2. Connect Google in n8n

1. n8n → **Credentials → New → Google Sheets** (OAuth2 is easiest for a personal
   Google account; a **Service Account** is better for unattended servers).
2. **OAuth2:** click *Sign in with Google*, allow the Sheets + Drive scopes.
   **Service Account:** create one in Google Cloud, download the JSON key, paste it
   into the credential, then **share the spreadsheet with the service account's
   email** (`...@...iam.gserviceaccount.com`) as **Editor** — this is the #1 gotcha.
3. Grab the **spreadsheet ID** from its URL:
   `https://docs.google.com/spreadsheets/d/`**`THIS_LONG_ID`**`/edit` — you'll paste
   it into each Google Sheets node (Document = *By ID*).

---

## 3. How each Google Sheets node is configured

All nodes: **Resource** = *Sheet Within Document*, **Document** = *By ID* (your ID),
**Sheet** = *By name* (`Config` / `Leads` / `Counters`).

| Node | Operation | Notes |
|---|---|---|
| Get config | **Get Row(s)** | returns the single Config row (incl. its `row_number`). |
| Get leads | **Get Row(s)** | returns all Leads rows (each carries `row_number`). |
| Get counters | **Get Row(s)** | returns all Counters rows. |
| Update lead | **Update Row** | *Column to match on* = `row_number`; set `state`, `step`, `next_run_at`, `updated_at`. |
| Bump counter | **Append or Update Row** | *Column to match on* = `key`; set `invites`, `messages`, `account_id`, `day`. |
| Update cooldown | **Update Row** | *Column to match on* = `row_number` (Config); set `next_send_at`. |

> **row_number** is a virtual column n8n adds to every row it reads — it's how you
> update the exact row you fetched. Use "Map Automatically" and feed the Code
> node's output (its keys already match the headers).

---

## 4. The decision Code node (the brain)

After the three "Get Row(s)" nodes, one Code node does all the filtering, cap
check, and computes every value the write nodes need. Paste this into a **Code**
node named **"Pick + resolve"**:

```js
const cfgRow = $('Get config').first().json;
const j = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
const cfg = {
  account_id: cfgRow.account_id,
  countries: j(cfgRow.countries, []),
  title_keywords: j(cfgRow.title_keywords, []),
  sequence: j(cfgRow.sequence, []),
  invites_per_day: Number(cfgRow.invites_per_day || 0),
  messages_per_day: Number(cfgRow.messages_per_day || 0),
  cd_min: Number(cfgRow.cooldown_min_sec || 120),
  cd_max: Number(cfgRow.cooldown_max_sec || 600),
  voice: cfgRow.voice || '',
};
const now = Date.now();

// account-wide cooldown (one send per random gap)
if (cfgRow.next_send_at && Date.parse(cfgRow.next_send_at) > now)
  return [{ json: { done: true, reason: 'cooldown' } }];

// pick the oldest due lead
const leads = $('Get leads').all().map(i => i.json);
const due = leads
  .filter(l => ['queued','accepted','in_followup'].includes(l.state)
    && (!l.next_run_at || Date.parse(l.next_run_at) <= now))
  .sort((a,b) => (Date.parse(a.next_run_at || 0)) - (Date.parse(b.next_run_at || 0)));
const lead = due[0];
if (!lead) return [{ json: { done: true, reason: 'nothing due' } }];

const stepIdx = Number(lead.step || 0);
const step = cfg.sequence[stepIdx];
if (!step) return [{ json: { done: true, complete: true, lead } }];

const isInvite = step.type === 'invite';

// daily cap
const today = new Date().toISOString().slice(0, 10);
const key = `${cfg.account_id}_${today}`;
const cRow = $('Get counters').all().map(i => i.json).find(c => c.key === key)
  || { invites: 0, messages: 0 };
const used = isInvite ? Number(cRow.invites || 0) : Number(cRow.messages || 0);
const cap = isInvite ? cfg.invites_per_day : cfg.messages_per_day;
if (used >= cap) return [{ json: { done: true, reason: 'cap reached' } }];

const next = cfg.sequence[stepIdx + 1];
const cooldownSec = Math.floor(cfg.cd_min + Math.random() * (cfg.cd_max - cfg.cd_min));

return [{ json: {
  done: false,
  // send params
  isInvite,
  mode: step.mode,
  promptOrText: step.mode === 'ai' ? step.prompt : step.text,
  voice: cfg.voice,
  account_id: cfg.account_id,
  lead,
  // lead write (match on row_number)
  lead_row_number: lead.row_number,
  new_step: stepIdx + 1,
  new_state: isInvite ? 'awaiting_accept' : (next ? 'in_followup' : 'completed'),
  new_next_run_at: isInvite ? '' : (next ? new Date(now + next.delay_hours * 3600000).toISOString() : ''),
  new_updated_at: new Date(now).toISOString(),
  // counter write (match on key)
  counter_key: key,
  counter_day: today,
  new_invites: Number(cRow.invites || 0) + (isInvite ? 1 : 0),
  new_messages: Number(cRow.messages || 0) + (isInvite ? 0 : 1),
  // config cooldown write (match on row_number)
  config_row_number: cfgRow.row_number,
  new_next_send_at: new Date(now + cooldownSec * 1000).toISOString(),
} }];
```

Everything downstream just reads these fields:
- **Anthropic / template** → `mode`, `promptOrText`, `voice`, `lead`.
- **Unipile send** → `isInvite`, `lead.provider_id`, `lead.chat_id`, `text`.
- **Update lead** → `row_number = {{$json.lead_row_number}}`, plus `state/step/next_run_at/updated_at`.
- **Bump counter** → match `key = {{$json.counter_key}}`, plus `invites/messages/account_id/day`.
- **Update cooldown** → `row_number = {{$json.config_row_number}}`, `next_send_at`.

Right before each write node, add a tiny **Set** (or Code) that outputs an object
whose keys are exactly that tab's headers, then use the Sheets node's
**"Map Automatically"** — it matches by header name.

---

## 5. WF1 (enroll) with Sheets
Same as the Postgres version, but the final step is **Google Sheets → Append Row**
into `Leads` (map: account_id, provider_id, public_id, full_name, headline, company,
title, country_code, state=`queued`, step=`0`, enriched=`true`). To avoid dupes,
use **Append or Update Row** matching on `provider_id`.

## 6. WF3 (reply webhook) with Sheets
Webhook → Code "is inbound & human?" → **Google Sheets → Update Row** on `Leads`
matching the person (by `provider_id` or `chat_id`): set `state=replied`,
`next_run_at=""`. (Update Row matches one column; if you match on `provider_id`,
add that as the matching column.)

---

## Notes / gotchas
- **Share the sheet with the service account email** (Editor) if you use a service account.
- Sheets writes aren't atomic — fine here because the sender does **one** send per
  15-min tick, sequentially. Don't run two send workflows against the same sheet.
- Dates are plain ISO strings; all comparisons happen in the Code node.
- Google Sheets API quotas are generous for a 15-min cron; no concern at this scale.
- If you later outgrow Sheets (10k+ leads, faster cadence), switch back to the
  Postgres version in `schema.sql` + `send-engine.json` — the Code logic is identical.
