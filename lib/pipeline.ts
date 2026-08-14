/**
 * Sales pipeline for people who reply to outbound. Stages + intents are stored
 * as plain text (with these constants as the source of truth) so the model can
 * suggest them and a human can override without enum migrations.
 */

export const STAGES = [
  { value: "new_response", label: "New response" },
  { value: "engaging", label: "Engaging" },
  { value: "qualifying", label: "Qualifying" },
  { value: "meeting_opportunity", label: "Meeting opportunity" },
  { value: "meeting_booked", label: "Meeting booked" },
  { value: "discovery_completed", label: "Discovery completed" },
  { value: "proposal", label: "Proposal / opportunity" },
  { value: "negotiation", label: "Negotiation" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost / not interested" },
] as const;

export type PipelineStage = (typeof STAGES)[number]["value"];

export const STAGE_VALUES = STAGES.map((s) => s.value) as PipelineStage[];

export function stageLabel(value: string): string {
  return STAGES.find((s) => s.value === value)?.label ?? value;
}

export function isStage(value: string): value is PipelineStage {
  return STAGE_VALUES.includes(value as PipelineStage);
}

export const INTENTS = [
  { value: "interested", label: "Interested" },
  { value: "problem_identified", label: "Problem identified" },
  { value: "qualified_opportunity", label: "Qualified opportunity" },
  { value: "meeting_ready", label: "Meeting ready" },
  { value: "question", label: "Question" },
  { value: "objection", label: "Objection" },
  { value: "not_interested", label: "Not interested" },
  { value: "not_relevant", label: "Not relevant / poor fit" },
  { value: "unclear", label: "Unclear — needs judgment" },
] as const;

export type PipelineIntent = (typeof INTENTS)[number]["value"];

export const INTENT_VALUES = INTENTS.map((i) => i.value) as PipelineIntent[];

export function intentLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return INTENTS.find((i) => i.value === value)?.label ?? value;
}

export function isIntent(value: string): value is PipelineIntent {
  return INTENT_VALUES.includes(value as PipelineIntent);
}

/** Funnel groupings for the KPI tiles. */
export const QUALIFIED_STAGES: PipelineStage[] = [
  "qualifying",
  "meeting_opportunity",
  "meeting_booked",
  "discovery_completed",
  "proposal",
  "negotiation",
  "won",
];
export const MEETING_STAGES: PipelineStage[] = [
  "meeting_booked",
  "discovery_completed",
  "proposal",
  "negotiation",
  "won",
];

export const MEETING_STATUSES = ["none", "invited", "booked", "completed", "no_show"] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

/** Tailwind badge classes for a stage pill (custom stages fall back to neutral). */
export function stageTone(value: string): string {
  const map: Record<string, string> = {
    new_response: "bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300",
    engaging: "bg-indigo-100 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-300",
    qualifying: "bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300",
    meeting_opportunity: "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
    meeting_booked: "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
    discovery_completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
    proposal: "bg-cyan-100 text-cyan-700 dark:bg-cyan-400/15 dark:text-cyan-300",
    negotiation: "bg-cyan-100 text-cyan-700 dark:bg-cyan-400/15 dark:text-cyan-300",
    won: "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
    lost: "bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300",
  };
  return map[value] ?? "bg-slate-100 text-slate-600 dark:bg-slate-400/15 dark:text-slate-200";
}
