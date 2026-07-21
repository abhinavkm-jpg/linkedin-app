"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2, Mail, UserPlus, ChevronUp, ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addStep, updateStep, moveStep, deleteStep } from "@/app/(dashboard)/campaigns/actions";
import type { SequenceStep, Template, AiPrompt } from "@/db/schema";

interface StepValues {
  type: "invite" | "message";
  sourceType: "template" | "ai";
  templateId: string;
  aiPromptId: string;
  delayHours: number;
  stopOnReply: boolean;
}

export function StepsEditor({
  campaignId,
  steps,
  templates,
  prompts,
  editable,
}: {
  campaignId: string;
  steps: SequenceStep[];
  templates: Template[];
  prompts: AiPrompt[];
  editable: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sequence steps</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {steps.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No steps yet. Add an invite (for non-connections) or a message (for existing connections).
          </p>
        ) : (
          <ol className="space-y-2">
            {steps.map((step, i) =>
              editingId === step.id ? (
                <li key={step.id}>
                  <StepForm
                    templates={templates}
                    prompts={prompts}
                    initial={{
                      type: step.type,
                      sourceType: step.sourceType,
                      templateId: step.templateId ?? "",
                      aiPromptId: step.aiPromptId ?? "",
                      delayHours: step.delayHours,
                      stopOnReply: step.stopOnReply,
                    }}
                    submitLabel="Save step"
                    onCancel={() => setEditingId(null)}
                    onSubmit={async (v) => {
                      await updateStep(step.id, campaignId, {
                        type: v.type,
                        sourceType: v.sourceType,
                        templateId: v.templateId || null,
                        aiPromptId: v.aiPromptId || null,
                        delayHours: v.delayHours,
                        stopOnReply: v.stopOnReply,
                      });
                      setEditingId(null);
                    }}
                  />
                </li>
              ) : (
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
                  {editable && (
                    <div className="flex items-center gap-0.5">
                      <IconAction disabled={i === 0} onClick={() => moveStep(step.id, campaignId, "up")}>
                        <ChevronUp className="h-4 w-4" />
                      </IconAction>
                      <IconAction
                        disabled={i === steps.length - 1}
                        onClick={() => moveStep(step.id, campaignId, "down")}
                      >
                        <ChevronDown className="h-4 w-4" />
                      </IconAction>
                      <Button size="icon-sm" variant="ghost" onClick={() => setEditingId(step.id)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <IconAction onClick={() => deleteStep(step.id, campaignId)} destructive>
                        <Trash2 className="h-4 w-4" />
                      </IconAction>
                    </div>
                  )}
                </li>
              ),
            )}
          </ol>
        )}

        {editable &&
          (adding ? (
            <StepForm
              templates={templates}
              prompts={prompts}
              submitLabel="Add step"
              onCancel={() => setAdding(false)}
              onSubmit={async (v) => {
                await addStep(campaignId, {
                  type: v.type,
                  sourceType: v.sourceType,
                  templateId: v.templateId || null,
                  aiPromptId: v.aiPromptId || null,
                  delayHours: v.delayHours,
                  stopOnReply: v.stopOnReply,
                });
                setAdding(false);
              }}
            />
          ) : (
            <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" /> Add step
            </Button>
          ))}
      </CardContent>
    </Card>
  );
}

function IconAction({
  children,
  onClick,
  disabled,
  destructive,
}: {
  children: React.ReactNode;
  onClick: () => Promise<void> | void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      disabled={disabled || pending}
      onClick={() =>
        start(async () => {
          await onClick();
          router.refresh();
        })
      }
      className={destructive ? "text-destructive" : undefined}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : children}
    </Button>
  );
}

function StepForm({
  templates,
  prompts,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  templates: Template[];
  prompts: AiPrompt[];
  initial?: StepValues;
  submitLabel: string;
  onSubmit: (v: StepValues) => Promise<void>;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState<StepValues>(
    initial ?? {
      type: "message",
      sourceType: "template",
      templateId: "",
      aiPromptId: "",
      delayHours: 24,
      stopOnReply: true,
    },
  );

  const eligibleTemplates = templates.filter((t) => t.type === v.type);
  const selectClass = "h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm";

  function submit() {
    if (v.sourceType === "template" && !v.templateId) {
      toast.error("Choose a template");
      return;
    }
    start(async () => {
      await onSubmit(v);
      toast.success("Saved");
      router.refresh();
    });
  }

  return (
    <div className="grid gap-3 rounded-md border border-dashed p-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label>Step type</Label>
        <select
          className={selectClass}
          value={v.type}
          onChange={(e) => setV({ ...v, type: e.target.value as "invite" | "message" })}
        >
          <option value="message">Message (existing connection)</option>
          <option value="invite">Invite (non-connection)</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <Label>Content source</Label>
        <select
          className={selectClass}
          value={v.sourceType}
          onChange={(e) => setV({ ...v, sourceType: e.target.value as "template" | "ai" })}
        >
          <option value="template">Template</option>
          <option value="ai">AI generated</option>
        </select>
      </div>

      {v.sourceType === "template" ? (
        <div className="space-y-1.5">
          <Label>Template</Label>
          <select
            className={selectClass}
            value={v.templateId}
            onChange={(e) => setV({ ...v, templateId: e.target.value })}
          >
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
          <select
            className={selectClass}
            value={v.aiPromptId}
            onChange={(e) => setV({ ...v, aiPromptId: e.target.value })}
          >
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
          value={v.delayHours}
          onChange={(e) => setV({ ...v, delayHours: parseInt(e.target.value || "0", 10) })}
        />
      </div>

      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input
          type="checkbox"
          checked={v.stopOnReply}
          onChange={(e) => setV({ ...v, stopOnReply: e.target.checked })}
        />
        Stop the sequence if they reply
      </label>

      <div className="flex gap-2 sm:col-span-2">
        <Button size="sm" onClick={submit} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {submitLabel}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
