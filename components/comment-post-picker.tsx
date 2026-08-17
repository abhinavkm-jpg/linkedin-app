"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Plus, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  addCampaignPost,
  listAccountRecentPosts,
  type RecentPost,
} from "@/app/(dashboard)/comment-dm/actions";

export function CommentPostPicker({
  campaignId,
  accountId,
  existingPostIds,
  onChanged,
}: {
  campaignId: string;
  accountId: string;
  existingPostIds: string[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [posts, setPosts] = useState<RecentPost[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function load() {
    setOpen(true);
    setLoading(true);
    setError(null);
    setSelected(new Set());
    listAccountRecentPosts(accountId)
      .then((p) => setPosts(p))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load posts"))
      .finally(() => setLoading(false));
  }

  function toggle(postId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
  }

  function add() {
    if (selected.size === 0 || !posts) return;
    start(async () => {
      try {
        for (const p of posts.filter((x) => selected.has(x.postId))) {
          await addCampaignPost(campaignId, { postId: p.postId, postUrl: p.url, title: p.title });
        }
        toast.success(`Added ${selected.size} post${selected.size === 1 ? "" : "s"}`);
        setOpen(false);
        onChanged();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to add posts");
      }
    });
  }

  const existing = new Set(existingPostIds);

  return (
    <>
      <Button size="sm" variant="outline" onClick={load}>
        <Plus className="h-4 w-4" /> Add posts
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add posts to watch</DialogTitle>
            <DialogDescription>
              Pick from your recent posts. We&apos;ll message people who comment on them.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading your recent posts…
            </p>
          ) : error ? (
            <p className="py-6 text-sm text-destructive">{error}</p>
          ) : posts && posts.length > 0 ? (
            <div className="space-y-2">
              {posts.map((p) => {
                const already = existing.has(p.postId);
                const checked = selected.has(p.postId);
                return (
                  <button
                    key={p.postId}
                    type="button"
                    disabled={already}
                    onClick={() => toggle(p.postId)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                      already && "cursor-not-allowed opacity-50",
                      checked ? "border-primary bg-primary/5" : "hover:bg-muted/40",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                        checked ? "border-primary bg-primary text-primary-foreground" : "border-input",
                      )}
                    >
                      {checked && "✓"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-sm">{p.title}</span>
                      <span className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <MessageSquare className="h-3 w-3" /> {p.commentCount} comments
                        {p.date ? ` · ${p.date}` : ""}
                        {already ? " · already added" : ""}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">No recent posts found.</p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={add} disabled={saving || selected.size === 0}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Add {selected.size > 0 ? selected.size : ""}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
