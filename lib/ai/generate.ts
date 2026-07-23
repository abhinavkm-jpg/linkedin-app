import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_AI_MODEL } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import { DEFAULT_SYSTEM_PROMPT, findBannedWords } from "./prompts";

async function client(): Promise<Anthropic> {
  const { anthropicApiKey } = await getSettings();
  if (!anthropicApiKey) {
    throw new Error("Anthropic is not configured. Add your API key in Settings.");
  }
  return new Anthropic({ apiKey: anthropicApiKey });
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

export interface GenerateOptions {
  step: OutreachStep;
  prospect: ProspectContext;
  systemPrompt?: string;
  model?: string;
  /** Prior messages in the thread, for follow-ups that should build on context. */
  priorMessages?: Array<{ from: "me" | "them"; text: string }>;
  /** Extra guidance for this specific message. */
  instructions?: string;
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
  const system = opts.systemPrompt || DEFAULT_SYSTEM_PROMPT;

  const parts: string[] = [
    STEP_INSTRUCTIONS[opts.step],
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

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

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
