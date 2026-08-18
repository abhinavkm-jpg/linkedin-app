"use client";

import { Fragment, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ChevronRight, ChevronLeft, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusPill } from "@/components/status-pill";
import { cn } from "@/lib/utils";

export type Recipient = {
  enrollmentId: string;
  connectionId: string;
  name: string;
  company: string | null;
  headline: string | null;
  state: string;
  currentStep: number;
  nextRunAt: string | null;
  lastError: string | null;
  updatedAt: string;
};

export type RecipientActivity = {
  connectionId: string;
  type: "invite" | "message" | "enrich" | "sync";
  status: string;
  content: string | null;
  createdAt: string;
};

const MESSAGE_TOUCHES = ["Welcome", "Follow-up 1", "Follow-up 2", "Follow-up 3"];

/** Label an activity by its touch, mirroring the send-time stage mapping. */
function labelTimeline(acts: RecipientActivity[]): (RecipientActivity & { touch: string })[] {
  let msgIdx = 0;
  return acts.map((a) => {
    if (a.type === "invite") return { ...a, touch: "Connection request" };
    if (a.type === "message") {
      const touch = MESSAGE_TOUCHES[msgIdx] ?? `Follow-up ${msgIdx}`;
      msgIdx += 1;
      return { ...a, touch };
    }
    return { ...a, touch: a.type };
  });
}

function scheduleLabel(state: string, nextRunAt: string | null): string | null {
  if (["replied", "completed", "skipped", "failed"].includes(state)) return null;
  if (state === "awaiting_accept") return "awaiting acceptance";
  if (state === "paused") return "awaiting review";
  if (!nextRunAt) return null;
  const when = new Date(nextRunAt);
  if (when.getTime() <= Date.now()) return "due now";
  return `in ${formatDistanceToNow(when)}`;
}

function activityTone(status: string): string {
  switch (status) {
    case "success":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300";
    case "failed":
      return "bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300";
    case "throttled":
      return "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300";
    default:
      return "bg-slate-100 text-slate-600 dark:bg-slate-400/15 dark:text-slate-200";
  }
}

type FilterKey = "all" | "contacted" | "replied" | "attention";

const PAGE_SIZE = 20;

// Enrollment states that mean an invite/message was already sent — used to
// derive "contacted" from state when activity history isn't fully loaded.
const CONTACTED_STATES = new Set([
  "awaiting_accept",
  "accepted",
  "messaging",
  "messaged",
  "in_followup",
  "replied",
  "completed",
]);

