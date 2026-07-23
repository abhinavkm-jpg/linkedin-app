import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  date,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

/* -------------------------------------------------------------------------- */
/* Enums                                                                       */
/* -------------------------------------------------------------------------- */

export const roleEnum = pgEnum("role", ["admin", "member"]);

export const accountStatusEnum = pgEnum("account_status", [
  "OK",
  "CONNECTING",
  "CREDENTIALS",
  "PERMISSIONS",
  "ERROR",
  "STOPPED",
  "DELETED",
]);

export const syncStatusEnum = pgEnum("sync_status", ["idle", "running", "error"]);

// Where a connection stands relative to the operating LinkedIn account.
export const relationshipStatusEnum = pgEnum("relationship_status", [
  "connection", // already a 1st-degree relation (can DM)
  "not_connected", // known profile, not connected
  "invite_queued",
  "invited",
  "pending", // invite sent, awaiting acceptance
  "accepted",
  "messaged",
  "replied",
  "do_not_contact",
]);

export const templateTypeEnum = pgEnum("template_type", ["invite", "message"]);
export const stepTypeEnum = pgEnum("step_type", ["invite", "message"]);
export const sourceTypeEnum = pgEnum("source_type", ["template", "ai"]);

export const campaignStatusEnum = pgEnum("campaign_status", [
  "draft",
  "active",
  "paused",
  "completed",
  "archived",
]);

export const enrollmentStateEnum = pgEnum("enrollment_state", [
  "queued",
  "enriching",
  "invite_pending",
  "awaiting_accept",
  "accepted",
  "messaging",
  "messaged",
  "in_followup",
  "replied",
  "completed",
  "paused",
  "failed",
  "skipped",
]);

export const activityTypeEnum = pgEnum("activity_type", [
  "invite",
  "message",
  "enrich",
  "sync",
]);

export const activityStatusEnum = pgEnum("activity_status", [
  "pending",
  "success",
  "failed",
  "throttled",
]);

