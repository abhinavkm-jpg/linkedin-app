import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { aiPrompts } from "@/db/schema";
import { DEFAULT_AI_MODEL } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import { DEFAULT_SYSTEM_PROMPT, findBannedWords } from "./prompts";
import { STAGE_VALUES, INTENT_VALUES } from "@/lib/pipeline";

async function client(): Promise<Anthropic> {
  const { anthropicApiKey } = await getSettings();
  if (!anthropicApiKey) {
    throw new Error("Anthropic is not configured. Add your API key in Settings.");
  }
  return new Anthropic({ apiKey: anthropicApiKey });
}

/**
 * The voice/rules used when a step doesn't name a specific prompt: the DB prompt
 * flagged `isDefault`, else the built-in constant. This makes the "default"
 * prompt in the UI actually drive generation.
 */
export async function getDefaultSystemPrompt(): Promise<string> {
  try {
    const [row] = await db
      .select({ systemPrompt: aiPrompts.systemPrompt })
      .from(aiPrompts)
      .where(eq(aiPrompts.isDefault, true))
      .limit(1);
    if (row?.systemPrompt?.trim()) return row.systemPrompt;
  } catch {
    // fall through to the constant
  }
  return DEFAULT_SYSTEM_PROMPT;
}

export type OutreachStep =
  | "connection_request"
  | "welcome"
  | "follow_up_1"
  | "follow_up_2"
  | "follow_up_3";

export interface ProspectContext {
  firstName?: string | null;
  lastName?: string | null;
  headline?: string | null;
  company?: string | null;
  position?: string | null;
  locationCountry?: string | null;
  summary?: string | null;
  experience?: Array<{ position?: string | null; company?: string | null }>;
}

const STEP_INSTRUCTIONS: Record<OutreachStep, string> = {
  connection_request:
    "Write a LinkedIn connection request note. Max 300 characters. Personalize the reason for connecting. Do not pitch, mention services, or ask for a meeting.",
  welcome:
    "They just accepted the connection. Thank them briefly, reference something relevant to their role or business, and end naturally. No sales pitch. 50-120 words.",
  follow_up_1:
    "Share one observation about their industry, role, or market and relate it to a business challenge. Ask one thoughtful, open-ended question. 50-120 words.",
  follow_up_2:
    "Continue the conversation. Seek to understand their current process, priorities, or challenges. Do not present solutions yet. 50-120 words.",
  follow_up_3:
    "If there is genuine engagement, connect their challenge to a pattern seen across client engagements. You may reference credibility lightly. Keep the focus on their business outcome. 50-120 words.",
};

function buildProspectBlock(p: ProspectContext): string {
  const lines: string[] = [];
  const name = [p.firstName, p.lastName].filter(Boolean).join(" ");
  if (name) lines.push(`Name: ${name}`);
  if (p.headline) lines.push(`Headline: ${p.headline}`);
  if (p.position) lines.push(`Current role: ${p.position}`);
  if (p.company) lines.push(`Company: ${p.company}`);
  if (p.locationCountry) lines.push(`Country: ${p.locationCountry}`);
  if (p.summary) lines.push(`About: ${p.summary}`);
  if (p.experience?.length) {
    const exp = p.experience
      .slice(0, 4)
      .map((e) => [e.position, e.company].filter(Boolean).join(" at "))
      .filter(Boolean)
      .join("; ");
    if (exp) lines.push(`Experience: ${exp}`);
  }
  return lines.join("\n");
}

/**
 * Baseline formatting applied to every generated message (appended to whatever
 * system prompt is in use) so output is readable, not a single dense paragraph.
 */
const FORMATTING_RULES = `FORMATTING:
- Write naturally, like a normal LinkedIn message. Do NOT impose a rigid structure — no mandatory greeting line, no bullet points, no sign-off block.
- Keep it as plain text. If the message is short, leave it as a single paragraph.
- Only when the message is long, break it into at most two short paragraphs separated by a single blank line so it's readable. That's it.`;

const URL_RE = /https?:\/\/[^\s)>\]]+/gi;

