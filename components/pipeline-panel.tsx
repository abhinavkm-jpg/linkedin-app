"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  Loader2,
  Download,
  MessageSquare,
  Search,
  SlidersHorizontal,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Users,
  Target,
  CalendarCheck,
  Trophy,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { intentLabel, stageTone, QUALIFIED_STAGES, MEETING_STAGES } from "@/lib/pipeline";
import {
  setPipelineStage,
  importRepliedIntoPipeline,
  addPipelineStage,
  deletePipelineStage,
  setPipelineStageHidden,
  type StageConfig,
} from "@/app/(dashboard)/pipeline/actions";
import { getChatThread, type ThreadMessage } from "@/app/(dashboard)/inbox/actions";

export type PipelineRow = {
  id: string;
  name: string;
  company: string | null;
  headline: string | null;
  position: string | null;
  country: string | null;
  accountName: string | null;
  stage: string;
  intent: string | null;
  meetingStatus: string;
  lastInboundAt: string | null;
  lastInboundText: string | null;
  lastOutboundText: string | null;
  updatedAt: string | null;
  profileUrl: string | null;
  chatInternalId: string | null;
};

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
}

const intentTone: Record<string, string> = {
  interested: "bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300",
  problem_identified: "bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300",
  qualified_opportunity: "bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300",
  meeting_ready: "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
  question: "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
  objection: "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
  not_interested: "bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300",
  not_relevant: "bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300",
  unclear: "bg-slate-100 text-slate-600 dark:bg-slate-400/15 dark:text-slate-200",
};

