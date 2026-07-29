import { cn } from "@/lib/utils";

/** A rounded gradient avatar showing an account's initials. */
export function AccountAvatar({ name, className }: { name: string; className?: string }) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?";
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/60 font-semibold text-primary-foreground shadow-sm ring-1 ring-inset ring-white/10",
        className,
      )}
    >
      {initials}
    </div>
  );
}