export function CampaignRecipients({
  recipients,
  activities,
  stepCount,
  counts: serverCounts,
  totalRecipients,
}: {
  recipients: Recipient[];
  activities: RecipientActivity[];
  stepCount: number;
  /** True totals across ALL enrollments (not just the loaded slice). */
  counts?: { all: number; contacted: number; replied: number; attention: number };
  totalRecipients?: number;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  // Group activities by connection (input already ordered oldest → newest).
  const byConnection = useMemo(() => {
    const map = new Map<string, RecipientActivity[]>();
    for (const a of activities) {
      const list = map.get(a.connectionId) ?? [];
      list.push(a);
      map.set(a.connectionId, list);
    }
    return map;
  }, [activities]);

  const enriched = useMemo(
    () =>
      recipients.map((r) => {
        const acts = byConnection.get(r.connectionId) ?? [];
        const sent = acts.filter((a) => a.status === "success");
        const last = acts[acts.length - 1];
        const timeline = labelTimeline(acts);
        return {
          ...r,
          acts,
          timeline,
          sentCount: sent.length,
          lastTouch: [...timeline].reverse().find((t) => t.status === "success")?.touch ?? null,
          lastAt: last?.createdAt ?? null,
          contacted: sent.length > 0 || CONTACTED_STATES.has(r.state),
          attention: r.state === "failed" || !!r.lastError,
        };
      }),
    [recipients, byConnection],
  );

  // Prefer server-computed totals (across ALL enrollments) so the chips match
  // the Progress panel; fall back to counting the loaded slice.
  const counts = useMemo(
    () =>
      serverCounts ?? {
        all: enriched.length,
        contacted: enriched.filter((r) => r.contacted).length,
        replied: enriched.filter((r) => r.state === "replied").length,
        attention: enriched.filter((r) => r.attention).length,
      },
    [enriched, serverCounts],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return enriched.filter((r) => {
      if (filter === "contacted" && !r.contacted) return false;
      if (filter === "replied" && r.state !== "replied") return false;
      if (filter === "attention" && !r.attention) return false;
      if (q && !`${r.name} ${r.company ?? ""} ${r.headline ?? ""}`.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [enriched, filter, query]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageRows = rows.slice(start, start + PAGE_SIZE);

  function setFilterReset(key: FilterKey) {
    setFilter(key);
    setPage(1);
  }
  function setQueryReset(v: string) {
    setQuery(v);
    setPage(1);
  }

  const chips: { key: FilterKey; label: string }[] = [
    { key: "all", label: "All" },
    { key: "contacted", label: "Contacted" },
    { key: "replied", label: "Replied" },
    { key: "attention", label: "Needs attention" },
  ];

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <Users className="h-4 w-4" /> Recipients
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {(totalRecipients ?? recipients.length).toLocaleString()}
          </span>
        </h2>
        <div className="relative w-56 max-w-full">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQueryReset(e.target.value)}
            placeholder="Search a person…"
            className="h-9 pl-8"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <button
            key={c.key}
            onClick={() => setFilterReset(c.key)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              filter === c.key
                ? "border-primary bg-primary text-primary-foreground"
                : "hover:bg-muted",
            )}
          >
            {c.label}
            <span className={cn("ml-1", filter === c.key ? "opacity-80" : "text-muted-foreground")}>
              {counts[c.key]}
            </span>
          </button>
        ))}
      </div>

      {totalRecipients !== undefined && recipients.length < totalRecipients && (
        <p className="text-xs text-muted-foreground">
          Showing the {recipients.length.toLocaleString()} most active of{" "}
          {totalRecipients.toLocaleString()} enrolled (replied, mid-sequence, and needs-attention
          first). Tab counts above reflect the full campaign.
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Person</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Sent</TableHead>
              <TableHead>Last activity</TableHead>
              <TableHead>Next</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  {recipients.length === 0
                    ? "No one is enrolled in this campaign yet."
                    : "No recipients match this filter."}
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((r) => {
                const open = openId === r.enrollmentId;
                const schedule = scheduleLabel(r.state, r.nextRunAt);
                const initials =
                  r.name
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((w) => w[0]?.toUpperCase())
                    .join("") || "?";
                return (
                  <Fragment key={r.enrollmentId}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() => setOpenId(open ? null : r.enrollmentId)}
                    >
                      <TableCell>
                        <ChevronRight
                          className={cn(
                            "h-4 w-4 text-muted-foreground transition-transform",
                            open && "rotate-90",
                          )}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <Avatar className="h-7 w-7 shrink-0">
                            <AvatarFallback className="bg-primary/10 text-[10px] font-medium text-primary">
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="whitespace-nowrap font-medium">{r.name}</p>
                            {(r.company || r.headline) && (
                              <p className="max-w-[16rem] truncate text-xs text-muted-foreground">
                                {r.company || r.headline}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusPill status={r.state} />
                        {r.attention && r.lastError && (
                          <p className="mt-0.5 max-w-[14rem] truncate text-xs text-rose-600" title={r.lastError}>
                            {r.lastError}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {r.sentCount > 0 ? (
                          <span>
                            <span className="font-medium tabular-nums">{r.sentCount}</span>
                            <span className="text-muted-foreground">
                              /{stepCount || r.sentCount}
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {r.lastAt ? (
                          <span>
                            {r.lastTouch && <span className="text-foreground">{r.lastTouch}</span>}{" "}
                            {formatDistanceToNow(new Date(r.lastAt), { addSuffix: true })}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {schedule ?? "—"}
                      </TableCell>
                    </TableRow>

                    {open && (
                      <TableRow className="bg-muted/20 hover:bg-muted/20">
                        <TableCell />
                        <TableCell colSpan={5} className="py-3">
                          {r.timeline.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              Nothing sent yet — {schedule ? `next action ${schedule}.` : "queued."}
                            </p>
                          ) : (
                            <ol className="space-y-2">
                              {r.timeline.map((t, i) => (
                                <li key={i} className="rounded-md border bg-background p-2.5">
                                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                                    <span className="font-medium">{t.touch}</span>
                                    <span
                                      className={cn(
                                        "rounded-full px-2 py-0.5 font-medium",
                                        activityTone(t.status),
                                      )}
                                    >
                                      {t.status}
                                    </span>
                                    <span className="text-muted-foreground">
                                      {formatDistanceToNow(new Date(t.createdAt), { addSuffix: true })}
                                    </span>
                                  </div>
                                  {t.content && (
                                    <p className="whitespace-pre-wrap text-sm text-foreground/90">
                                      {t.content}
                                    </p>
                                  )}
                                </li>
                              ))}
                            </ol>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {rows.length > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Showing {start + 1}–{Math.min(start + PAGE_SIZE, rows.length)} of{" "}
            {rows.length.toLocaleString()}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(currentPage - 1)}
              disabled={currentPage <= 1}
            >
              <ChevronLeft className="h-4 w-4" /> Prev
            </Button>
            <span className="text-xs text-muted-foreground tabular-nums">
              Page {currentPage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(currentPage + 1)}
              disabled={currentPage >= totalPages}
            >
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
