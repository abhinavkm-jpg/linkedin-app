"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
} from "@/app/(dashboard)/templates/actions";
import type { Template, AiPrompt } from "@/db/schema";

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
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Templates
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
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No templates yet.
          </CardContent>
        </Card>
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

  // Sync fields when dialog opens.
  const key = template?.id ?? "new";
  useSyncOnOpen(open, key, () => {
    setName(template?.name ?? "");
    setType(template?.type ?? "message");
    setBody(template?.body ?? "");
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{template ? "Edit template" : "New template"}</DialogTitle>
          <DialogDescription>Use placeholders like {"{{first_name}}"}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
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
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            AI prompts
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
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No AI prompts yet. Seed one with <code>npm run db:seed</code> or create one here.
          </CardContent>
        </Card>
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

  const key = prompt?.id ?? "new";
  useSyncOnOpen(open, key, () => {
    setName(prompt?.name ?? "");
    setModel(prompt?.model ?? "claude-sonnet-5");
    setIsDefault(prompt?.isDefault ?? false);
    setSystemPrompt(prompt?.systemPrompt ?? "");
    setPreview("");
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
    previewAiMessage({ systemPrompt, model, step: "welcome" })
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
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{prompt ? "Edit prompt" : "New AI prompt"}</DialogTitle>
          <DialogDescription>Define the voice and rules for AI-written messages.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
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
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
            />
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
          {preview && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                Sample (welcome message for a fictional VP):
              </p>
              <p className="whitespace-pre-wrap">{preview}</p>
            </div>
          )}
          <div className="flex justify-between gap-2">
            <Button variant="outline" onClick={runPreview} disabled={previewing || !systemPrompt}>
              {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Preview
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={pending}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                Save
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */

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
