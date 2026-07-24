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

  return (
    <Card>
      <CardContent className="space-y-4 py-4">
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

          <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Switch checked={autoEnroll} onCheckedChange={toggleAutoEnroll} disabled={pending} />
              Auto-enroll matching connections
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Switch checked={dedupeContacts} onCheckedChange={toggleDedupe} disabled={pending} />
              Message each person only once
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Switch checked={reviewBeforeSend} onCheckedChange={toggleReview} disabled={pending} />
              Review AI before sending
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Switch checked={aiReplyDecision} onCheckedChange={toggleAiReply} disabled={pending} />
              AI triage replies
            </label>
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
            <span className="font-medium">Evergreen</span> — with auto-enroll on, this campaign stays
            active and keeps enrolling new matching connections (it won&apos;t auto-complete). Turn
            auto-enroll off to let it finish.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
