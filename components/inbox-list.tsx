"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Send, Loader2, MessageSquare, ExternalLink, Bot, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  sendReply,
  markChatRead,
  getChatThread,
  type ThreadMessage,
} from "@/app/(dashboard)/inbox/actions";

export interface InboxRow {
  id: string;
  name: string;
  headline: string | null;
  avatarUrl: string | null;
  profileUrl: string | null;
  lastMessageText: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  aiDecision: string | null;
  aiReason: string | null;
  accountName: string | null;
}

/** Small transparency note showing the AI reply-triage decision + reason. */
function AiNote({ decision, reason }: { decision: string | null; reason: string | null }) {
  if (!decision) return null;
  const handedOff = decision === "handoff";
  return (
    <span
      className={cn(
        "mt-0.5 inline-flex items-center gap-1 text-xs",
        handedOff ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
      )}
    >
      <Bot className="h-3 w-3 shrink-0" />
      <span className="truncate">
        {handedOff ? "Handed off" : "Kept sequence"}
        {reason ? ` — ${reason}` : ""}
      </span>
    </span>
  );
}

function initials(name: string | null): string {
  if (!name || name === "Unknown") return "?";
  return name
    .split(" ")
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

type Tab = "all" | "unread" | "handoff";

export function InboxList({ chats }: { chats: InboxRow[] }) {
  const router = useRouter();
  const [active, setActive] = useState<InboxRow | null>(null);
  const [, startRead] = useTransition();
  const [query, setQuery] = useState("");
  const [account, setAccount] = useState("");
  const [tab, setTab] = useState<Tab>("all");

  const accountNames = useMemo(
    () => [...new Set(chats.map((c) => c.accountName).filter(Boolean) as string[])].sort(),
    [chats],
  );
  const unreadTotal = chats.reduce((n, c) => n + (c.unreadCount > 0 ? 1 : 0), 0);
  const handoffTotal = chats.reduce((n, c) => n + (c.aiDecision === "handoff" ? 1 : 0), 0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return chats.filter((c) => {
      if (account && c.accountName !== account) return false;
      if (tab === "unread" && c.unreadCount === 0) return false;
      if (tab === "handoff" && c.aiDecision !== "handoff") return false;
      if (q) {
        const hay = `${c.name} ${c.headline ?? ""} ${c.lastMessageText ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [chats, query, account, tab]);

  function open(chat: InboxRow) {
    setActive(chat);
    if (chat.unreadCount > 0) {
      startRead(async () => {
        await markChatRead(chat.id);
        router.refresh();
      });
    }
  }

  if (chats.length === 0) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="No conversations yet"
        description="Replies from your prospects will show up here as soon as they come in."
      />
    );
  }

  const selectClass =
    "h-9 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

  return (
    <>
      {/* Toolbar: search · account · segmented filter */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a name or message…"
            className="pl-8"
          />
        </div>
        {accountNames.length > 1 && (
          <select className={selectClass} value={account} onChange={(e) => setAccount(e.target.value)}>
            <option value="">All accounts</option>
            {accountNames.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        )}
        <div className="inline-flex rounded-md border p-0.5">
          <TabButton active={tab === "all"} onClick={() => setTab("all")}>
            All
          </TabButton>
          <TabButton active={tab === "unread"} onClick={() => setTab("unread")}>
            Unread{unreadTotal > 0 ? ` (${unreadTotal})` : ""}
          </TabButton>
          {handoffTotal > 0 && (
            <TabButton active={tab === "handoff"} onClick={() => setTab("handoff")}>
              Needs you ({handoffTotal})
            </TabButton>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <p className="rounded-lg border bg-muted/20 py-12 text-center text-sm text-muted-foreground">
            No conversations match these filters.
          </p>
        ) : (
          filtered.map((c) => <ChatRowButton key={c.id} chat={c} onOpen={() => open(c)} />)
        )}
      </div>

      <ChatDialog
        key={active?.id ?? "closed"}
        chat={active}
        onClose={() => {
          setActive(null);
          router.refresh();
        }}
      />
    </>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded px-3 py-1 text-sm font-medium transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function ChatRowButton({ chat, onOpen }: { chat: InboxRow; onOpen: () => void }) {
  const unread = chat.unreadCount > 0;
  return (
    <Card
      className={cn(
        "overflow-hidden transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md",
        unread && "border-l-4 border-l-primary bg-primary/[0.04]",
      )}
    >
      <button
        onClick={onOpen}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <Avatar size="lg" className="shrink-0">
          {chat.avatarUrl && <AvatarImage src={chat.avatarUrl} alt={chat.name} />}
          <AvatarFallback
            className={cn(
              "font-medium",
              unread ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary",
            )}
          >
            {initials(chat.name)}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn("truncate", unread ? "font-semibold" : "font-medium")}>
              {chat.name}
            </span>
            {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
          </div>
          {chat.headline ? (
            <p className="truncate text-xs text-muted-foreground">{chat.headline}</p>
          ) : chat.accountName ? (
            <p className="truncate text-xs text-muted-foreground">via {chat.accountName}</p>
          ) : null}
          <p
            className={cn(
              "mt-0.5 truncate text-sm",
              unread ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {chat.lastMessageText}
          </p>
          <AiNote decision={chat.aiDecision} reason={chat.aiReason} />
        </div>

        {chat.lastMessageAt && (
          <span className="shrink-0 self-start text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(chat.lastMessageAt), { addSuffix: true })}
          </span>
        )}
      </button>
    </Card>
  );
}

function ChatDialog({ chat, onClose }: { chat: InboxRow | null; onClose: () => void }) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [messages, setMessages] = useState<ThreadMessage[] | null>(null);
  // This component is keyed by chat id, so it mounts fresh per conversation —
  // no need to reset state synchronously inside the effect.
  const [loading, setLoading] = useState(!!chat);

  useEffect(() => {
    if (!chat) return;
    let cancelled = false;
    getChatThread(chat.id)
      .then((res) => {
        if (cancelled) return;
        if (res.error) toast.error(res.error);
        else setMessages(res.messages ?? []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [chat]);

  function reply() {
    if (!chat) return;
    start(async () => {
      const res = await sendReply(chat.id, text);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Reply sent");
      setText("");
      const thread = await getChatThread(chat.id);
      if (!thread.error) setMessages(thread.messages ?? []);
    });
  }

  return (
    <Dialog open={!!chat} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        showCloseButton
        className="flex h-[80vh] max-h-[680px] flex-col gap-0 p-0 sm:max-w-lg"
      >
        {chat && (
          <>
            <DialogHeader className="flex-row items-center gap-3 border-b p-4 pr-12">
              <Avatar size="lg" className="shrink-0">
                {chat.avatarUrl && <AvatarImage src={chat.avatarUrl} alt={chat.name} />}
                <AvatarFallback className="bg-primary/10 font-medium text-primary">
                  {initials(chat.name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <DialogTitle className="truncate">{chat.name}</DialogTitle>
                {chat.headline && (
                  <p className="truncate text-xs text-muted-foreground">{chat.headline}</p>
                )}
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  {chat.accountName && <span className="truncate">via {chat.accountName}</span>}
                  {chat.profileUrl && (
                    <a
                      href={chat.profileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                    >
                      Profile <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                <AiNote decision={chat.aiDecision} reason={chat.aiReason} />
              </div>
            </DialogHeader>

            <div className="flex-1 space-y-2 overflow-y-auto bg-muted/20 p-4">
              {loading && messages === null ? (
                <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading conversation…
                </div>
              ) : messages && messages.length > 0 ? (
                messages.map((m) => (
                  <div key={m.id} className={cn("flex", m.mine ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm shadow-sm",
                        m.mine
                          ? "rounded-br-sm bg-primary text-primary-foreground"
                          : "rounded-bl-sm bg-card ring-1 ring-border",
                      )}
                    >
                      {m.text}
                      {m.at && (
                        <span
                          className={cn(
                            "mt-1 block text-[10px]",
                            m.mine ? "text-primary-foreground/70" : "text-muted-foreground",
                          )}
                        >
                          {formatDistanceToNow(new Date(m.at), { addSuffix: true })}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No messages to show.
                </p>
              )}
            </div>

            <div className="flex items-end gap-2 border-t p-3">
              <Textarea
                rows={2}
                placeholder={`Reply to ${chat.name.split(" ")[0] ?? ""}…`}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    if (text.trim()) reply();
                  }
                }}
                className="resize-none bg-background"
              />
              <Button size="sm" onClick={reply} disabled={pending || !text.trim()}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
