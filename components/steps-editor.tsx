"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2, Mail, UserPlus, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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

/** Show a stored hours value in the friendliest unit (whole days when it divides evenly). */
function splitDelay(hours: number): { value: number; unit: "hours" | "days" } {
  if (hours > 0 && hours % 24 === 0) return { value: hours / 24, unit: "days" };
  return { value: hours, unit: "hours" };
}

/** Human-readable delay for the step list: "immediately", "3 days", "12h". */
function formatDelay(hours: number): string {
  if (hours <= 0) return "immediately";
  if (hours % 24 === 0) {
    const d = hours / 24;
    return `${d} day${d === 1 ? "" : "s"}`;
  }
  return `${hours}h`;
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
    <div className="space-y-3">
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
                    isFirstStep={i === 0}
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
                      via {step.sourceType === "ai" ? "AI" : "template"} ·{" "}
                      {i === 0 ? "sends immediately" : `after ${formatDelay(step.delayHours)}`}
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
              isFirstStep={steps.length === 0}
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
    </div>
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
  isFirstStep,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  templates: Template[];
  prompts: AiPrompt[];
  initial?: StepValues;
  isFirstStep: boolean;
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
  const initDelay = splitDelay(initial?.delayHours ?? 24);
  const [delayValue, setDelayValue] = useState(initDelay.value);
  const [delayUnit, setDelayUnit] = useState<"hours" | "days">(initDelay.unit);

  const eligibleTemplates = templates.filter((t) => t.type === v.type);
  const selectClass = "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm";

  function submit() {
    if (v.sourceType === "template" && !v.templateId) {
      toast.error("Choose a template");
      return;
    }
    const delayHours = isFirstStep ? 0 : delayUnit === "days" ? delayValue * 24 : delayValue;
    start(async () => {
      await onSubmit({ ...v, delayHours });
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

      {isFirstStep ? (
        <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm sm:col-span-2">
          The first step sends <span className="font-medium">as soon as someone is enrolled</span> —
          there&apos;s no wait to set. Add a delay on follow-up steps below.
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label>Wait before this step</Label>
          <div className="flex gap-2">
            <Input
              type="number"
              min={0}
              value={delayValue}
              onChange={(e) => setDelayValue(Math.max(0, parseInt(e.target.value || "0", 10)))}
              className="flex-1"
            />
            <select
              className="h-9 w-28 rounded-md border border-input bg-transparent px-2 text-sm"
              value={delayUnit}
              onChange={(e) => setDelayUnit(e.target.value as "hours" | "days")}
            >
              <option value="hours">Hours</option>
              <option value="days">Days</option>
            </select>
          </div>
          <p className="text-xs text-muted-foreground">
            Measured from when the previous step was sent.
          </p>
        </div>
      )}

      <label className="flex cursor-pointer items-center gap-2 text-sm sm:col-span-2">
        <Switch
          checked={v.stopOnReply}
          onCheckedChange={(c) => setV({ ...v, stopOnReply: c })}
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
