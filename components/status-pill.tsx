import { statusPillClasses, relationshipStatusLabel } from "@/lib/status";
import { cn } from "@/lib/utils";

export function StatusPill({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
        statusPillClasses(status),
        className,
      )}
    >
      {relationshipStatusLabel(status)}
    </span>
  );
}
