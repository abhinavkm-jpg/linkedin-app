import type { LinkedinAccount } from "@/db/schema";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

export function accountStatusTone(status: LinkedinAccount["status"]): BadgeVariant {
  switch (status) {
    case "OK":
      return "default";
    case "CONNECTING":
      return "secondary";
    case "CREDENTIALS":
    case "ERROR":
    case "PERMISSIONS":
    case "STOPPED":
    case "DELETED":
      return "destructive";
    default:
      return "outline";
  }
}

export function relationshipStatusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

/**
 * Tailwind classes for a small colored status pill, shared across the
 * connections table, enrolled list, and campaign views.
 */
export function statusPillClasses(status: string): string {
  // Each pill carries an explicit dark-mode variant so the text stays legible on
  // dark surfaces (light-only `bg-*-100 text-*-700` washes out in dark mode).
  const tone = {
    slate: "bg-slate-100 text-slate-600 dark:bg-slate-400/15 dark:text-slate-200",
    slateDim: "bg-slate-100 text-slate-500 dark:bg-slate-400/10 dark:text-slate-300",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
    blue: "bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300",
    indigo: "bg-indigo-100 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-300",
    emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
    rose: "bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300",
    cyan: "bg-cyan-100 text-cyan-700 dark:bg-cyan-400/15 dark:text-cyan-300",
    violet: "bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300",
  };
  const map: Record<string, string> = {
    // relationship statuses
    connection: tone.slate,
    not_connected: tone.slateDim,
    invite_queued: tone.amber,
    invited: tone.amber,
    pending: tone.amber,
    accepted: tone.blue,
    messaged: tone.indigo,
    replied: tone.emerald,
    do_not_contact: tone.rose,
    // enrollment states (extra)
    queued: tone.slate,
    enriching: tone.cyan,
    invite_pending: tone.amber,
    awaiting_accept: tone.amber,
    messaging: tone.blue,
    in_followup: tone.violet,
    completed: tone.emerald,
    failed: tone.rose,
    skipped: tone.slateDim,
    paused: tone.amber,
  };
  return map[status] ?? tone.slate;
}

export function enrollmentStateTone(state: string): BadgeVariant {
  if (state === "replied") return "default";
  if (state === "failed") return "destructive";
  if (state === "completed") return "secondary";
  return "outline";
}
