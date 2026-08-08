"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Play, Pause, Trash2, Check, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { StatusPill } from "@/components/status-pill";
import {
  updateCampaign,
  updateCampaignStatus,
  deleteCampaign,
} from "@/app/(dashboard)/campaigns/actions";

const statusTone: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  active: "default",
  draft: "outline",
  paused: "secondary",
  completed: "secondary",
  archived: "destructive",
};

export function CampaignHeader({
  id,
  name,
  status,
  reviewBeforeSend,
  dedupeContacts,
  autoEnroll,
  aiReplyDecision,
  hasSteps,
  stateCounts,
}: {
  id: string;
  name: string;
  status: string;
  reviewBeforeSend: boolean;
  dedupeContacts: boolean;
  autoEnroll: boolean;
  aiReplyDecision: boolean;
  hasSteps: boolean;
  stateCounts: { state: string; n: number }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const isActive = status === "active";

  function saveName() {
    start(async () => {
      await updateCampaign(id, { name: draftName.trim() || name });
      setEditingName(false);
      toast.success("Renamed");
      router.refresh();
    });
  }

  function toggleReview(next: boolean) {
    start(async () => {
      await updateCampaign(id, { reviewBeforeSend: next });
      toast.success(next ? "AI review on" : "AI review off — messages will auto-send");
      router.refresh();
    });
  }

  function toggleDedupe(next: boolean) {
    start(async () => {
      await updateCampaign(id, { dedupeContacts: next });
      toast.success(
        next ? "Each person will be messaged once" : "Multi DMs on — people can be messaged repeatedly",
      );
      router.refresh();
    });
  }

  function toggleAutoEnroll(next: boolean) {
    start(async () => {
      await updateCampaign(id, { autoEnroll: next });
      toast.success(
        next ? "Auto-enroll on — matching connections are added automatically" : "Auto-enroll off",
      );
      router.refresh();
    });
  }

  function toggleAiReply(next: boolean) {
    start(async () => {
      await updateCampaign(id, { aiReplyDecision: next });
      toast.success(
        next
          ? "AI reply triage on — auto-replies keep the sequence going"
          : "AI reply triage off — any reply stops the sequence",
      );
      router.refresh();
    });
  }

  function setStatus(s: "active" | "paused") {
    start(async () => {
      await updateCampaignStatus(id, s);
      toast.success(s === "active" ? "Campaign activated" : "Campaign paused");
      router.refresh();
    });
  }

  function remove() {
    if (!confirm("Delete this campaign and all its enrollments? This cannot be undone.")) return;
    start(async () => {
      try {
        await deleteCampaign(id);
      } catch (e) {
        if (e instanceof Error && e.message !== "NEXT_REDIRECT") toast.error(e.message);
      }
    });
  }

  const toggles: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }[] = [
    {
      label: "Auto-enroll matching connections",
      hint: "Keep adding new matching connections automatically.",
      checked: autoEnroll,
      onChange: toggleAutoEnroll,
    },
    {
      label: "Message each person only once",
      hint: "Skip anyone who was already contacted.",
      checked: dedupeContacts,
      onChange: toggleDedupe,
    },
    {
      label: "Review AI before sending",
      hint: "Hold AI drafts in the review queue for approval.",
      checked: reviewBeforeSend,
      onChange: toggleReview,
    },
    {
      label: "AI triage replies",
      hint: "Let AI decide whether a reply should stop the sequence.",
      checked: aiReplyDecision,
      onChange: toggleAiReply,
    },
  ];

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          {/* Left: identity, actions, progress, notes */}
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {editingName ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    className="h-8 w-64"
                    autoFocus
                  />
                  <Button size="icon-sm" onClick={saveName} disabled={pending}>
                    <Check className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <button
                  className="flex items-center gap-2 text-lg font-semibold hover:text-primary"
                  onClick={() => {
                    setDraftName(name);
                    setEditingName(true);
                  }}
                >
                  {name}
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              )}
              <Badge variant={statusTone[status] ?? "outline"}>{status}</Badge>

              <div className="ml-auto flex items-center gap-1">
                {isActive ? (
                  <Button size="sm" variant="outline" onClick={() => setStatus("paused")} disabled={pending}>
                    <Pause className="h-4 w-4" /> Pause
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => setStatus("active")} disabled={pending || !hasSteps}>
                    <Play className="h-4 w-4" /> Activate
                  </Button>
                )}
                <Button size="icon-sm" variant="ghost" onClick={remove} disabled={pending}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {stateCounts.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {stateCounts.map((s) => (
                  <div
                    key={s.state}
                    className="flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1 text-sm"
                  >
                    <span className="font-semibold tabular-nums">{s.n}</span>
                    <StatusPill status={s.state} />
                  </div>
                ))}
              </div>
            )}

            {!hasSteps && (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                Add at least one sequence step below before activating.
              </p>
            )}
            {isActive && (
              <p className="text-xs text-muted-foreground">
                Campaign is active — pause it to edit the sequence. You can still enroll and review.
              </p>
            )}
            {autoEnroll && (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium">Evergreen</span> — with auto-enroll on, this campaign
                stays active and keeps enrolling new matching connections (it won&apos;t
                auto-complete). Turn auto-enroll off to let it finish.
              </p>
            )}
          </div>

          {/* Right: settings toggles, stacked */}
          <div className="w-full shrink-0 rounded-lg border lg:w-80">
            <div className="divide-y">
              {toggles.map((t) => (
                <label
                  key={t.label}
                  className="flex cursor-pointer items-start justify-between gap-3 px-3 py-2.5"
                >
                  <span className="text-sm">
                    <span className="font-medium">{t.label}</span>
                    <span className="block text-xs text-muted-foreground">{t.hint}</span>
                  </span>
                  <Switch
                    checked={t.checked}
                    onCheckedChange={t.onChange}
                    disabled={pending}
                    className="mt-0.5 shrink-0"
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
