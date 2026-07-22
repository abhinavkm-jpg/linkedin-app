"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Sparkles, Loader2, FileText, Send } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  saveTemplate,
  deleteTemplate,
  saveAiPrompt,
  deleteAiPrompt,
  previewAiMessage,
  previewTemplateForConnection,
  sendTestMessage,
} from "@/app/(dashboard)/templates/actions";
import { ConnectionPicker, type PickedConnection } from "@/components/connection-picker";
import type { Template, AiPrompt } from "@/db/schema";

const PREVIEW_STEPS: { value: string; label: string }[] = [
  { value: "connection_request", label: "Connection request" },
  { value: "welcome", label: "Welcome (after accept)" },
  { value: "follow_up_1", label: "Follow-up 1" },
  { value: "follow_up_2", label: "Follow-up 2" },
  { value: "follow_up_3", label: "Follow-up 3" },
];

const MODELS = [
  { value: "claude-sonnet-5", label: "Claude Sonnet 5 (balanced)" },
  { value: "claude-opus-4-8", label: "Claude Opus 4.8 (highest quality)" },
  { value: "claude-haiku-4-5", label: "Claude Haiku 4.5 (fastest)" },
];

export function TemplatesManager({
  templates,
  prompts,
}: {
  templates: Template[];
  prompts: AiPrompt[];
}) {
  return (
    <div className="space-y-8">
      <TemplatesSection templates={templates} />
      <PromptsSection prompts={prompts} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function TemplatesSection({ templates }: { templates: Template[] }) {
  const [editing, setEditing] = useState<Template | null>(null);
  const [open, setOpen] = useState(false);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <FileText className="h-4 w-4" /> Templates
          </h2>
          <p className="text-xs text-muted-foreground">
            Reusable copy with {"{{first_name}}"}, {"{{company}}"}, {"{{position}}"} placeholders.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> New template
        </Button>
      </div>

      {templates.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No templates yet"
          description="Create reusable message or invite copy with placeholders like {{first_name}}."
        >
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> New template
          </Button>
        </EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {templates.map((t) => (
            <Card key={t.id}>
              <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
                <div className="min-w-0">
                  <CardTitle className="truncate text-sm">{t.name}</CardTitle>
                  <Badge variant="outline" className="mt-1">
                    {t.type}
                  </Badge>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => {
                      setEditing(t);
                      setOpen(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <DeleteButton onDelete={() => deleteTemplate(t.id)} />
                </div>
              </CardHeader>
              <CardContent>
                <p className="line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">
                  {t.body}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <TemplateDialog open={open} onOpenChange={setOpen} template={editing} />
    </section>
  );
}

function TemplateDialog({
  open,
  onOpenChange,
  template,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  template: Template | null;
}) {
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [type, setType] = useState<"invite" | "message">("message");
  const [body, setBody] = useState("");
  const [picked, setPicked] = useState<PickedConnection | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  // Sync fields when dialog opens.
  const key = template?.id ?? "new";
  useSyncOnOpen(open, key, () => {
    setName(template?.name ?? "");
    setType(template?.type ?? "message");
    setBody(template?.body ?? "");
    setPicked(null);
    setPreview(null);
  });

  function submit() {
    if (!name.trim() || !body.trim()) {
      toast.error("Name and body are required");
      return;
    }
    start(async () => {
      await saveTemplate({ id: template?.id, name, type, body });
      toast.success("Template saved");
      onOpenChange(false);
    });
  }

  function runPreview() {
    if (!body.trim()) {
      toast.error("Write the template body first");
      return;
    }
    setPreviewing(true);
    previewTemplateForConnection({ body, connectionId: picked?.id })
      .then((res) => {
        if (res.error) toast.error(res.error);
        else setPreview(res.text ?? "");
      })
      .finally(() => setPreviewing(false));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{template ? "Edit template" : "New template"}</DialogTitle>
          <DialogDescription>Use placeholders like {"{{first_name}}"}.</DialogDescription>
        </DialogHeader>
        <div className="min-w-0 space-y-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <select
              className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm"
              value={type}
              onChange={(e) => setType(e.target.value as "invite" | "message")}
            >
              <option value="message">Message (to existing connection)</option>
              <option value="invite">Invite note (max 300 chars)</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Body</Label>
            <Textarea
              rows={6}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Hi {{first_name}}, ..."
            />
            {type === "invite" && (
              <p className="text-xs text-muted-foreground">{body.length}/300 characters</p>
            )}
          </div>

          <div className="space-y-2 rounded-md border bg-muted/20 p-3">
            <p className="text-xs font-medium text-muted-foreground">
              Test with a connection — see exactly how it renders. Leave empty to use a sample.
            </p>
            <ConnectionPicker value={picked} onChange={setPicked} />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={runPreview} disabled={previewing}>
                {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                Preview
              </Button>
              <SendTestButton connection={picked} text={preview} />
            </div>
            {preview !== null && (
              <div className="rounded-md border bg-background p-3 text-sm">
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  {picked ? `Preview for ${picked.name}:` : "Preview (sample connection):"}
                </p>
                <p className="whitespace-pre-wrap">{preview || "(empty)"}</p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */

function PromptsSection({ prompts }: { prompts: AiPrompt[] }) {
  const [editing, setEditing] = useState<AiPrompt | null>(null);
  const [open, setOpen] = useState(false);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <Sparkles className="h-4 w-4" /> AI prompts
          </h2>
          <p className="text-xs text-muted-foreground">
            System prompts that define the voice for AI-generated outreach.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> New prompt
        </Button>
      </div>

      {prompts.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="No AI prompts yet"
          description="Define the voice and rules for AI-generated outreach, or seed the default with npm run db:seed."
        >
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> New prompt
          </Button>
        </EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {prompts.map((p) => (
            <Card key={p.id}>
              <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
                <div className="min-w-0">
                  <CardTitle className="truncate text-sm">{p.name}</CardTitle>
                  <div className="mt-1 flex gap-1">
                    <Badge variant="outline">{p.model}</Badge>
                    {p.isDefault && <Badge>default</Badge>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => {
                      setEditing(p);
                      setOpen(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <DeleteButton onDelete={() => deleteAiPrompt(p.id)} />
                </div>
              </CardHeader>
              <CardContent>
                <p className="line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">
                  {p.systemPrompt}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <PromptDialog open={open} onOpenChange={setOpen} prompt={editing} />
    </section>
  );
}

function PromptDialog({
  open,
  onOpenChange,
  prompt,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  prompt: AiPrompt | null;
}) {
  const [pending, start] = useTransition();
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<string>("");
  const [name, setName] = useState("");
  const [model, setModel] = useState("claude-sonnet-5");
  const [isDefault, setIsDefault] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [picked, setPicked] = useState<PickedConnection | null>(null);
  const [step, setStep] = useState("welcome");

  const key = prompt?.id ?? "new";
  useSyncOnOpen(open, key, () => {
    setName(prompt?.name ?? "");
    setModel(prompt?.model ?? "claude-sonnet-5");
    setIsDefault(prompt?.isDefault ?? false);
    setSystemPrompt(prompt?.systemPrompt ?? "");
    setPreview("");
    setPicked(null);
    setStep("welcome");
  });

  function submit() {
    if (!name.trim() || !systemPrompt.trim()) {
      toast.error("Name and system prompt are required");
      return;
    }
    start(async () => {
      await saveAiPrompt({ id: prompt?.id, name, model, isDefault, systemPrompt });
      toast.success("Prompt saved");
      onOpenChange(false);
    });
  }

  function runPreview() {
    setPreviewing(true);
    previewAiMessage({
      systemPrompt,
      model,
      step: step as "connection_request" | "welcome" | "follow_up_1" | "follow_up_2" | "follow_up_3",
      connectionId: picked?.id,
    })
      .then((res) => {
        if (res.error) toast.error(res.error);
        else {
          setPreview(res.text ?? "");
          if (res.bannedWordsFound?.length)
            toast.warning(`Contains discouraged words: ${res.bannedWordsFound.join(", ")}`);
        }
      })
      .finally(() => setPreviewing(false));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{prompt ? "Edit prompt" : "New AI prompt"}</DialogTitle>
          <DialogDescription>Define the voice and rules for AI-written messages.</DialogDescription>
        </DialogHeader>
        <div className="min-w-0 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Model</Label>
              <select
                className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              >
                {MODELS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Switch checked={isDefault} onCheckedChange={setIsDefault} />
            Use as default prompt
          </label>
          <div className="space-y-1.5">
            <Label>System prompt</Label>
            <Textarea
              rows={10}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-2 rounded-md border bg-muted/20 p-3">
            <p className="text-xs font-medium text-muted-foreground">
              Test this prompt — generate a real message for a connection. Leave empty to use a
              sample prospect.
            </p>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <ConnectionPicker value={picked} onChange={setPicked} />
              <select
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                value={step}
                onChange={(e) => setStep(e.target.value)}
              >
                {PREVIEW_STEPS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={runPreview} disabled={previewing || !systemPrompt}>
                {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Generate preview
              </Button>
              <SendTestButton connection={picked} text={preview} />
            </div>
            {preview && (
              <div className="rounded-md border bg-background p-3 text-sm">
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  {picked ? `Preview for ${picked.name}:` : "Preview (sample prospect):"}
                </p>
                <p className="whitespace-pre-wrap">{preview}</p>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Sends the previewed message to the picked connection as a REAL LinkedIn DM,
 * behind a confirmation dialog. Disabled until a connection is picked and a
 * message has been previewed.
 */
function SendTestButton({
  connection,
  text,
}: {
  connection: PickedConnection | null;
  text: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const disabled = !connection || !text?.trim();

  function send() {
    if (!connection || !text) return;
    setSending(true);
    sendTestMessage({ connectionId: connection.id, text })
      .then((res) => {
        if (res.error) toast.error(res.error);
        else {
          toast.success(`Test message sent to ${connection.name}`);
          setOpen(false);
        }
      })
      .finally(() => setSending(false));
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => setOpen(true)}
        title={disabled ? "Pick a connection and preview a message first" : undefined}
      >
        <Send className="h-4 w-4" /> Send test to contact
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send this as a real message?</DialogTitle>
            <DialogDescription>
              This sends a real LinkedIn DM to <strong>{connection?.name}</strong> from your
              account. It is not a draft.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-48 min-w-0 overflow-y-auto rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
            {text}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={sending}>
              Cancel
            </Button>
            <Button onClick={send} disabled={sending}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Yes, send it
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DeleteButton({ onDelete }: { onDelete: () => Promise<void> }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      onClick={() =>
        start(async () => {
          await onDelete();
          toast.success("Deleted");
        })
      }
      disabled={pending}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
    </Button>
  );
}

/** Run `fn` once each time the dialog transitions to open, keyed by `key`. */
function useSyncOnOpen(open: boolean, key: string, fn: () => void) {
  const [lastKey, setLastKey] = useState<string | null>(null);
  if (open && lastKey !== key) {
    setLastKey(key);
    fn();
  }
  if (!open && lastKey !== null) {
    setLastKey(null);
  }
}
