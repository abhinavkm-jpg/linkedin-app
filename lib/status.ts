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

export function enrollmentStateTone(state: string): BadgeVariant {
  if (state === "replied") return "default";
  if (state === "failed") return "destructive";
  if (state === "completed") return "secondary";
  return "outline";
}
