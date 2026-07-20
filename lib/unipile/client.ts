import "server-only";
import { getSettings } from "@/lib/settings";
import type {
  HostedAuthLinkResponse,
  InvitationResponse,
  LinkedinApiTier,
  UnipileAccount,
  UnipileChat,
  UnipileErrorBody,
  UnipileList,
  UnipileMessage,
  UnipileProfile,
  UserRelation,
} from "./types";

/**
 * Error thrown for non-2xx Unipile responses. Carries the HTTP status and the
 * parsed body so callers can branch on rate-limit / invite conditions.
 */
export class UnipileError extends Error {
  status: number;
  body: UnipileErrorBody | string | null;

  constructor(status: number, body: UnipileErrorBody | string | null, message?: string) {
    super(message ?? `Unipile request failed with status ${status}`);
    this.name = "UnipileError";
    this.status = status;
    this.body = body;
  }

  /** LinkedIn rate limit hit — back off and requeue. */
  get isRateLimited(): boolean {
    return this.status === 429 || this.status === 500 || this.status === 503;
  }

  /**
   * Invitation cannot be (re)sent yet: already invited/connected, or a recent
   * invite is still pending. Skip rather than retry.
   */
  get isCannotResendYet(): boolean {
    if (this.status !== 422) return false;
    const body = typeof this.body === "string" ? this.body : JSON.stringify(this.body ?? "");
    return /cannot_resend_yet|already|pending/i.test(body);
  }

  /** Account disconnected / needs reconnection. */
  get isAccountDisconnected(): boolean {
    return this.status === 401;
  }
}

type QueryValue = string | number | boolean | undefined | null | string[];

function buildQuery(params: Record<string, QueryValue>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const v of value) sp.append(key, String(v));
    } else {
      sp.append(key, String(value));
    }
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

async function request<T>(
  path: string,
  init: RequestInit & { query?: Record<string, QueryValue> } = {},
): Promise<T> {
  const { query, ...rest } = init;
  const settings = await getSettings();
  if (!settings.unipileDsn || !settings.unipileApiKey) {
    throw new UnipileError(0, null, "Unipile is not configured. Add your DSN and API key in Settings.");
  }
  const url = `${settings.unipileDsn}/api/v1${path}${query ? buildQuery(query) : ""}`;

  const res = await fetch(url, {
    ...rest,
    headers: {
      "X-API-KEY": settings.unipileApiKey,
      accept: "application/json",
      ...(rest.headers ?? {}),
    },
    // These are outbound API calls; never cache.
    cache: "no-store",
  });

  const raw = await res.text();
  let parsed: unknown = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = raw;
    }
  }

  if (!res.ok) {
    throw new UnipileError(res.status, parsed as UnipileErrorBody | string | null);
  }
  return parsed as T;
}

/* -------------------------------------------------------------------------- */
/* Accounts                                                                    */
/* -------------------------------------------------------------------------- */

export function listAccounts(params: { cursor?: string; limit?: number } = {}) {
  return request<UnipileList<UnipileAccount>>("/accounts", { query: params });
}

export function getAccount(accountId: string) {
  return request<UnipileAccount>(`/accounts/${accountId}`);
}

/**
 * Generate a Unipile-hosted authentication link so the user connects their
 * LinkedIn account without us ever touching credentials. On success Unipile
 * fires a CREATION_SUCCESS webhook containing the new account_id.
 */
export async function createHostedAuthLink(params: {
  providers?: string[];
  expiresOn: string; // ISO 8601
  successRedirectUrl?: string;
  failureRedirectUrl?: string;
  name?: string; // opaque identifier echoed back on the webhook
}) {
  const settings = await getSettings();
  return request<HostedAuthLinkResponse>("/hosted/accounts/link", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "create",
      providers: params.providers ?? ["LINKEDIN"],
      api_url: settings.unipileDsn,
      expiresOn: params.expiresOn,
      success_redirect_url: params.successRedirectUrl,
      failure_redirect_url: params.failureRedirectUrl,
      name: params.name,
    }),
  });
}

/* -------------------------------------------------------------------------- */
/* Relations (connections)                                                     */
/* -------------------------------------------------------------------------- */

export function listRelations(params: {
  accountId: string;
  cursor?: string;
  limit?: number; // 1..1000
}) {
  return request<UnipileList<UserRelation>>("/users/relations", {
    query: {
      account_id: params.accountId,
      cursor: params.cursor,
      limit: params.limit ?? 1000,
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Profiles                                                                    */
/* -------------------------------------------------------------------------- */

export function getProfile(
  identifier: string,
  params: {
    accountId: string;
    sections?: string[]; // linkedin_sections, e.g. ["experience","about"]
    notify?: boolean; // default false → stealth (no profile-view notification)
    linkedinApi?: LinkedinApiTier;
  },
) {
  return request<UnipileProfile>(`/users/${encodeURIComponent(identifier)}`, {
    query: {
      account_id: params.accountId,
      linkedin_sections: params.sections,
      notify: params.notify ?? false,
      linkedin_api: params.linkedinApi,
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Invitations                                                                 */
/* -------------------------------------------------------------------------- */

export function sendInvitation(params: {
  accountId: string;
  providerId: string;
  message?: string; // note, <= 300 chars
  userEmail?: string;
}) {
  return request<InvitationResponse>("/users/invite", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      account_id: params.accountId,
      provider_id: params.providerId,
      message: params.message,
      user_email: params.userEmail,
    }),
  });
}

/* -------------------------------------------------------------------------- */
/* Messaging                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Start a new chat with one or more relations. LinkedIn only allows this with
 * existing 1st-degree connections unless sent as InMail.
 */
export function startChat(params: {
  accountId: string;
  attendeesIds: string[]; // provider ids
  text: string;
  inmail?: boolean;
  linkedinApi?: LinkedinApiTier;
}) {
  const form = new FormData();
  form.append("account_id", params.accountId);
  for (const id of params.attendeesIds) form.append("attendees_ids", id);
  form.append("text", params.text);
  if (params.inmail) form.append("linkedin[inmail]", "true");
  if (params.linkedinApi) form.append("linkedin[api]", params.linkedinApi);

  return request<{ object: string; chat_id?: string; id?: string }>("/chats", {
    method: "POST",
    body: form,
  });
}

/** Send a message into an existing chat. */
export function sendMessage(params: { chatId: string; accountId?: string; text: string }) {
  const form = new FormData();
  form.append("text", params.text);
  if (params.accountId) form.append("account_id", params.accountId);

  return request<{ object: string; message_id?: string; id?: string }>(
    `/chats/${params.chatId}/messages`,
    { method: "POST", body: form },
  );
}

export function listChats(params: {
  accountId: string;
  cursor?: string;
  limit?: number;
  unread?: boolean;
}) {
  return request<UnipileList<UnipileChat>>("/chats", {
    query: {
      account_id: params.accountId,
      cursor: params.cursor,
      limit: params.limit ?? 100,
      unread: params.unread,
    },
  });
}

export function listMessages(params: { chatId: string; cursor?: string; limit?: number }) {
  return request<UnipileList<UnipileMessage>>(`/chats/${params.chatId}/messages`, {
    query: { cursor: params.cursor, limit: params.limit ?? 100 },
  });
}

export const unipile = {
  listAccounts,
  getAccount,
  createHostedAuthLink,
  listRelations,
  getProfile,
  sendInvitation,
  startChat,
  sendMessage,
  listChats,
  listMessages,
};