/* -------------------------------------------------------------------------- */
/* Users (team members)                                                        */
/* -------------------------------------------------------------------------- */

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  image: text("image"),
  passwordHash: text("password_hash"),
  role: roleEnum("role").notNull().default("member"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* -------------------------------------------------------------------------- */
/* App settings (integration secrets, entered in the UI, stored encrypted)     */
/* -------------------------------------------------------------------------- */

export const appSettings = pgTable("app_settings", {
  // Single-row table; always id = "singleton".
  id: text("id").primaryKey().default("singleton"),
  unipileDsn: text("unipile_dsn"),
  unipileApiKey: text("unipile_api_key"), // encrypted at rest
  unipileWebhookSecret: text("unipile_webhook_secret"),
  anthropicApiKey: text("anthropic_api_key"), // encrypted at rest
  qstashToken: text("qstash_token"), // encrypted at rest
  qstashCurrentSigningKey: text("qstash_current_signing_key"),
  qstashNextSigningKey: text("qstash_next_signing_key"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* -------------------------------------------------------------------------- */
/* LinkedIn accounts (one Unipile account_id each)                             */
/* -------------------------------------------------------------------------- */

export const linkedinAccounts = pgTable(
  "linkedin_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    unipileAccountId: text("unipile_account_id").notNull().unique(),
    name: text("name").notNull(),
    // The account holder's own provider id — used to distinguish inbound replies
    // from our own sends in message webhooks.
    ownerProviderId: text("owner_provider_id"),
    status: accountStatusEnum("status").notNull().default("CONNECTING"),
    ownerUserId: uuid("owner_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // Rate-limit caps (LinkedIn has no quota API — we enforce our own).
    dailyInviteCap: integer("daily_invite_cap").notNull().default(80),
    dailyMessageCap: integer("daily_message_cap").notNull().default(100),
    dailyInmailCap: integer("daily_inmail_cap").notNull().default(40),
    dailyEnrichCap: integer("daily_enrich_cap").notNull().default(100),
    // Proactive daily profile enrichment (its own budget, separate from the
    // send-time enrichment cap). Off by default; enrich this many per day.
    autoEnrich: boolean("auto_enrich").notNull().default(false),
    autoEnrichDailyCap: integer("auto_enrich_daily_cap").notNull().default(150),
    // Connection sync state.
    syncStatus: syncStatusEnum("sync_status").notNull().default("idle"),
    syncCursor: text("sync_cursor"),
    syncedCount: integer("synced_count").notNull().default(0),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    // Earliest time this account may send again (randomized per-send cooldown).
    nextSendAt: timestamp("next_send_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("linkedin_accounts_owner_idx").on(t.ownerUserId)],
);

/* -------------------------------------------------------------------------- */
/* Connections (the network — 20k+ per account)                                */
/* -------------------------------------------------------------------------- */

export const connections = pgTable(
  "connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => linkedinAccounts.id, { onDelete: "cascade" }),
    // Identity (from /users/relations)
    memberId: text("member_id"),
    memberUrn: text("member_urn"),
    connectionUrn: text("connection_urn"),
    publicIdentifier: text("public_identifier"),
    publicProfileUrl: text("public_profile_url"),
    firstName: text("first_name"),
    lastName: text("last_name"),
    headline: text("headline"),
    profilePictureUrl: text("profile_picture_url"),
    // The provider's internal id — required for invites & starting chats.
    // Populated during enrichment.
    providerId: text("provider_id"),
    // Enrichment (from /users/{id})
    locationCountry: text("location_country"),
    company: text("company"),
    position: text("position"),
    enrichment: jsonb("enrichment").$type<ConnectionEnrichment | null>(),
    // Lowercased searchable blob (headline + position + company + latest job
    // description + About) used for enriched ICP keyword matching.
    enrichedText: text("enriched_text"),
    enrichedAt: timestamp("enriched_at", { withTimezone: true }),
    // Outreach state
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    relationshipStatus: relationshipStatusEnum("relationship_status")
      .notNull()
      .default("connection"),
    connectedAt: timestamp("connected_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Idempotent upsert target for sync.
    uniqueIndex("connections_account_member_idx").on(t.accountId, t.memberId),
    index("connections_account_idx").on(t.accountId),
    index("connections_public_identifier_idx").on(t.publicIdentifier),
    index("connections_country_idx").on(t.locationCountry),
    index("connections_status_idx").on(t.relationshipStatus),
  ],
);

export type ConnectionEnrichment = {
  summary?: string | null;
  workExperience?: Array<{
    position?: string | null;
    company?: string | null;
    current?: boolean | null;
    description?: string | null;
  }>;
  raw?: unknown;
};

/* -------------------------------------------------------------------------- */
/* Templates & AI prompts                                                       */
/* -------------------------------------------------------------------------- */

export const templates = pgTable("templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: uuid("owner_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull(),
  type: templateTypeEnum("type").notNull().default("message"),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const aiPrompts = pgTable("ai_prompts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  systemPrompt: text("system_prompt").notNull(),
  model: text("model").notNull().default("claude-sonnet-5"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* -------------------------------------------------------------------------- */
/* Campaigns & sequences                                                       */
/* -------------------------------------------------------------------------- */

export type CampaignTargeting = {
  titleKeywords?: string[];
  countries?: string[];
  tags?: string[];
  relationshipStatuses?: string[];
};

export const campaigns = pgTable("campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => linkedinAccounts.id, { onDelete: "cascade" }),
  ownerUserId: uuid("owner_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  status: campaignStatusEnum("status").notNull().default("draft"),
  targeting: jsonb("targeting").$type<CampaignTargeting>().notNull().default({}),
  reviewBeforeSend: boolean("review_before_send").notNull().default(true),
  // When true, each connection can be enrolled/messaged only once in this
  // campaign ("unique DMs"). When false, repeats are allowed ("multi DMs").
  dedupeContacts: boolean("dedupe_contacts").notNull().default(true),
  // When true (and the campaign is active), a background job keeps enrolling
  // all matching connections automatically — no manual "Enroll" clicks.
  autoEnroll: boolean("auto_enroll").notNull().default(true),
  // When true, an AI triages each inbound reply: a genuine human reply stops
  // the sequence and hands off to the inbox; auto-replies / out-of-office keep
  // the follow-up running. When false, any reply stops the sequence.
  aiReplyDecision: boolean("ai_reply_decision").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sequenceSteps = pgTable(
  "sequence_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    stepOrder: integer("step_order").notNull(),
    type: stepTypeEnum("type").notNull(),
    sourceType: sourceTypeEnum("source_type").notNull().default("template"),
    templateId: uuid("template_id").references(() => templates.id, {
      onDelete: "set null",
    }),
    aiPromptId: uuid("ai_prompt_id").references(() => aiPrompts.id, {
      onDelete: "set null",
    }),
    model: text("model"),
    // Delay after the previous step completes (or acceptance) before this fires.
    delayHours: integer("delay_hours").notNull().default(24),
    stopOnReply: boolean("stop_on_reply").notNull().default(true),
  },
  (t) => [index("sequence_steps_campaign_idx").on(t.campaignId)],
);

/* -------------------------------------------------------------------------- */
/* Enrollments (connection ↔ campaign progress)                                */
/* -------------------------------------------------------------------------- */

export const enrollments = pgTable(
  "enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => linkedinAccounts.id, { onDelete: "cascade" }),
    currentStep: integer("current_step").notNull().default(0),
    state: enrollmentStateEnum("state").notNull().default("queued"),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }).defaultNow(),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Non-unique: "multi DMs" campaigns may enroll a person more than once.
    // Uniqueness (when dedupeContacts is on) is enforced in application logic.
    index("enrollments_campaign_connection_idx").on(t.campaignId, t.connectionId),
    // The send worker scans by (state, nextRunAt).
    index("enrollments_due_idx").on(t.state, t.nextRunAt),
    index("enrollments_account_idx").on(t.accountId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Activities (immutable outreach log)                                         */
/* -------------------------------------------------------------------------- */

export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => linkedinAccounts.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id").references(() => connections.id, {
      onDelete: "set null",
    }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, {
      onDelete: "set null",
    }),
    enrollmentId: uuid("enrollment_id").references(() => enrollments.id, {
      onDelete: "set null",
    }),
    type: activityTypeEnum("type").notNull(),
    status: activityStatusEnum("status").notNull().default("pending"),
    content: text("content"),
    unipileInvitationId: text("unipile_invitation_id"),
    unipileChatId: text("unipile_chat_id"),
    unipileMessageId: text("unipile_message_id"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("activities_account_idx").on(t.accountId),
    index("activities_created_idx").on(t.createdAt),
  ],
);

/* -------------------------------------------------------------------------- */
/* Daily counters (rate-limit accounting + dashboard gauges)                   */
/* -------------------------------------------------------------------------- */

export const dailyCounters = pgTable(
  "daily_counters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => linkedinAccounts.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    invitesSent: integer("invites_sent").notNull().default(0),
    messagesSent: integer("messages_sent").notNull().default(0),
    inmailsSent: integer("inmails_sent").notNull().default(0),
    enrichments: integer("enrichments").notNull().default(0),
    autoEnrichments: integer("auto_enrichments").notNull().default(0),
  },
  (t) => [uniqueIndex("daily_counters_account_day_idx").on(t.accountId, t.day)],
);

/* -------------------------------------------------------------------------- */
/* Chats (inbox cache) & webhook log                                           */
/* -------------------------------------------------------------------------- */

export const chats = pgTable(
  "chats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => linkedinAccounts.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id").references(() => connections.id, {
      onDelete: "set null",
    }),
    unipileChatId: text("unipile_chat_id").notNull().unique(),
    attendeeProviderId: text("attendee_provider_id"),
    attendeeName: text("attendee_name"),
    lastMessageText: text("last_message_text"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    unreadCount: integer("unread_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("chats_account_idx").on(t.accountId)],
);

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: text("source").notNull(),
    event: text("event"),
    externalId: text("external_id"),
    payload: jsonb("payload"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("webhook_events_external_idx").on(t.source, t.externalId)],
);

/* -------------------------------------------------------------------------- */
/* Relations                                                                   */
/* -------------------------------------------------------------------------- */

export const linkedinAccountsRelations = relations(linkedinAccounts, ({ many, one }) => ({
  owner: one(users, {
    fields: [linkedinAccounts.ownerUserId],
    references: [users.id],
  }),
  connections: many(connections),
  campaigns: many(campaigns),
}));

export const connectionsRelations = relations(connections, ({ one, many }) => ({
  account: one(linkedinAccounts, {
    fields: [connections.accountId],
    references: [linkedinAccounts.id],
  }),
  enrollments: many(enrollments),
}));

export const campaignsRelations = relations(campaigns, ({ one, many }) => ({
  account: one(linkedinAccounts, {
    fields: [campaigns.accountId],
    references: [linkedinAccounts.id],
  }),
  steps: many(sequenceSteps),
  enrollments: many(enrollments),
}));

export const sequenceStepsRelations = relations(sequenceSteps, ({ one }) => ({
  campaign: one(campaigns, {
    fields: [sequenceSteps.campaignId],
    references: [campaigns.id],
  }),
  template: one(templates, {
    fields: [sequenceSteps.templateId],
    references: [templates.id],
  }),
  aiPrompt: one(aiPrompts, {
    fields: [sequenceSteps.aiPromptId],
    references: [aiPrompts.id],
  }),
}));

export const enrollmentsRelations = relations(enrollments, ({ one }) => ({
  campaign: one(campaigns, {
    fields: [enrollments.campaignId],
    references: [campaigns.id],
  }),
  connection: one(connections, {
    fields: [enrollments.connectionId],
    references: [connections.id],
  }),
  account: one(linkedinAccounts, {
    fields: [enrollments.accountId],
    references: [linkedinAccounts.id],
  }),
}));

/* -------------------------------------------------------------------------- */
/* Inferred types                                                              */
/* -------------------------------------------------------------------------- */

export type User = typeof users.$inferSelect;
export type LinkedinAccount = typeof linkedinAccounts.$inferSelect;
export type Connection = typeof connections.$inferSelect;
export type Template = typeof templates.$inferSelect;
export type AiPrompt = typeof aiPrompts.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type SequenceStep = typeof sequenceSteps.$inferSelect;
export type Enrollment = typeof enrollments.$inferSelect;
export type Activity = typeof activities.$inferSelect;
export type DailyCounter = typeof dailyCounters.$inferSelect;
export type Chat = typeof chats.$inferSelect;
export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type AppSettings = typeof appSettings.$inferSelect;
