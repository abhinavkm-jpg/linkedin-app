"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getAccountPromptSet,
  saveAccountPromptSet,
  listAiPromptsForPicker,
} from "@/app/(dashboard)/accounts/actions";

const STAGES: { stage: string; label: string; content: boolean }[] = [
  { stage: "connection_request", label: "Connection request", content: false },
  { stage: "welcome", label: "Welcome", content: false },
  { stage: "follow_up_1", label: "Follow-up 1", content: false },
  { stage: "follow_up_2", label: "Follow-up 2", content: true },
  { stage: "follow_up_3", label: "Follow-up 3", content: true },
];

type Entry = { aiPromptId: string; shareContent: boolean };

export function PromptSetDialog({
  accountId,
  accountName,
}: {
  accountId: string;
  accountName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [prompts, setPrompts] = useState<{ id: string; name: string }[]>([]);
  const [entries, setEntries] = useState<Record<string, Entry>>({});

  function openDialog() {
    setOpen(true);
    setLoading(true);
    Promise.all([listAiPromptsForPicker(), getAccountPromptSet(accountId)])
      .then(([ps, set]) => {
        setPrompts(ps);
        const map: Record<string, Entry> = {};
        for (const s of STAGES) {
          const row = set.find((r) => r.stage === s.stage);
          map[s.stage] = {
            aiPromptId: row?.aiPromptId ?? "",
            shareContent: row?.shareContent ?? s.content,
          };
        }
        setEntries(map);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  function update(stage: string, patch: Partial<Entry>) {
    setEntries((prev) => ({ ...prev, [stage]: { ...prev[stage], ...patch } }));
  }

  function submit() {
    setSaving(true);
    saveAccountPromptSet(
      accountId,
      STAGES.map((s) => ({
        stage: s.stage,
        aiPromptId: entries[s.stage]?.aiPromptId || null,
        shareContent: !!entries[s.stage]?.shareContent,
      })),
    )
      .then(() => {
        toast.success("Prompt set saved");
        router.refresh();
        setOpen(false);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Save failed"))
      .finally(() => setSaving(false));
  }

  const selectClass = "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm";

  return (
    <>
      <Button size="sm" variant="outline" onClick={openDialog}>
        Prompt set
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Prompt set — {accountName}</DialogTitle>
            <DialogDescription>
              Choose the voice for each stage of this account&apos;s outreach, and which follow-ups
              share a content article. Leave a stage on &ldquo;Default prompt&rdquo; to use the
              workspace default. A step&apos;s own prompt still overrides this.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <p className="flex items-center gap-1 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </p>
          ) : (
            <div className="space-y-4">
              {STAGES.map((s) => (
                <div key={s.stage} className="space-y-1.5 rounded-md border p-3">
                  <Label className="text-sm font-medium">{s.label}</Label>
                  <select
                    className={selectClass}
                    value={entries[s.stage]?.aiPromptId ?? ""}
                    onChange={(e) => update(s.stage, { aiPromptId: e.target.value })}
                  >
                    <option value="">Default prompt</option>
                    {prompts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  {s.stage !== "connection_request" && (
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <Switch
                        checked={!!entries[s.stage]?.shareContent}
                        onCheckedChange={(v) => update(s.stage, { shareContent: v })}
                      />
                      Share a relevant content article in this message
                    </label>
                  )}
                </div>
              ))}
              <div className="flex justify-end">
                <Button size="sm" onClick={submit} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save prompt set
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
