"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save, Sparkles, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { saveAccountPromptSet, updateDefaultPrompt } from "@/app/(dashboard)/accounts/actions";

const STAGES: { stage: string; label: string; hint: string; content: boolean }[] = [
  { stage: "connection_request", label: "Connection request", hint: "The invite note when first connecting.", content: false },
  { stage: "welcome", label: "Welcome", hint: "The first message right after they accept.", content: false },
  { stage: "follow_up_1", label: "Follow-up 1", hint: "A gentle nudge if there's no reply.", content: false },
  { stage: "follow_up_2", label: "Follow-up 2", hint: "Shares a relevant article by default.", content: true },
  { stage: "follow_up_3", label: "Follow-up 3", hint: "Final touch — also shares an article.", content: true },
];

type Entry = { promptText: string; shareContent: boolean };

export function PromptSetPanel({
  accountId,
  accountName,
  defaultPrompt,
  initial,
}: {
  accountId: string;
  accountName: string;
  defaultPrompt: string;
  initial: { stage: string; promptText: string | null; shareContent: boolean }[];
}) {
  const router = useRouter();

  const [defText, setDefText] = useState(defaultPrompt);
  const [savingDef, setSavingDef] = useState(false);

  const [entries, setEntries] = useState<Record<string, Entry>>(() => {
    const map: Record<string, Entry> = {};
    for (const s of STAGES) {
      const row = initial.find((r) => r.stage === s.stage);
      map[s.stage] = {
        promptText: row?.promptText ?? "",
        shareContent: row?.shareContent ?? s.content,
      };
    }
    return map;
  });
  const [savingStages, setSavingStages] = useState(false);

  function update(stage: string, patch: Partial<Entry>) {
    setEntries((prev) => ({ ...prev, [stage]: { ...prev[stage], ...patch } }));
  }

  function saveDefault() {
    setSavingDef(true);
    updateDefaultPrompt(defText)
      .then(() => {
        toast.success("Default DM prompt saved");
        router.refresh();
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Save failed"))
      .finally(() => setSavingDef(false));
  }

  function saveStages() {
    setSavingStages(true);
    saveAccountPromptSet(
      accountId,
      STAGES.map((s) => ({
        stage: s.stage,
        promptText: entries[s.stage]?.promptText || null,
        shareContent: !!entries[s.stage]?.shareContent,
      })),
    )
      .then(() => {
        toast.success("Stage prompts saved");
        router.refresh();
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Save failed"))
      .finally(() => setSavingStages(false));
  }

  const customCount = STAGES.filter((s) => entries[s.stage]?.promptText.trim()).length;

  return (
    <div className="space-y-4">
      {/* Default DM prompt — drives every DM unless a stage overrides it */}
      <Card className="border-primary/30">
        <CardHeader className="flex-row items-center gap-2 space-y-0 pb-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-base">Default DM prompt</CardTitle>
            <p className="text-xs text-muted-foreground">
              The voice &amp; rules used to write every DM. Editing this changes all stages that
              don&apos;t have their own text below.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={defText}
            onChange={(e) => setDefText(e.target.value)}
            rows={12}
            className="font-mono text-xs leading-relaxed"
            placeholder="Write the system prompt that defines how DMs are written…"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {defText.length.toLocaleString()} characters
            </span>
            <Button size="sm" onClick={saveDefault} disabled={savingDef}>
              {savingDef ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save default prompt
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Per-stage overrides */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <MessageSquare className="h-4 w-4" />
          <span>
            Per-stage voice for <span className="font-medium text-foreground">{accountName}</span>
            {customCount > 0 && ` · ${customCount} customized`}
          </span>
        </div>
        <Button size="sm" variant="outline" onClick={saveStages} disabled={savingStages}>
          {savingStages ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save all stages
        </Button>
      </div>

      <div className="space-y-3">
        {STAGES.map((s, i) => {
          const e = entries[s.stage];
          const custom = !!e?.promptText.trim();
          return (
            <Card key={s.stage}>
              <CardContent className="space-y-2 py-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums">
                      {i + 1}
                    </span>
                    <span className="text-sm font-medium">{s.label}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        custom
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {custom ? "Custom voice" : "Uses default"}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">{s.hint}</span>
                </div>
                <Textarea
                  value={e?.promptText ?? ""}
                  onChange={(ev) => update(s.stage, { promptText: ev.target.value })}
                  rows={4}
                  className="text-xs leading-relaxed"
                  placeholder="Leave blank to use the default prompt above. Type here to give this stage its own voice."
                />
                {s.stage !== "connection_request" && (
                  <label className="flex w-fit cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
                    <Switch
                      checked={!!e?.shareContent}
                      onCheckedChange={(v) => update(s.stage, { shareContent: v })}
                    />
                    Share a relevant content article in this message
                  </label>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