/** Normalize a URL for comparison (drop trailing punctuation/slash, lowercase host+path). */
function normalizeUrl(u: string): string {
  return u.trim().replace(/[.,;:!?)"']+$/, "").replace(/\/+$/, "").toLowerCase();
}

/**
 * Remove any URL from generated text that wasn't among the ones we explicitly
 * supplied (via `instructions`). Legitimate links only ever come from the
 * injected content instruction, so an unsupplied/altered link is a
 * hallucination — strip it and tidy the surrounding whitespace.
 */
function stripDisallowedUrls(text: string, allowed: Set<string>): string {
  let out = text.replace(URL_RE, (m) => (allowed.has(normalizeUrl(m)) ? m : ""));
  // Tidy artifacts left by a removed link: doubled spaces, space-before-punct,
  // empty parentheses, dangling "at/here:" leads, and blank lines.
  out = out
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .replace(/\n{3,}/g, "\n\n");
  return out.trim();
}

export interface GenerateOptions {
  step: OutreachStep;
  prospect: ProspectContext;
  systemPrompt?: string;
  model?: string;
  /** Prior messages in the thread, for follow-ups that should build on context. */
  priorMessages?: Array<{ from: "me" | "them"; text: string }>;
  /** Extra guidance for this specific message. */
  instructions?: string;
  /**
   * What this specific message should do (the stage's job). Overrides the
   * built-in STEP_INSTRUCTIONS when provided — the layered model pairs the
   * account's voice (systemPrompt) with a per-stage task instruction.
   */
  taskInstruction?: string;
}

export interface GeneratedMessage {
  text: string;
  bannedWordsFound: string[];
  model: string;
}

/**
 * Generate a single outreach message via Claude. Messages are short, so we use
 * a small max_tokens and medium effort; no sampling params (rejected on
 * current models). Output is a draft for human review before sending.
 */
export async function generateMessage(opts: GenerateOptions): Promise<GeneratedMessage> {
  const model = opts.model || DEFAULT_AI_MODEL;
  // No explicit prompt → use the editable DB default (falls back to the constant).
  const base = opts.systemPrompt || (await getDefaultSystemPrompt());
  // Always apply a light formatting baseline on top so messages read naturally.
  const system = `${base}\n\n${FORMATTING_RULES}`;

  const parts: string[] = [
    opts.taskInstruction?.trim() || STEP_INSTRUCTIONS[opts.step],
    "",
    "Prospect:",
    buildProspectBlock(opts.prospect),
  ];
  if (opts.priorMessages?.length) {
    parts.push("", "Conversation so far:");
    for (const m of opts.priorMessages) {
      parts.push(`${m.from === "me" ? "Me" : "Them"}: ${m.text}`);
    }
  }
  if (opts.instructions) {
    parts.push("", `Additional guidance: ${opts.instructions}`);
  }
  parts.push(
    "",
    "Assume this prospect is already a valid, in-ICP target. Always write the message itself — never ask for inputs, never flag or refuse, never explain your reasoning.",
    "Do not include any URL or link unless one is provided in the guidance above. Never invent, guess, shorten, or reconstruct a URL.",
    "Return only the message text with no preamble, quotes, or surrounding commentary.",
  );

  const anthropic = await client();
  const response = await anthropic.messages.create({
    model,
    max_tokens: 1024,
    output_config: { effort: "medium" },
    system,
    messages: [{ role: "user", content: parts.join("\n") }],
  });

  const raw = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  // Only URLs we explicitly supplied via instructions are allowed to survive.
  const allowed = new Set(
    (opts.instructions?.match(URL_RE) ?? []).map(normalizeUrl),
  );
  const text = stripDisallowedUrls(raw, allowed);

  return {
    text,
    bannedWordsFound: findBannedWords(text),
    model,
  };
}

const TRIAGE_SYSTEM = `You triage inbound LinkedIn replies for a B2B outreach tool.
Decide ONE of:
- "handoff": a genuine human reply a salesperson should personally handle — interested, a question, an objection, "not interested", "wrong person", "who is this", any real message from the person. Stop the automated sequence.
- "continue": NOT a genuine reply — an out-of-office / vacation auto-responder, away message, automated acknowledgement, delivery/read receipt, or system notification. The outreach sequence should keep running.
When unsure, prefer "handoff" (safer to involve a human).
Respond with ONLY compact JSON: {"action":"handoff"|"continue","reason":"<=8 words"}`;

export interface ReplyDecision {
  action: "handoff" | "continue";
  reason: string;
}

const PROMPT_ARCHITECT_SYSTEM = `You are a senior prompt engineer for a B2B LinkedIn outreach tool.
Rewrite the user's rough draft into a clean, well-structured SYSTEM PROMPT that defines the VOICE and RULES for AI-written outreach messages (connection notes, welcomes, follow-ups).

Rules:
- Preserve the user's intent, product/company, target audience, and any specific rules they gave.
- Organize into clear labeled sections: Role & voice, Objective, Writing style, Personalization, Hard rules / avoid, Message length.
- This prompt defines voice and rules ONLY. Do NOT write example messages or per-step copy — the tool adds stage-specific guidance (connection request, welcome, follow-ups) automatically.
- Keep it concise, directive, and professional (executive B2B tone). No emojis or hashtags.
- If the draft is empty or minimal, produce a strong sensible default for executive B2B outreach.

Return ONLY the improved system prompt as plain text — no preamble, no code fences, no commentary.`;

const TEMPLATE_WRITER_SYSTEM = `You write reusable LinkedIn outreach TEMPLATES for a B2B tool.
Produce ONE message that uses {{placeholders}} for personalization.
Available placeholders (use only these): {{first_name}}, {{last_name}}, {{full_name}}, {{company}}, {{position}}, {{headline}}, {{country}}.

Rules:
- If type is "invite": a connection-request note, MAX 300 characters, personalized reason to connect, no pitch and no meeting ask.
- If type is "message": a first message, 50-120 words, confident executive B2B tone, no hard pitch.
- Use {{first_name}} at least once; add other placeholders only where they read naturally.
- No emojis, hashtags, or em dashes. Sound like a real person, not a script.
- If an existing draft is given, refine/rewrite it keeping its intent; otherwise write a strong default for the stated purpose (use the template name as the intent).

Return ONLY the message text with placeholders — no preamble, quotes, or commentary.`;

/** Draft or refine a reusable message template (with {{placeholders}}) via AI. */
export async function draftTemplate(input: {
  name: string;
  type: "invite" | "message";
  draft: string;
}): Promise<string> {
  const anthropic = await client();
  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 600,
    system: TEMPLATE_WRITER_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Type: ${input.type}\nName / intent: ${input.name || "(untitled)"}\nExisting draft: ${input.draft.trim() || "none"}`,
      },
    ],
  });
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

/** Analyze a user's draft and return a cleaned-up, well-structured system prompt. */
export async function improveSystemPrompt(draft: string): Promise<string> {
  const anthropic = await client();
  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1500,
    system: PROMPT_ARCHITECT_SYSTEM,
    messages: [
      {
        role: "user",
        content: draft.trim()
          ? `Improve and structure this draft system prompt:\n"""${draft}"""`
          : "No draft provided — write a strong default executive B2B outreach system prompt.",
      },
    ],
  });
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

/**
 * Classify an inbound reply as a genuine human reply (handoff) vs automated
 * noise like out-of-office (continue). Defaults to "handoff" on any error.
 */
export async function classifyReply(
  replyText: string,
  prospectName?: string | null,
): Promise<ReplyDecision> {
  try {
    const anthropic = await client();
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 120,
      system: TRIAGE_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Reply from ${prospectName || "a prospect"}:\n"""${replyText}"""`,
        },
      ],
    });
    const txt = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const match = txt.match(/\{[\s\S]*\}/);
    const parsed = match ? (JSON.parse(match[0]) as Partial<ReplyDecision>) : null;
    const action = parsed?.action === "continue" ? "continue" : "handoff";
    return { action, reason: (parsed?.reason ?? "").slice(0, 120) };
  } catch {
    return { action: "handoff", reason: "classifier unavailable" };
  }
}

