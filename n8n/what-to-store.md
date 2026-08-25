# What you need to store to run the engine

Three buckets: **secrets** (in n8n Credentials — never in the sheet), **campaign
settings** (Config tab), and **per-lead data** (Leads/Counters tabs, mostly filled
by the workflows).

## 1. Secrets & connections — store in n8n Credentials
| What | Where you store it | Where you get it |
|---|---|---|
| **Unipile DSN** (base URL, e.g. `https://apiXXX.unipile.com:XXXX`) | in the Unipile HTTP nodes' URL (or an n8n variable) | Unipile dashboard → your instance |
| **Unipile API key** (`X-API-KEY`) | n8n → **HTTP Header Auth** credential | Unipile dashboard → Access / API keys |
| **Google Sheets access** | n8n → **Google Sheets** credential (OAuth2 login, or Service Account JSON) | Google (sign in) / Google Cloud service account |
| **Spreadsheet ID** | pasted into each Google Sheets node | the sheet URL between `/d/` and `/edit` |
| **Anthropic API key** | the `x-api-key` header on the Anthropic node (or a credential) | console.anthropic.com — only needed for `mode:"ai"` steps |
| **Unipile webhook secret** *(optional)* | WF3 webhook check | Unipile webhook settings |

## 2. Campaign settings — store in the `Config` tab (one row)
| Field | Meaning |
|---|---|
| `account_id` | **The connected LinkedIn account's Unipile id** — the single most important value. |
| `title_keywords` | ICP job-title keywords (JSON array). |
| `countries` | ICP countries as ISO-2 codes (JSON array, e.g. `["US","GB"]`). |
| `tags` | optional extra filter (JSON array). |
| `invites_per_day` / `messages_per_day` | daily caps. |
| `cooldown_min_sec` / `cooldown_max_sec` | random gap between sends. |
| `voice` | the writing identity/rules for AI messages. |
| `sequence` | the steps (JSON): each `{type: invite|message, mode: ai|template, delay_hours, prompt/text}`. |
| `next_send_at` | **managed by the workflow** — leave blank. |

## 3. Per-lead data — `Leads` tab (WF1 writes it, WF2 updates it)
| Field | Set by | Meaning |
|---|---|---|
| `account_id` | WF1 | which LinkedIn account owns this lead |
| `provider_id` | WF1 (enrichment) | **required to send** — the Unipile id used for invite/DM |
| `public_id` | WF1 | LinkedIn handle (`/in/<public_id>`) |
| `full_name`, `headline`, `company`, `title`, `country_code` | WF1 | profile facts (for personalization + ICP match) |
| `state` | WF1/WF2 | `queued → awaiting_accept → accepted → in_followup → completed` / `replied` / `failed` |
| `step` | WF2 | index into the sequence (starts `0`) |
| `chat_id` | WF2 | the DM thread id once one exists |
| `next_run_at` | WF2 | when the next touch is due (ISO string) |
| `enriched` | WF1 | whether the profile was fetched |
| `last_error`, `updated_at` | WF2 | diagnostics |

## 4. Counters — `Counters` tab (auto, don't touch)
`key` (`account_id_YYYY-MM-DD`), `account_id`, `day`, `invites`, `messages`.

---

## Bare minimum to send your first message
1. A **LinkedIn account connected inside Unipile** → gives you the `account_id`.
2. **Unipile DSN + API key** in n8n.
3. **Google Sheets connected** in n8n + the spreadsheet ID.
4. A **Config row** with `account_id` and a `sequence`.
5. At least **one Leads row** with `provider_id` + `state=queued` (+ `full_name`).
6. *(If any step is `mode:"ai"`)* an **Anthropic key**.

## How the key Unipile values are obtained
- **`account_id`**: connect the LinkedIn account in Unipile once (hosted auth link or dashboard). Unipile returns an account id — that's what everything keys off.
- **`provider_id`** (per lead): comes from enrichment — WF1 calls `GET /users/{public_id}` and reads `provider_id` from the response. You don't type these by hand; WF1 fills them.
- **DSN + API key**: from your Unipile dashboard.
