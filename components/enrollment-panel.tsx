"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { UserPlus, Loader2, Zap, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/status-pill";
import { enrollMatchingIcp } from "@/app/(dashboard)/campaigns/actions";

/** When the next action for this enrollment is scheduled, in words + urgency. */
function scheduleLabel(
  state: string,
  nextRunAt: string | null,
): { text: string; due: boolean } | null {
  if (["replied", "completed", "skipped", "failed"].includes(state)) return null;
  if (state === "awaiting_accept") return { text: "awaiting acceptance", due: false };
  if (state === "paused") return { text: "awaiting review", due: false };
  if (!nextRunAt) return null;
  const when = new Date(nextRunAt);
  if (when.getTime() <= Date.now()) return { text: "due now", due: true };
  return { text: `in ${formatDistanceToNow(when)}`, due: false };
}

export function EnrollmentPanel({
  campaignId,
  hasIcp,
  autoEnroll,
  matchCount,
  enrolled,
}: {
  campaignId: string;
  hasIcp: boolean;
  autoEnroll: boolean;
  matchCount: number | null;
  enrolled: {
    enrollmentId: string;
    state: string;
    name: string;
    headline: string | null;
    nextRunAt: string | null;
  }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function enroll() {
    start(async () => {
      try {
        const res = await enrollMatchingIcp(campaignId);
        const parts = [`Enrolled ${res.enrolled}`];
        if (res.skipped > 0) parts.push(`${res.skipped} already in this campaign`);
        if (res.matched > res.enrolled + res.skipped) parts.push("first 1000 per run");
        toast.success(parts.join(" · "));
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Enroll failed");
      }
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Add connections into this campaign. Enroll everyone matching your ICP, or pick people
        manually from the Connections page.
      </p>
      {autoEnroll && (
        <div className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
          <Zap className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>
            Auto-enroll is <span className="font-medium">on</span> — matching connections are added
            automatically in the background. You can still enroll now to fill the queue immediately.
          </span>
        </div>
      )}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={enroll} disabled={pending || (matchCount ?? 0) === 0}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            {hasIcp ? "Enroll matching" : "Enroll all"}
            {matchCount !== null ? ` (${matchCount.toLocaleString()})` : ""}
          </Button>
          <Button variant="outline" render={<Link href="/connections" />}>
            Enroll manually
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {hasIcp
            ? "Targets connections matching your ICP."
            : "No ICP set — this targets your whole network on this account."}{" "}
          People already in this campaign are skipped unless &ldquo;multi DMs&rdquo; is on.
        </p>

        <div>
          <h4 className="mb-2 text-sm font-medium">
            Enrolled {enrolled.length > 0 ? `(showing ${enrolled.length})` : ""}
          </h4>
          {enrolled.length === 0 ? (
            <p className="text-sm text-muted-foreground">No one enrolled yet.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {enrolled.map((e) => {
                const sched = scheduleLabel(e.state, e.nextRunAt);
                return (
                  <li key={e.enrollmentId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{e.name}</p>
                      {e.headline && (
                        <p className="truncate text-xs text-muted-foreground">{e.headline}</p>
                      )}
                    </div>
                    {sched && (
                      <span
                        className={
                          "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs " +
                          (sched.due
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "text-muted-foreground")
                        }
                      >
                        <Clock className="h-3 w-3" />
                        {sched.text}
                      </span>
                    )}
                    <StatusPill status={e.state} className="shrink-0" />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
