"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  Send,
  X,
  RefreshCw,
  Loader2,
  Search,
  ExternalLink,
  Sparkles,
  Users,
  Target,
  CalendarCheck,
  Trophy,
  Download,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  STAGES,
  stageLabel,
  intentLabel,
  QUALIFIED_STAGES,
  MEETING_STAGES,
} from "@/lib/pipeline";
import {
  approveReplyDraft,
  rejectReplyDraft,
  regenerateReplyDraft,
  setPipelineStage,
  importRepliedIntoPipeline,
} from "@/app/(dashboard)/pipeline/actions";

export type PipelineRow = {
  id: string;
  name: string;
  company: string | null;
  headline: string | null;
  accountName: string | null;
  profileUrl: string | null;
  stage: string;
  intent: string | null;
  meetingStatus: string;
  lastInboundText: string | null;
  lastInboundAt: string | null;
  lastOutboundText: string | null;
  updatedAt: string;
  draft: { id: string; objective: string | null; text: string; reason: string | null; suggestedStage: string | null } | null;
};

function initials(name: string) {
  return (
    name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?"
  );
}

const stageTone: Record<string, string> = {
  new_response: "bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300",
  engaging: "bg-indigo-100 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-300",
  qualifying: "bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300",
  meeting_opportunity: "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
  meeting_booked: "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
  discovery_completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
  proposal: "bg-cyan-100 text-cyan-700 dark:bg-cyan-400/15 dark:text-cyan-300",
  negotiation: "bg-cyan-100 text-cyan-700 dark:bg-cyan-400/15 dark:text-cyan-300",
  won: "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
  lost: "bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300",
};

