"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Play, Pause, Plus, Trash2, Loader2, Mail, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  addStep,
  deleteStep,
  updateCampaignStatus,
} from "@/app/(dashboard)/campaigns/actions";
import type { Campaign, SequenceStep, Template, AiPrompt } from "@/db/schema";

export function CampaignDetail({
  campaign,
  steps,
  templates,
  prompts,
  stats,
}: {
  campaign: Campaign;
  steps: SequenceStep[];
  templates: Template[];
  prompts: AiPrompt[];
  stats: { state: string; n: number }[];
}) {
  const [pending, start] = useTransition();

  function setStatus(status: Parameters<typeof updateCampaignStatus>[1]) {
    start(async () => {
      await updateCampaignStatus(campaign.id, status);
      toast.success(`Campaign ${status}`);
    });
  }

  const isActive = campaign.status === "active";

  return (
    <div className="space-y-6">
      {/* Status controls */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={isActive ? "default" : "outline"}>{campaign.status}</Badge>
        {campaign.reviewBeforeSend && <Badge variant="secondary">AI review on</Badge>}
        <div className="ml-auto flex gap-2">
          {isActive ? (
            <Button size="sm" variant="outline" onClick={() => setStatus("paused")} disabled={pending}>
              <Pause className="h-4 w-4" /> Pause
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => setStatus("active")}
              disabled={pending || steps.length === 0}
            >
              <Play className="h-4 w-4" /> Activate
            </Button>
          )}
        </div>
      </div>

      {/* Enrollment stats */}
      {stats.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {stats.map((s) => (
            <div key={s.state} className="rounded-md border px-3 py-1.5 text-sm">
              <span className="font-medium tabular-nums">{s.n}</span>{" "}
              <span className="text-muted-foreground">{s.state.replace(/_/g, " ")}</span>
            </div>
          ))}
        </div>
      )}

      {/* Steps */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sequence steps</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {steps.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No steps yet. Add an invite (for non-connections) or a message (for existing
              connections).
            </p>
          ) : (
            <ol className="space-y-2">
              {steps.map((step, i) => (
                <li
                  key={step.id}
                  className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium">
                    {i + 1}
                  </span>
                  {step.type === "invite" ? (
                    <UserPlus className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Mail className="h-4 w-4 text-muted-foreground" />
                  )}
                  <div className="flex-1">
                    <span className="font-medium capitalize">{step.type}</span>{" "}
                    <span className="text-muted-foreground">
                      via {step.sourceType === "ai" ? "AI" : "template"} · after {step.delayHours}h
                      {step.stopOnReply ? " · stops on reply" : ""}
                    </span>
                  </div>
                  <DeleteStepButton stepId={step.id} campaignId={campaign.id} />
                </li>
              ))}
            </ol>
          )}

          <AddStepForm campaignId={campaign.id} templates={templates} prompts={prompts} />
        </CardContent>
      </Card>
    </div>
  );
}

function DeleteStepButton({ stepId, campaignId }: { stepId: string; campaignId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      onClick={() => start(async () => void (await deleteStep(stepId, campaignId)))}
      disabled={pending}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
    </Button>
  );
}

function AddStepForm({
  campaignId,
  templates,
  prompts,
}: {
  campaignId: string;
  templates: Template[];
  prompts: AiPrompt[];
}) {
  const [pending, start] = useTransition();
  const [type, setType] = useState<"invite" | "message">("message");
  const [sourceType, setSourceType] = useState<"template" | "ai">("template");
  const [templateId, setTemplateId] = useState("");
  const [aiPromptId, setAiPromptId] = useState("");
  const [delayHours, setDelayHours] = useState(24);
  const [stopOnReply, setStopOnReply] = useState(true);

  const eligibleTemplates = templates.filter((t) => t.type === type);
  const selectClass = "h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm";

  function submit() {
    if (sourceType === "template" && !templateId) {
      toast.error("Choose a template");
      return;
    }
    start(async () => {
      await addStep(campaignId, {
        type,
        sourceType,
        templateId: sourceType === "template" ? templateId : null,
        aiPromptId: sourceType === "ai" ? aiPromptId || null : null,
        delayHours,
        stopOnReply,
      });
      toast.success("Step added");
      setTemplateId("");
    });
  }

  return (
    <div className="grid gap-3 rounded-md border border-dashed p-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label>Step type</Label>
        <select className={selectClass} value={type} onChange={(e) => setType(e.target.value as "invite" | "message")}>
          <option value="message">Message (existing connection)</option>
          <option value="invite">Invite (non-connection)</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <Label>Content source</Label>
        <select
          className={selectClass}
          value={sourceType}
          onChange={(e) => setSourceType(e.target.value as "template" | "ai")}
        >
          <option value="template">Template</option>
          <option value="ai">AI generated</option>
        </select>
      </div>

      {sourceType === "template" ? (
        <div className="space-y-1.5">
          <Label>Template</Label>
          <select className={selectClass} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">Select…</option>
            {eligibleTemplates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label>AI prompt (optional)</Label>
          <select className={selectClass} value={aiPromptId} onChange={(e) => setAiPromptId(e.target.value)}>
            <option value="">Default prompt</option>
            {prompts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Delay before this step (hours)</Label>
        <Input
          type="number"
          min={0}
          value={delayHours}
          onChange={(e) => setDelayHours(parseInt(e.target.value || "0", 10))}
        />
      </div>

      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" checked={stopOnReply} onChange={(e) => setStopOnReply(e.target.checked)} />
        Stop the sequence if they reply
      </label>

      <div className="sm:col-span-2">
        <Button size="sm" onClick={submit} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add step
        </Button>
      </div>
    </div>
  );
}