const PIPELINE_SYSTEM = `You are a senior B2B sales assistant helping the account holder reply to LinkedIn connections who responded to their outreach. Do all of the following, then return JSON only.

1) CLASSIFY the prospect's latest reply into exactly one intent:
interested, problem_identified, qualified_opportunity, meeting_ready, question, objection, not_interested, not_relevant, unclear.

2) Choose the sales STAGE the conversation should be in now (given the current stage + their latest reply):
new_response, engaging, qualifying, meeting_opportunity, meeting_booked, discovery_completed, proposal, negotiation, won, lost.

3) Draft the NEXT reply the account holder should send, following this playbook:
- Positive but no specific need yet -> continue the conversation: acknowledge, add one relevant value point, ask ONE useful qualifying question. Do NOT push a meeting.
- They mention a problem / goal / challenge -> acknowledge it, show relevant understanding, ask ONE concise question. Don't pitch everything.
- Clearly qualified (a real problem we can help with + business relevance) -> transition toward a meeting: connect their situation -> a relevant outcome -> a short call. Make the meeting the logical next step, never a generic "book a demo".
- Ready to meet -> a concise 15-30 minute invite that explains why it's useful to THEM.
- Objection -> address it directly and briefly; keep the door open.
- They clearly declined / said not interested -> a short, gracious close; do not push.
- Ignored a prior meeting invite -> a low-pressure follow-up with a new useful reason and an easy yes/no.

CRITICAL GUARDRAILS (do not get these wrong):
- If the person asks to meet, agrees to a call, proposes/accepts a time, or clearly wants to talk, that is meeting_ready. ALWAYS move toward the meeting (propose a short call and offer to work around their schedule). NEVER decline, pass, or close someone who wants to talk.
- Use "not_interested" ONLY when THEY explicitly decline. Use "not_relevant" ONLY for spam, wrong-person, or a message with no business relevance at all.
- Do NOT disqualify someone based on their company, industry, or job title. Deciding a lead is a poor fit is the human's call, never yours. A prospect at a big or unrelated-looking company who engages is still a live conversation.
- When unsure, keep the conversation going (engaging). Never draft a "pass"/"close" for a warm, curious, or neutral reply.
- If they are pitching us, stay warm and curious and steer toward mutual relevance; only decline if they push a clear sale we obviously don't want.
- Stage "meeting_booked" is ONLY for a confirmed date/time. If they merely agreed to meet or asked to talk, use "meeting_opportunity" (intent can still be meeting_ready).

MESSAGE RULES: sound human; concise; reference what they actually said; at most ONE question; one clear objective; no generic sales language; no over-enthusiasm; no long paragraphs; never invent facts about the prospect or our company; never include a link unless one was provided; don't repeat what was already discussed.

Return ONLY compact JSON:
{"intent":"<one intent>","stage":"<one stage>","objective":"<=8 words","reply":"the message text to send","reason":"why this reply, <=20 words"}`;

