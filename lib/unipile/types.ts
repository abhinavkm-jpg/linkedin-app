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
