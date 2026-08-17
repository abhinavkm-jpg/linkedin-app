/** Types for the subset of the Unipile REST API this app uses. */

export type UnipileSourceStatus =
  | "OK"
  | "STOPPED"
  | "ERROR"
  | "CREDENTIALS"
  | "PERMISSIONS"
  | "CONNECTING";

export interface UnipileAccountSource {
  id: string;
  status: UnipileSourceStatus;
}

export interface UnipileAccount {
  object: "Account";
  id: string; // this is the account_id used everywhere else
  type: string; // "LINKEDIN", "MAIL", ...
  name: string;
  created_at: string;
  sources?: UnipileAccountSource[];
}

export interface UnipileList<T> {
  object: string;
  items: T[];
  cursor: string | null;
}

/** Item from GET /users/relations — lightweight, no full profile. */
export interface UserRelation {
  object: "UserRelation";
  first_name?: string;
  last_name?: string;
  headline?: string;
  public_identifier?: string;
  public_profile_url?: string;
  created_at?: number;
  member_id?: string;
  member_urn?: string;
  connection_urn?: string;
  profile_picture_url?: string;
}

export interface WorkExperience {
  position?: string;
  company?: string;
  location?: string;
  current?: boolean;
  start?: string;
  end?: string;
  description?: string;
}

/** Response from GET /users/{identifier}. */
export interface UnipileProfile {
  object?: string;
  provider?: string;
  provider_id?: string;
  public_identifier?: string;
  first_name?: string;
  last_name?: string;
  headline?: string;
  summary?: string;
  location?: string;
  public_profile_url?: string;
  profile_picture_url?: string;
  primary_locale?: { country?: string; language?: string };
  work_experience?: WorkExperience[];
  work_experience_total_count?: number;
  is_relationship?: boolean;
  network_distance?: string;
  throttled_sections?: string[];
  [key: string]: unknown;
}

export interface InvitationResponse {
  object: "UserInvitationSent";
  invitation_id: string;
  usage?: number;
}

export interface UnipileChat {
  object?: string;
  id: string;
  account_id: string;
  account_type?: string;
  provider_id?: string;
  attendee_provider_id?: string;
  name?: string;
  timestamp?: string;
  unread_count?: number;
  archived?: number;
  folder?: string[] | string;
  subject?: string;
  content_type?: string;
}

export interface UnipileMessage {
  object?: string;
  id: string;
  chat_id: string;
  text?: string;
  sender_id?: string;
  provider_id?: string;
  timestamp?: string;
  is_sender?: 0 | 1;
  seen?: 0 | 1;
}

/**
 * A post authored by a LinkedIn user (from GET /users/{identifier}/posts).
 * Unipile's exact field names vary; keep consumers defensive and prefer the
 * accessors in lib/unipile/posts.ts over reading these directly.
 */
export interface UnipilePost {
  object?: string;
  id?: string; // Unipile's own id for the post
  social_id?: string; // the LinkedIn activity/share URN — used for comment lookups
  provider?: string;
  share_url?: string;
  text?: string; // the post body / commentary
  date?: string;
  parsed_datetime?: string;
  comment_counter?: number;
  reaction_counter?: number;
  repost_counter?: number;
  impressions_counter?: number;
  author?: {
    name?: string;
    public_identifier?: string;
    provider_id?: string;
    headline?: string;
  };
  [key: string]: unknown;
}

/**
 * A comment on a post (from GET /posts/{postId}/comments). Verified shape:
 * `author` is the display name; `author_details.id` is the provider_id;
 * `author_details.network_distance` is "DISTANCE_1" for 1st-degree connections.
 */
export interface UnipileComment {
  object?: string;
  id?: string;
  post_id?: string;
  post_urn?: string;
  date?: string;
  author?: string; // display name
  text?: string;
  reaction_counter?: number;
  reply_counter?: number;
  author_details?: {
    id?: string; // provider_id (ACoAA…) — usable directly in startChat/sendInvitation
    is_company?: boolean;
    headline?: string;
    profile_url?: string; // https://www.linkedin.com/in/<slug>
    public_identifier?: string;
    network_distance?: string; // "DISTANCE_1" | "DISTANCE_2" | "DISTANCE_3" | "OUT_OF_NETWORK"
    name?: string;
    profile_picture_url?: string;
  };
  [key: string]: unknown;
}

/** Response from GET /users/me — the connected account's own profile. */
export interface UnipileAccountOwner {
  object?: string;
  provider?: string;
  provider_id?: string;
  public_identifier?: string;
  first_name?: string;
  last_name?: string;
  headline?: string;
  [key: string]: unknown;
}

export interface HostedAuthLinkResponse {
  object?: string;
  url: string;
}

export type LinkedinApiTier = "classic" | "recruiter" | "sales_navigator";

export interface UnipileErrorBody {
  status?: number;
  type?: string;
  title?: string;
  detail?: string;
  [key: string]: unknown;
}
