"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save, Sparkles, Play, AlertTriangle, RotateCcw, Mic, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  saveAccountPromptSet,
  setAccountDefaultPrompt,
  setAccountReplyStrategy,
} from "@/app/(dashboard)/accounts/actions";
import { previewAiMessage } from "@/app/(dashboard)/templates/actions";
import { ConnectionPicker, type PickedConnection } from "@/components/connection-picker";
import { STAGE_STARTER_PROMPTS } from "@/lib/ai/prompts";
import type { OutreachStep } from "@/lib/ai/generate";

const STAGES: { stage: OutreachStep; label: string; hint: string; content: boolean }[] = [
  { stage: "connection_request", label: "Connection request", hint: "The invite note when first connecting.", content: false },
  { stage: "welcome", label: "Welcome", hint: "First message right after they accept.", content: false },
  { stage: "follow_up_1", label: "Follow-up 1", hint: "One insight + a single open question.", content: false },
  { stage: "follow_up_2", label: "Follow-up 2", hint: "Go deeper. Shares an article by default.", content: true },
  { stage: "follow_up_3", label: "Follow-up 3", hint: "Polite breakup. Shares an article.", content: true },
];

type Entry = { promptText: string; shareContent: boolean };
type Preview = {
  loading: boolean;
  text?: string;
  banned?: string[];
  error?: string;
  contentMissing?: boolean;
};

