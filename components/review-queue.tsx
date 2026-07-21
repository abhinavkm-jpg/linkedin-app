"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { approveDraft, skipDraft } from "@/app/(dashboard)/campaigns/actions";

interface Draft {
  activityId: string;
  type: string;
  content: string;
  name: string;
}

export function ReviewQueue({ drafts }: { drafts: Draft[] }) {
  return (
    <Card className="border-amber-300/60">
      <CardHeader>
        <CardTitle className="text-base">Awaiting your review ({drafts.length})</CardTitle>
        <CardDescription>
          AI-written messages waiting for approval. Edit if needed, then approve to send.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {drafts.map((d) => (
          <DraftRow key={d.activityId} draft={d} />
        ))}
      </CardContent>
    </Card>
  );
}

function DraftRow({ draft }: { draft: Draft }) {
  const router = useRouter();
  const [text, setText] = useState(draft.content);
  const [pending, start] = useTransition();

  function approve() {
    start(async () => {
      try {
        await approveDraft(draft.activityId, text);
        toast.success(`Sent to ${draft.name}`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Send failed");
      }
    });
  }

  function skip() {
    start(async () => {
      await skipDraft(draft.activityId);
      toast.success("Skipped");
      router.refresh();
    });
  }

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium">{draft.name}</span>
        <Badge variant="outline">{draft.type}</Badge>
      </div>
      <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={skip} disabled={pending}>
          <X className="h-4 w-4" /> Skip
        </Button>
        <Button size="sm" onClick={approve} disabled={pending || !text.trim()}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Approve &amp; send
        </Button>
      </div>
    </div>
  );
}
