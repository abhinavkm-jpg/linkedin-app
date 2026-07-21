import { statusPillClasses, relationshipStatusLabel } from "@/lib/status";

export function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusPillClasses(status)}`}
    >
      {relationshipStatusLabel(status)}
    </span>
  );
}
