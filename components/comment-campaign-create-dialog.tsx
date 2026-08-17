"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createCommentCampaign } from "@/app/(dashboard)/comment-dm/actions";

export function CommentCampaignCreateDialog({
  accounts,
}: {
  accounts: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");

  function submit() {
    if (!name.trim() || !accountId) {
      toast.error("Name and account are required");
      return;
    }
    start(async () => {
      try {
        await createCommentCampaign({ name, accountId });
        // redirects on success
      } catch (e) {
        if (e instanceof Error && e.message !== "NEXT_REDIRECT") toast.error(e.message);
      }
    });
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} disabled={accounts.length === 0}>
        <Plus className="h-4 w-4" /> New comment campaign
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New comment campaign</DialogTitle>
            <DialogDescription>
              Watch selected posts and auto-message people who comment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Launch post commenters"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Account</Label>
              <select
                className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={pending}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                Create
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