export function PipelinePanel({
  rows,
  accounts,
}: {
  rows: PipelineRow[];
  accounts: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({}); // edited draft text by draftId
  const [busy, setBusy] = useState<string | null>(null);
  const [importAcct, setImportAcct] = useState(accounts[0]?.id ?? "");
  const [, start] = useTransition();

  const kpis = useMemo(() => {
    const inStage = (s: string[]) => rows.filter((r) => s.includes(r.stage)).length;
    return {
      total: rows.length,
      qualified: inStage(QUALIFIED_STAGES),
      meetings: inStage(MEETING_STAGES),
      won: rows.filter((r) => r.stage === "won").length,
      lost: rows.filter((r) => r.stage === "lost").length,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (stageFilter && r.stage !== stageFilter) return false;
      if (q && !`${r.name} ${r.company ?? ""} ${r.headline ?? ""}`.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [rows, query, stageFilter]);

  const needsReview = filtered.filter((r) => r.draft);

  function textFor(row: PipelineRow) {
    return row.draft ? (drafts[row.draft.id] ?? row.draft.text) : "";
  }

  function approve(row: PipelineRow) {
    if (!row.draft) return;
    setBusy(row.draft.id);
    approveReplyDraft(row.draft.id, textFor(row))
      .then((res) => {
        if (res.error) toast.error(res.error);
        else if (res.warning) toast.warning(res.warning);
        else toast.success(`Reply sent to ${row.name}`);
        router.refresh();
      })
      .finally(() => setBusy(null));
  }

  function reject(row: PipelineRow) {
    if (!row.draft) return;
    setBusy(row.draft.id);
    rejectReplyDraft(row.draft.id)
      .then(() => {
        toast.success("Draft rejected");
        router.refresh();
      })
      .finally(() => setBusy(null));
  }

  function regenerate(row: PipelineRow) {
    setBusy(row.id);
    regenerateReplyDraft(row.id)
      .then((res) => {
        if (res?.error) toast.error(res.error);
        else toast.success("Regenerated");
        router.refresh();
      })
      .finally(() => setBusy(null));
  }

  function changeStage(row: PipelineRow, stage: string) {
    start(async () => {
      await setPipelineStage(row.id, stage);
      router.refresh();
    });
  }

  const [importing, setImporting] = useState(false);
  function runImport() {
    if (!importAcct) return;
    setImporting(true);
    importRepliedIntoPipeline(importAcct)
      .then((res) => {
        if (res.error) toast.error(res.error);
        else toast.success(`Imported ${res.imported} replied conversation(s)`);
        router.refresh();
      })
      .finally(() => setImporting(false));
  }

  const kpiTiles = [
    { icon: Users, label: "In pipeline", value: kpis.total, tone: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
    { icon: Target, label: "Qualified", value: kpis.qualified, tone: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
    { icon: CalendarCheck, label: "Meetings", value: kpis.meetings, tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
    { icon: Trophy, label: "Won", value: kpis.won, tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  ];

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpiTiles.map((k) => (
          <Card key={k.label}>
            <CardContent className="flex items-center gap-3 py-4">
              <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", k.tone)}>
                <k.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-semibold tabular-nums">{k.value.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{k.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a person…" className="pl-8" />
        </div>
        <select
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
        >
          <option value="">All stages</option>
          {STAGES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        {accounts.length > 0 && (
          <div className="flex items-center gap-1">
            {accounts.length > 1 && (
              <select
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                value={importAcct}
                onChange={(e) => setImportAcct(e.target.value)}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            )}
            <Button variant="outline" size="sm" onClick={runImport} disabled={importing}>
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Import replied
            </Button>
          </div>
        )}
      </div>

      {/* Needs review */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Needs your review ({needsReview.length})
        </h2>
        {needsReview.length === 0 ? (
          <p className="rounded-lg border bg-muted/20 py-10 text-center text-sm text-muted-foreground">
            No drafts waiting. New replies will appear here with an AI draft. Use “Import replied” to
            pull in existing conversations.
          </p>
        ) : (
          <div className="space-y-3">
            {needsReview.map((row) => (
              <Card key={row.id}>
                <CardContent className="space-y-3 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <Avatar className="h-9 w-9 shrink-0">
                        <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
                          {initials(row.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="font-medium leading-tight">
                          {row.name}
                          {row.profileUrl && (
                            <a href={row.profileUrl} target="_blank" rel="noreferrer" className="ml-1 inline-flex text-primary">
                              <ExternalLink className="inline h-3 w-3" />
                            </a>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {row.company || row.headline || row.accountName}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", stageTone[row.stage])}>
                        {stageLabel(row.stage)}
                      </span>
                      <select
                        className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
                        value={row.stage}
                        onChange={(e) => changeStage(row, e.target.value)}
                      >
                        {STAGES.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>Intent: <span className="font-medium text-foreground">{intentLabel(row.intent)}</span></span>
                    {row.draft?.objective && <span>Objective: {row.draft.objective}</span>}
                  </div>

                  {row.lastInboundText && (
                    <div className="rounded-md border-l-2 border-muted-foreground/30 bg-muted/30 px-3 py-2 text-sm">
                      <span className="text-xs font-medium text-muted-foreground">They said:</span>{" "}
                      {row.lastInboundText}
                    </div>
                  )}

                  <Textarea
                    rows={4}
                    value={textFor(row)}
                    onChange={(e) => row.draft && setDrafts((p) => ({ ...p, [row.draft!.id]: e.target.value }))}
                    className="text-sm"
                    placeholder="AI could not draft this — write a reply…"
                  />
                  {row.draft?.reason && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Sparkles className="h-3.5 w-3.5" /> {row.draft.reason}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => approve(row)} disabled={busy === row.draft?.id || !textFor(row).trim()}>
                      {busy === row.draft?.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Approve &amp; send
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => regenerate(row)} disabled={busy === row.id}>
                      {busy === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      Regenerate
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => reject(row)} disabled={busy === row.draft?.id}>
                      <X className="h-4 w-4" /> Reject
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* All conversations */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          All conversations ({filtered.length})
        </h2>
        <div className="overflow-hidden rounded-lg border">
          <ul className="divide-y">
            {filtered.length === 0 ? (
              <li className="py-10 text-center text-sm text-muted-foreground">No one here yet.</li>
            ) : (
              filtered.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                  <Avatar className="h-7 w-7 shrink-0">
                    <AvatarFallback className="bg-primary/10 text-[10px] font-medium text-primary">
                      {initials(row.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{row.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.company || row.headline || row.accountName}
                    </p>
                  </div>
                  <span className="hidden text-xs text-muted-foreground sm:inline">
                    {intentLabel(row.intent)}
                  </span>
                  {row.draft && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                      draft ready
                    </span>
                  )}
                  <select
                    className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
                    value={row.stage}
                    onChange={(e) => changeStage(row, e.target.value)}
                  >
                    {STAGES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(row.updatedAt), { addSuffix: true })}
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>
      </section>
    </div>
  );
}
