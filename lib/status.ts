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
  const map: Record<string, string> = {
    // relationship statuses
    connection: "bg-slate-100 text-slate-600",
    not_connected: "bg-slate-100 text-slate-500",
    invite_queued: "bg-amber-100 text-amber-700",
    invited: "bg-amber-100 text-amber-700",
    pending: "bg-amber-100 text-amber-700",
    accepted: "bg-blue-100 text-blue-700",
    messaged: "bg-indigo-100 text-indigo-700",
    replied: "bg-emerald-100 text-emerald-700",
    do_not_contact: "bg-rose-100 text-rose-700",
    // enrollment states (extra)
    queued: "bg-slate-100 text-slate-600",
    enriching: "bg-cyan-100 text-cyan-700",
    invite_pending: "bg-amber-100 text-amber-700",
    awaiting_accept: "bg-amber-100 text-amber-700",
    messaging: "bg-blue-100 text-blue-700",
    in_followup: "bg-violet-100 text-violet-700",
    completed: "bg-emerald-100 text-emerald-700",
    failed: "bg-rose-100 text-rose-700",
    skipped: "bg-slate-100 text-slate-500",
    paused: "bg-amber-100 text-amber-700",
  };
  return map[status] ?? "bg-slate-100 text-slate-600";
}

export function enrollmentStateTone(state: string): BadgeVariant {
  if (state === "replied") return "default";
  if (state === "failed") return "destructive";
  if (state === "completed") return "secondary";
  return "outline";
}
