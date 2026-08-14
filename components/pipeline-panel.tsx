"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Loader2, Download, MessageSquare, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { STAGES, intentLabel } from "@/lib/pipeline";
import { setPipelineStage, importRepliedIntoPipeline } from "@/app/(dashboard)/pipeline/actions";

export type PipelineRow = {
  id: string;
  name: string;
  company: string | null;
  headline: string | null;
  accountName: string | null;
  stage: string;
  intent: string | null;
  lastInboundAt: string | null;
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
}: {
  rows: PipelineRow[];
  accounts: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<PipelineRow[]>(rows);
  const [query, setQuery] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [importAcct, setImportAcct] = useState(accounts[0]?.id ?? "");
  const [importing, setImporting] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((r) =>
      `${r.name} ${r.company ?? ""} ${r.headline ?? ""}`.toLowerCase().includes(q),
    );
  }, [items, query]);

  const byStage = useMemo(() => {
    const map = new Map<string, PipelineRow[]>();
    for (const s of STAGES) map.set(s.value, []);
    for (const r of filtered) (map.get(r.stage) ?? map.set(r.stage, []).get(r.stage)!).push(r);
    return map;
  }, [filtered]);

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
      {/* Slim toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a lead…" className="pl-8" />
        </div>
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
        {STAGES.map((s) => {
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
              <div className="min-h-16 space-y-2 p-2">
                {cards.map((r) => (
                  <div
                    key={r.id}
                    draggable
                    onDragStart={() => setDragId(r.id)}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverStage(null);
                    }}
                    className={cn(
                      "group cursor-grab rounded-lg border bg-card p-3 shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing",
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
    </div>
  );
}
