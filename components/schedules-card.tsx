"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, CalendarClock, CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setupSchedules } from "@/app/(dashboard)/settings/actions";
import type { ScheduleInfo } from "@/lib/qstash";

export function SchedulesCard({ schedules }: { schedules: ScheduleInfo[] }) {
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const KNOWN: { match: string; label: string }[] = [
    { match: "/api/jobs/send", label: "send tick" },
    { match: "/api/jobs/auto-enroll", label: "auto-enroll" },
    { match: "/api/jobs/auto-enrich", label: "auto-enrich" },
    { match: "/api/jobs/poll-acceptance", label: "acceptance poll" },
  ];
  const labelFor = (destination: string) =>
    KNOWN.find((k) => destination.includes(k.match))?.label ?? "job";

  const active = schedules.filter((s) => KNOWN.some((k) => s.destination.includes(k.match)));
  const configured = KNOWN.every((k) => schedules.some((s) => s.destination.includes(k.match)));

  function run() {
    setBusy(true);
    start(async () => {
      const res = await setupSchedules();
      setBusy(false);
      if (res.ok) {
        toast.success(res.message);
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {configured ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        ) : (
          <Circle className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="text-sm text-muted-foreground">
          {configured ? "Schedules active" : "Not set up yet"}
        </span>
      </div>

      {active.length > 0 && (
        <ul className="space-y-1 text-sm">
          {active.map((s) => (
            <li key={s.id} className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              <code className="text-xs">{s.cron}</code>
              <span className="text-muted-foreground">{labelFor(s.destination)}</span>
            </li>
          ))}
        </ul>
      )}

      <Button size="sm" variant="outline" onClick={run} disabled={pending || busy}>
        {pending || busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
        {configured ? "Refresh schedules" : "Set up background schedules"}
      </Button>
    </div>
  );
}