export function PromptSetPanel({
  accountId,
  accountName,
  defaultPrompt,
  replyStrategy,
  initial,
}: {
  accountId: string;
  accountName: string;
  defaultPrompt: string;
  replyStrategy: string;
  initial: { stage: string; promptText: string | null; shareContent: boolean }[];
}) {
  const router = useRouter();

  // The shared VOICE (identity + rules) for this account. Applies to every stage.
  const [voice, setVoice] = useState(defaultPrompt);
  const [savingVoice, setSavingVoice] = useState(false);

  // Reply/pipeline sales strategy (offer + qualification) — reply drafts only.
  const [strategy, setStrategy] = useState(replyStrategy);
  const [savingStrategy, setSavingStrategy] = useState(false);

  // Per-stage TASK — only what that message does. Seeded from short starters.
  const [entries, setEntries] = useState<Record<string, Entry>>(() => {
    const map: Record<string, Entry> = {};
    for (const s of STAGES) {
      const row = initial.find((r) => r.stage === s.stage);
      map[s.stage] = {
        promptText: row?.promptText ?? STAGE_STARTER_PROMPTS[s.stage] ?? "",
        shareContent: row?.shareContent ?? s.content,
      };
    }
    return map;
  });
  const [savingAll, setSavingAll] = useState(false);
  const [savingStage, setSavingStage] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, Preview>>({});
  const [picked, setPicked] = useState<PickedConnection | null>(null);

  function update(stage: string, patch: Partial<Entry>) {
    setEntries((prev) => ({ ...prev, [stage]: { ...prev[stage], ...patch } }));
  }

  function saveVoice() {
    setSavingVoice(true);
    setAccountDefaultPrompt(accountId, voice)
      .then(() => {
        toast.success("Voice saved");
        router.refresh();
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Save failed"))
      .finally(() => setSavingVoice(false));
  }

  function saveStrategy() {
    setSavingStrategy(true);
    setAccountReplyStrategy(accountId, strategy)
      .then(() => {
        toast.success("Reply strategy saved");
        router.refresh();
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Save failed"))
      .finally(() => setSavingStrategy(false));
  }

  function persist(stages: { stage: string; promptText: string | null; shareContent: boolean }[]) {
    return saveAccountPromptSet(accountId, stages).then(() => router.refresh());
  }

  function saveAll() {
    setSavingAll(true);
    persist(
      STAGES.map((s) => ({
        stage: s.stage,
        promptText: entries[s.stage]?.promptText || null,
        shareContent: !!entries[s.stage]?.shareContent,
      })),
    )
      .then(() => toast.success("All stages saved"))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Save failed"))
      .finally(() => setSavingAll(false));
  }

  function saveStage(stage: string) {
    setSavingStage(stage);
    persist([
      {
        stage,
        promptText: entries[stage]?.promptText || null,
        shareContent: !!entries[stage]?.shareContent,
      },
    ])
      .then(() => toast.success("Stage saved"))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Save failed"))
      .finally(() => setSavingStage(null));
  }

  function runPreview(stage: OutreachStep) {
    setPreviews((p) => ({ ...p, [stage]: { loading: true } }));
    previewAiMessage({
      systemPrompt: voice || undefined,
      taskInstruction: entries[stage]?.promptText || undefined,
      step: stage,
      accountId,
      shareContent: !!entries[stage]?.shareContent,
      connectionId: picked?.id,
    })
      .then((res) =>
        setPreviews((p) => ({
          ...p,
          [stage]: {
            loading: false,
            text: res.text,
            banned: res.bannedWordsFound,
            error: res.error,
            contentMissing: res.contentMissing,
          },
        })),
      )
      .catch((e) =>
        setPreviews((p) => ({
          ...p,
          [stage]: { loading: false, error: e instanceof Error ? e.message : "Preview failed" },
        })),
      );
  }

  return (
    <div className="space-y-4">
      {/* Shared voice — applies to every stage */}
      <Card className="border-primary/30">
        <CardHeader className="flex-row items-center gap-2 space-y-0 pb-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Mic className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-base">Voice · {accountName}</CardTitle>
            <p className="text-xs text-muted-foreground">
              Identity, positioning &amp; rules used in <span className="font-medium">every</span> DM.
              Each stage below adds only its own task on top of this.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
            rows={12}
            className="font-mono text-xs leading-relaxed"
            placeholder="Who you are, how you write, what to avoid…"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {voice.length.toLocaleString()} characters · applies to all stages
            </span>
            <Button size="sm" onClick={saveVoice} disabled={savingVoice}>
              {savingVoice ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save voice
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Reply strategy — used only by pipeline reply drafts (offer + qualification) */}
      <Card className="border-primary/30">
        <CardHeader className="flex-row items-center gap-2 space-y-0 pb-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Target className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-base">Reply strategy</CardTitle>
            <p className="text-xs text-muted-foreground">
              Offer, who&apos;s a fit &amp; how to advance a conversation. Used only when drafting
              replies to people who respond (the Pipeline), on top of the voice + the built-in stage
              playbook. Not used for cold outbound.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={strategy}
            onChange={(e) => setStrategy(e.target.value)}
            rows={10}
            className="font-mono text-xs leading-relaxed"
            placeholder="Offer, who is a fit / not a fit, qualification questions, when to move to a meeting, meeting length…"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {strategy.length.toLocaleString()} characters · reply drafts only
            </span>
            <Button size="sm" onClick={saveStrategy} disabled={savingStrategy}>
              {savingStrategy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save reply strategy
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between px-1">
        <p className="text-sm text-muted-foreground">
          Per-stage task — only what each message should do. The voice above is applied on top.
        </p>
        <Button size="sm" onClick={saveAll} disabled={savingAll}>
          {savingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save all stages
        </Button>
      </div>

      {/* Shared contact for previews */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 p-3">
        <span className="shrink-0 text-sm font-medium">Preview against</span>
        <div className="min-w-[240px] flex-1">
          <ConnectionPicker value={picked} onChange={setPicked} />
        </div>
        <span className="text-xs text-muted-foreground">
          Optional — leave empty to use a sample prospect.
        </span>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {STAGES.map((s, i) => {
          const e = entries[s.stage];
          const starter = STAGE_STARTER_PROMPTS[s.stage] ?? "";
          const edited = (e?.promptText ?? "") !== starter;
          const pv = previews[s.stage];
          return (
            <Card key={s.stage}>
              <CardContent className="space-y-3 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-medium tabular-nums text-primary">
                      {i + 1}
                    </span>
                    <span className="text-sm font-medium">{s.label}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        edited ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {edited ? "Edited" : "Suggested"}
                    </span>
                  </div>
                  {s.content && (
                    <label className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1 text-xs">
                      <Switch
                        checked={!!e?.shareContent}
                        onCheckedChange={(v) => update(s.stage, { shareContent: v })}
                      />
                      Share a content article
                    </label>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{s.hint}</p>

                <Textarea
                  value={e?.promptText ?? ""}
                  onChange={(ev) => update(s.stage, { promptText: ev.target.value })}
                  rows={4}
                  className="text-xs leading-relaxed"
                  placeholder="What this message should do…"
                />

                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => runPreview(s.stage)} disabled={pv?.loading}>
                    {pv?.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    Generate preview
                  </Button>
                  <Button size="sm" onClick={() => saveStage(s.stage)} disabled={savingStage === s.stage}>
                    {savingStage === s.stage ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Save this stage
                  </Button>
                  {edited && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => update(s.stage, { promptText: starter })}
                      title="Replace with the suggested instruction for this stage"
                    >
                      <RotateCcw className="h-4 w-4" /> Reset
                    </Button>
                  )}
                </div>

                {pv && !pv.loading && (
                  <div className="space-y-1 rounded-md border bg-muted/30 p-3">
                    <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                      <Sparkles className="h-3.5 w-3.5" />
                      {picked ? `Preview for ${picked.name}` : "Sample output"}
                    </div>
                    {pv.error ? (
                      <p className="text-sm text-destructive">{pv.error}</p>
                    ) : (
                      <p className="whitespace-pre-wrap text-sm">{pv.text}</p>
                    )}
                    {pv.contentMissing && (
                      <p className="flex items-center gap-1 text-xs text-amber-600">
                        <AlertTriangle className="h-3.5 w-3.5" /> Sharing is on but no shareable
                        articles were found — import content and tick a section in the Content
                        library below.
                      </p>
                    )}
                    {pv.banned && pv.banned.length > 0 && (
                      <p className="flex items-center gap-1 text-xs text-amber-600">
                        <AlertTriangle className="h-3.5 w-3.5" /> Banned words: {pv.banned.join(", ")}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