export function PipelineBoard({
  rows,
  accounts,
  stages,
}: {
  rows: PipelineRow[];
  accounts: { id: string; name: string }[];
  stages: StageConfig[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<PipelineRow[]>(rows);
  const [query, setQuery] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [importAcct, setImportAcct] = useState(accounts[0]?.id ?? "");
  const [importing, setImporting] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [selected, setSelected] = useState<PipelineRow | null>(null);

  const visibleStages = stages.filter((s) => !s.hidden);
  const labelOf = (v: string) => stages.find((s) => s.value === v)?.label ?? v;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((r) =>
      `${r.name} ${r.company ?? ""} ${r.headline ?? ""}`.toLowerCase().includes(q),
    );
  }, [items, query]);

  const byStage = useMemo(() => {
    const map = new Map<string, PipelineRow[]>();
    for (const s of stages) map.set(s.value, []);
    for (const r of filtered) {
      if (!map.has(r.stage)) map.set(r.stage, []);
      map.get(r.stage)!.push(r);
    }
    return map;
  }, [filtered, stages]);

  const kpis = {
    total: rows.length,
    qualified: rows.filter((r) => (QUALIFIED_STAGES as string[]).includes(r.stage)).length,
    meetings: rows.filter((r) => (MEETING_STAGES as string[]).includes(r.stage)).length,
    won: rows.filter((r) => r.stage === "won").length,
  };
  const kpiTiles = [
    { icon: Users, label: "Leads in pipeline", value: kpis.total, tone: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
    { icon: Target, label: "Qualified", value: kpis.qualified, tone: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
    { icon: CalendarCheck, label: "Meetings", value: kpis.meetings, tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
    { icon: Trophy, label: "Won", value: kpis.won, tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  ];

  function move(id: string, stage: string) {
    const row = items.find((r) => r.id === id);
    if (!row || row.stage === stage) return;
    setItems((prev) => prev.map((r) => (r.id === id ? { ...r, stage } : r)));
    setPipelineStage(id, stage)
      .then(() => router.refresh())
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : "Move failed");
        setItems((prev) => prev.map((r) => (r.id === id ? { ...r, stage: row.stage } : r)));
      });
  }

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

  return (
    <div className="space-y-4">
      {/* Count boxes */}
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

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a lead…" className="pl-8" />
        </div>
        <Button variant="outline" size="sm" onClick={() => setManageOpen(true)}>
          <SlidersHorizontal className="h-4 w-4" /> Manage pipeline
        </Button>
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

      {/* Board */}
      <div className="flex gap-3 overflow-x-auto pb-3">
        {visibleStages.map((s) => {
          const cards = byStage.get(s.value) ?? [];
          return (
            <div
              key={s.value}
              onDragOver={(e) => {
                e.preventDefault();
                setOverStage(s.value);
              }}
              onDragLeave={() => setOverStage((cur) => (cur === s.value ? null : cur))}
              onDrop={() => {
                if (dragId) move(dragId, s.value);
                setDragId(null);
                setOverStage(null);
              }}
              className={cn(
                "flex w-72 shrink-0 flex-col rounded-lg border bg-muted/20 transition-colors",
                overStage === s.value && "border-primary/50 bg-primary/[0.04]",
              )}
            >
              <div className="flex items-center justify-between border-b px-3 py-2">
                <span className="text-sm font-medium">{s.label}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
                  {cards.length}
                </span>
              </div>
              {/* ~5 cards tall, then scroll */}
              <div className="max-h-[30rem] space-y-2 overflow-y-auto p-2">
                {cards.map((r) => (
                  <div
                    key={r.id}
                    draggable
                    onDragStart={() => setDragId(r.id)}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverStage(null);
                    }}
                    onClick={() => setSelected(r)}
                    className={cn(
                      "group cursor-pointer rounded-lg border bg-card p-3 shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing",
                      dragId === r.id && "opacity-50",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarFallback className="bg-primary/10 text-[10px] font-medium text-primary">
                          {initials(r.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{r.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {r.company || r.headline || r.accountName}
                        </p>
                      </div>
                    </div>

                    {r.intent && (
                      <span
                        className={cn(
                          "mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium",
                          intentTone[r.intent] ?? intentTone.unclear,
                        )}
                      >
                        {intentLabel(r.intent)}
                      </span>
                    )}

                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-muted-foreground">
                        {r.lastInboundAt
                          ? `replied ${formatDistanceToNow(new Date(r.lastInboundAt), { addSuffix: true })}`
                          : "—"}
                      </span>
                      {r.chatInternalId && (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          title="Open chat in Inbox"
                          aria-label="Open chat in Inbox"
                          onClick={(e) => e.stopPropagation()}
                          render={<Link href={`/inbox?c=${r.chatInternalId}`} />}
                        >
                          <MessageSquare className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {cards.length === 0 && (
                  <p className="px-1 py-4 text-center text-xs text-muted-foreground/60">Drop here</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <ManageDialog open={manageOpen} onOpenChange={setManageOpen} stages={stages} labelOf={labelOf} />
      <LeadDetailDialog
        key={selected?.id ?? "none"}
        row={selected}
        stages={visibleStages}
        onClose={() => setSelected(null)}
        onChanged={() => router.refresh()}
      />
    </div>
  );
}

function LeadDetailDialog({
  row,
  stages,
  onClose,
  onChanged,
}: {
  row: PipelineRow | null;
  stages: StageConfig[];
  onClose: () => void;
  onChanged: () => void;
}) {
  // Keyed by row id in the parent, so this mounts fresh per lead — no need to
  // reset state synchronously inside the effect.
  const [messages, setMessages] = useState<ThreadMessage[] | null>(null);
  const [, start] = useTransition();
  const chatId = row?.chatInternalId ?? null;

  useEffect(() => {
    if (!chatId) return;
    let cancelled = false;
    getChatThread(chatId).then((res) => {
      if (!cancelled) setMessages(res.messages ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [chatId]);

  if (!row) return null;
  const loading = !!chatId && messages === null;

  const info: { label: string; value: string | null }[] = [
    { label: "Company", value: row.company },
    { label: "Title", value: row.position || row.headline },
    { label: "Country", value: row.country },
    { label: "Account", value: row.accountName },
    { label: "Intent", value: intentLabel(row.intent) },
    { label: "Replied", value: row.lastInboundAt ? formatDistanceToNow(new Date(row.lastInboundAt), { addSuffix: true }) : null },
  ];

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader className="flex-row items-start gap-3 space-y-0 pr-8">
          <Avatar className="h-11 w-11 shrink-0">
            <AvatarFallback className="bg-primary/10 font-medium text-primary">
              {initials(row.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle className="truncate">{row.name}</DialogTitle>
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", stageTone(row.stage))}>
                {stages.find((s) => s.value === row.stage)?.label ?? row.stage}
              </span>
            </div>
            <DialogDescription className="truncate">
              {row.headline || row.company || row.accountName}
            </DialogDescription>
            {row.profileUrl && (
              <a
                href={row.profileUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                LinkedIn profile <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </DialogHeader>

        {/* Info grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {info
            .filter((i) => i.value)
            .map((i) => (
              <div key={i.label} className="rounded-md border bg-muted/20 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{i.label}</p>
                <p className="truncate text-sm">{i.value}</p>
              </div>
            ))}
        </div>

        {/* Stage control */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Move to stage</span>
          <select
            className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
            value={row.stage}
            onChange={(e) => start(async () => { await setPipelineStage(row.id, e.target.value); onChanged(); })}
          >
            {stages.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          {chatId && (
            <Button
              size="sm"
              variant="outline"
              className="ml-auto"
              render={<Link href={`/inbox?c=${chatId}`} />}
            >
              <MessageSquare className="h-4 w-4" /> Reply in Inbox
            </Button>
          )}
        </div>

        {/* Conversation */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Conversation
          </p>
          <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border bg-muted/20 p-3">
            {loading ? (
              <p className="flex items-center gap-1 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading conversation…
              </p>
            ) : messages && messages.length > 0 ? (
              messages.map((m) => (
                <div key={m.id} className={cn("flex", m.mine ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm shadow-sm",
                      m.mine
                        ? "rounded-br-sm bg-primary text-primary-foreground"
                        : "rounded-bl-sm bg-card ring-1 ring-border",
                    )}
                  >
                    {m.text}
                  </div>
                </div>
              ))
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {chatId ? "No messages to show." : "No chat linked yet."}
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ManageDialog({
  open,
  onOpenChange,
  stages,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  stages: StageConfig[];
  labelOf: (v: string) => string;
}) {
  const router = useRouter();
  const [newLabel, setNewLabel] = useState("");
  const [pending, start] = useTransition();

  function run(fn: () => Promise<unknown>, ok?: string) {
    start(async () => {
      try {
        const res = (await fn()) as { error?: string } | void;
        if (res && "error" in res && res.error) toast.error(res.error);
        else if (ok) toast.success(ok);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manage pipeline stages</DialogTitle>
          <DialogDescription>
            Show or hide columns, add your own stages, or delete custom ones. Built-in stages can be
            hidden but not deleted.
          </DialogDescription>
        </DialogHeader>

        <ul className="divide-y rounded-md border">
          {stages.map((s) => (
            <li key={s.value} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="flex items-center gap-2">
                <button
                  type="button"
                  title={s.hidden ? "Show column" : "Hide column"}
                  onClick={() => run(() => setPipelineStageHidden(s.value, !s.hidden))}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {s.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                <span className={cn(s.hidden && "text-muted-foreground line-through")}>{s.label}</span>
                {!s.isBase && (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    custom
                  </span>
                )}
              </span>
              <span className="flex items-center gap-2">
                <Switch
                  checked={!s.hidden}
                  onCheckedChange={(v) => run(() => setPipelineStageHidden(s.value, !v))}
                  disabled={pending}
                />
                {!s.isBase && (
                  <button
                    type="button"
                    title="Delete stage"
                    onClick={() => run(() => deletePipelineStage(s.value), "Stage deleted")}
                    disabled={pending}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>

        <div className="flex gap-2">
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="New stage name (e.g. Nurture)"
          />
          <Button
            size="sm"
            disabled={pending || !newLabel.trim()}
            onClick={() =>
              run(async () => {
                await addPipelineStage(newLabel);
                setNewLabel("");
              }, "Stage added")
            }
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
