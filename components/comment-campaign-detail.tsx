"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Loader2,
  Play,
  Pause,
  Trash2,
  RefreshCw,
  X,
  MessageSquare,
  Send,
  UserPlus,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CommentPostPicker } from "@/components/comment-post-picker";
import {
  deleteCommentCampaign,
  removeCampaignPost,
  runCommentCampaignNow,
  setCommentCampaignStatus,
  updateCommentCampaign,
} from "@/app/(dashboard)/comment-dm/actions";

type Campaign = {
  id: string;
  name: string;
  status: string;
  templateId: string | null;
  filterMode: "none" | "keywords";
  keywords: string[];
  accountId: string;
  accountName: string;
};

type Post = { id: string; postId: string; title: string | null; url: string | null; commentCount: number };

type Target = {
  id: string;
  name: string | null;
  publicId: string | null;
  commentText: string | null;
  matchedKeyword: string | null;
  connected: boolean;
  channel: string | null;
  state: string;
  reason: string | null;
  sentAt: string | null;
};

const stateTone: Record<string, string> = {
  sent: "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
  pending: "bg-slate-100 text-slate-600 dark:bg-slate-400/15 dark:text-slate-200",
  sending: "bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300",
  skipped: "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
  failed: "bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300",
};

export function CommentCampaignDetail({
  campaign,
  templates,
  posts,
  targets,
}: {
  campaign: Campaign;
  templates: { id: string; name: string }[];
  posts: Post[];
  targets: Target[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [templateId, setTemplateId] = useState(campaign.templateId ?? "");
  const [filterMode, setFilterMode] = useState<"none" | "keywords">(campaign.filterMode);
  const [keywords, setKeywords] = useState(campaign.keywords.join(", "));

  const active = campaign.status === "active";
  const sentCount = targets.filter((t) => t.state === "sent").length;
  const pendingCount = targets.filter((t) => t.state === "pending").length;

  function saveSettings() {
    start(async () => {
      try {
        await updateCommentCampaign(campaign.id, {
          templateId: templateId || null,
          filterMode,
          keywords: keywords.split(",").map((k) => k.trim()).filter(Boolean),
        });
        toast.success("Saved");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save");
      }
    });
  }

  function toggleStatus() {
    const next = active ? "paused" : "active";
    if (next === "active" && !templateId) {
      toast.error("Choose a message template before activating");
      return;
    }
    if (next === "active" && posts.length === 0) {
      toast.error("Add at least one post before activating");
      return;
    }
    start(async () => {
      try {
        await setCommentCampaignStatus(campaign.id, next);
        toast.success(next === "active" ? "Campaign activated" : "Campaign paused");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to update status");
      }
    });
  }

  function runNow() {
    start(async () => {
      try {
        await runCommentCampaignNow(campaign.id);
        toast.success("Queued a poll + send pass");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to run");
      }
    });
  }

  function remove() {
    if (!confirm("Delete this comment campaign? This can't be undone.")) return;
    start(async () => {
      try {
        await deleteCommentCampaign(campaign.id);
      } catch (e) {
        if (e instanceof Error && e.message !== "NEXT_REDIRECT") toast.error(e.message);
      }
    });
  }

  function removePost(id: string) {
    start(async () => {
      try {
        await removeCampaignPost(id);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to remove post");
      }
    });
  }

  return (
    <>
      <PageHeader title={campaign.name} description={`Account: ${campaign.accountName}`}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={active ? "default" : "outline"} className="capitalize">
            {campaign.status}
          </Badge>
          <Button size="sm" variant="outline" onClick={runNow} disabled={pending || !active}>
            <RefreshCw className="h-4 w-4" /> Run now
          </Button>
          <Button size="sm" onClick={toggleStatus} disabled={pending}>
            {active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {active ? "Pause" : "Activate"}
          </Button>
          <Button size="sm" variant="ghost" onClick={remove} disabled={pending}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </PageHeader>

      <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        {/* Settings + posts */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Message & filter</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Message template</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                >
                  <option value="">— Select a template —</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Supports {"{{first_name}}"}, {"{{full_name}}"}, {"{{headline}}"}, {"{{comment_text}}"}.
                  For non-connections it&apos;s sent as a connection-request note (trimmed to 300 chars).
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Who to message</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                  value={filterMode}
                  onChange={(e) => setFilterMode(e.target.value as "none" | "keywords")}
                >
                  <option value="none">Everyone who comments</option>
                  <option value="keywords">Only comments matching keywords</option>
                </select>
              </div>

              {filterMode === "keywords" && (
                <div className="space-y-1.5">
                  <Label>Keywords (comma-separated, match any)</Label>
                  <Input
                    value={keywords}
                    onChange={(e) => setKeywords(e.target.value)}
                    placeholder="interested, demo, pricing, guide"
                  />
                </div>
              )}

              <Button onClick={saveSettings} disabled={pending} size="sm">
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                Save
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Posts ({posts.length})</CardTitle>
              <CommentPostPicker
                campaignId={campaign.id}
                accountId={campaign.accountId}
                existingPostIds={posts.map((p) => p.postId)}
                onChanged={() => router.refresh()}
              />
            </CardHeader>
            <CardContent className="space-y-2">
              {posts.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No posts yet. Add posts to start watching their comments.
                </p>
              ) : (
                posts.map((p) => (
                  <div key={p.id} className="flex items-start gap-2 rounded-lg border p-3">
                    <div className="min-w-0 flex-1">
                      {p.url ? (
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noreferrer"
                          className="block break-words text-sm hover:text-primary hover:underline"
                        >
                          {p.title || p.postId}
                        </a>
                      ) : (
                        <span className="block break-words text-sm">{p.title || p.postId}</span>
                      )}
                      <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <MessageSquare className="h-3 w-3" /> {p.commentCount} comments seen
                      </span>
                    </div>
                    <Button size="icon-sm" variant="ghost" onClick={() => removePost(p.id)} disabled={pending}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Targets */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-base">
              Commenters
              <span className="text-xs font-normal text-muted-foreground">
                {sentCount} reached · {pendingCount} queued
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {targets.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No commenters yet. Once the campaign is active, matching commenters appear here.
              </p>
            ) : (
              <div className="space-y-2">
                {targets.map((t) => (
                  <div key={t.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        {t.publicId ? (
                          <a
                            href={`https://www.linkedin.com/in/${t.publicId}`}
                            target="_blank"
                            rel="noreferrer"
                            className="truncate text-sm font-medium hover:text-primary hover:underline"
                          >
                            {t.name || t.publicId}
                          </a>
                        ) : (
                          <span className="truncate text-sm font-medium">{t.name || "Unknown"}</span>
                        )}
                        {t.channel === "dm" && (
                          <Badge variant="outline" className="gap-1 text-[10px]">
                            <Send className="h-3 w-3" /> DM
                          </Badge>
                        )}
                        {t.channel === "invite" && (
                          <Badge variant="outline" className="gap-1 text-[10px]">
                            <UserPlus className="h-3 w-3" /> Invite
                          </Badge>
                        )}
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
                          stateTone[t.state] ?? stateTone.pending,
                        )}
                      >
                        {t.state}
                      </span>
                    </div>
                    {t.commentText && (
                      <p className="mt-1.5 break-words text-xs text-muted-foreground">
                        “{t.commentText.length > 180 ? `${t.commentText.slice(0, 180)}…` : t.commentText}”
                      </p>
                    )}
                    {(t.matchedKeyword || t.reason) && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {t.matchedKeyword ? `matched: ${t.matchedKeyword}` : ""}
                        {t.matchedKeyword && t.reason ? " · " : ""}
                        {t.reason ?? ""}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
