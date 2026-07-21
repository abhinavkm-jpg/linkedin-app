import { Users, Send, MessageSquare, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { relationshipStatusLabel } from "@/lib/status";

// Solid segment/legend colors per enrollment state (matches the status pills' hues).
const SEGMENT: Record<string, { bar: string; dot: string }> = {
  queued: { bar: "bg-slate-400", dot: "bg-slate-400" },
  enriching: { bar: "bg-cyan-500", dot: "bg-cyan-500" },
  messaging: { bar: "bg-blue-500", dot: "bg-blue-500" },
  awaiting_accept: { bar: "bg-amber-500", dot: "bg-amber-500" },
  accepted: { bar: "bg-blue-500", dot: "bg-blue-500" },
  in_followup: { bar: "bg-violet-500", dot: "bg-violet-500" },
  messaged: { bar: "bg-indigo-500", dot: "bg-indigo-500" },
  replied: { bar: "bg-emerald-500", dot: "bg-emerald-500" },
  completed: { bar: "bg-emerald-500", dot: "bg-emerald-500" },
  skipped: { bar: "bg-slate-300", dot: "bg-slate-300" },
  failed: { bar: "bg-rose-500", dot: "bg-rose-500" },
  paused: { bar: "bg-amber-400", dot: "bg-amber-400" },
};

const KPI_TONES = {
  blue: "bg-blue-50 text-blue-600 ring-blue-100",
  violet: "bg-violet-50 text-violet-600 ring-violet-100",
  emerald: "bg-emerald-50 text-emerald-600 ring-emerald-100",
  amber: "bg-amber-50 text-amber-600 ring-amber-100",
} as const;

export function CampaignFunnel({
  stateCounts,
  enrolled,
  contacted,
  replied,
  completed,
}: {
  stateCounts: { state: string; n: number }[];
  enrolled: number;
  contacted: number;
  replied: number;
  completed: number;
}) {
  const total = stateCounts.reduce((sum, s) => sum + s.n, 0);
  const segments = stateCounts.filter((s) => s.n > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Progress</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* KPI row */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi icon={Users} tone="blue" label="Enrolled" value={enrolled} />
          <Kpi icon={Send} tone="violet" label="Contacted" value={contacted} />
          <Kpi icon={MessageSquare} tone="emerald" label="Replied" value={replied} />
          <Kpi icon={CheckCircle2} tone="amber" label="Completed" value={completed} />
        </div>

        {/* Segmented state distribution */}
        {total > 0 ? (
          <div className="space-y-2">
            <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full bg-muted">
              {segments.map((s) => (
                <div
                  key={s.state}
                  className={SEGMENT[s.state]?.bar ?? "bg-slate-400"}
                  style={{ width: `${(s.n / total) * 100}%` }}
                  title={`${relationshipStatusLabel(s.state)}: ${s.n}`}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {segments.map((s) => (
                <div key={s.state} className="flex items-center gap-1.5 text-xs">
                  <span className={`h-2.5 w-2.5 rounded-full ${SEGMENT[s.state]?.dot ?? "bg-slate-400"}`} />
                  <span className="text-muted-foreground">{relationshipStatusLabel(s.state)}</span>
                  <span className="font-medium tabular-nums">{s.n}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No one enrolled yet — set your ICP and enroll connections below.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Kpi({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: keyof typeof KPI_TONES;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5">
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ring-4 ${KPI_TONES[tone]}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-xl font-semibold tabular-nums tracking-tight">{value.toLocaleString()}</p>
        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