export interface PipelineDraft {
  intent: string;
  suggestedStage: string;
  objective: string;
  reply: string;
  reason: string;
  bannedWordsFound: string[];
}

/**
 * Classify an inbound reply + recommend a sales stage + draft the next reply,
 * following the pipeline playbook. Always returns a result (safe fallback on
 * any error) — the caller stores it as a PENDING draft; it is never sent here.
 */
export async function draftPipelineReply(opts: {
  prospect: ProspectContext;
  priorMessages: Array<{ from: "me" | "them"; text: string }>;
  currentStage: string;
  /** Who-we-are / voice context (the account's voice prompt). */
  voice?: string;
  /** Offer + qualification + how-to-advance context (the account's reply strategy). */
  strategy?: string;
  /** Their newest inbound message — used as a fallback if history couldn't be fetched. */
  latestInbound?: string;
}): Promise<PipelineDraft> {
  const fallback: PipelineDraft = {
    intent: "unclear",
    suggestedStage: opts.currentStage,
    objective: "",
    reply: "",
    reason: "AI unavailable — write this reply manually",
    bannedWordsFound: [],
  };
  try {
    const lastInbound =
      opts.latestInbound?.trim() ||
      [...opts.priorMessages].reverse().find((m) => m.from === "them")?.text ||
      "";
    const thread = opts.priorMessages
      .slice(-14)
      .map((m) => `${m.from === "me" ? "Me" : "Them"}: ${m.text}`)
      .join("\n");
    const parts = [
      `WHO WE ARE / VOICE:\n${opts.voice?.trim() || "A B2B demand-generation and campaign-execution partner."}`,
      ...(opts.strategy?.trim()
        ? ["", `SALES STRATEGY & QUALIFICATION:\n${opts.strategy.trim()}`]
        : []),
      "",
      `Current stage: ${opts.currentStage}`,
      "",
      "Prospect:",
      buildProspectBlock(opts.prospect),
      "",
      "Conversation so far (oldest first):",
      thread || "(no prior messages captured)",
      "",
      `Their latest message: """${lastInbound}"""`,
      "",
      "Classify the intent, choose the stage, and draft the next reply as JSON.",
    ];

    const anthropic = await client();
    const response = await anthropic.messages.create({
      model: DEFAULT_AI_MODEL,
      max_tokens: 1200,
      output_config: { effort: "medium" },
      system: PIPELINE_SYSTEM,
      messages: [{ role: "user", content: parts.join("\n") }],
    });
    const txt = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const match = txt.match(/\{[\s\S]*\}/);
    if (!match) return fallback;
    const parsed = JSON.parse(match[0]) as Partial<{
      intent: string;
      stage: string;
      objective: string;
      reply: string;
      reason: string;
    }>;

    const intent =
      parsed.intent && INTENT_VALUES.includes(parsed.intent as (typeof INTENT_VALUES)[number])
        ? parsed.intent
        : "unclear";
    const suggestedStage =
      parsed.stage && STAGE_VALUES.includes(parsed.stage as (typeof STAGE_VALUES)[number])
        ? parsed.stage
        : opts.currentStage;
    // No links are ever supplied to a reply draft, so strip any the model invents.
    const reply = stripDisallowedUrls((parsed.reply ?? "").trim(), new Set());

    return {
      intent,
      suggestedStage,
      objective: (parsed.objective ?? "").slice(0, 120),
      reply,
      reason: (parsed.reason ?? "").slice(0, 200),
      bannedWordsFound: findBannedWords(reply),
    };
  } catch {
    return fallback;
  }
}
