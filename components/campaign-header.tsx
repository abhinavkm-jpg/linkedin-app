"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Play, Pause, Trash2, Check, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
  hasSteps,
  stateCounts,
}: {
  id: string;
  name: string;
  status: string;
  reviewBeforeSend: boolean;
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

          <div className="ml-auto flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={reviewBeforeSend}
                onChange={(e) => toggleReview(e.target.checked)}
                disabled={pending}
              />
              Review AI before sending
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
              <div key={s.state} className="rounded-md border px-3 py-1.5 text-sm">
                <span className="font-medium tabular-nums">{s.n}</span>{" "}
                <span className="text-muted-foreground">{s.state.replace(/_/g, " ")}</span>
              </div>
            ))}
          </div>
        )}

        {!hasSteps && (
          <p className="text-sm text-amber-600">
            Add at least one sequence step below before activating.
          </p>
        )}
        {isActive && (
          <p className="text-xs text-muted-foreground">
            Campaign is active — pause it to edit the sequence. You can still enroll and review.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
