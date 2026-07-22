"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Send, Loader2, MessageSquare } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  sendReply,
  markChatRead,
  getChatThread,
  type ThreadMessage,
} from "@/app/(dashboard)/inbox/actions";

export interface InboxRow {
  id: string;
  attendeeName: string | null;
  lastMessageText: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  accountName: string | null;
}

function initials(name: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function InboxList({ chats }: { chats: InboxRow[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (chats.length === 0) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="No conversations yet"
        description="Replies from your prospects will show up here as soon as they come in."
      />
    );
  }

  return (
    <div className="space-y-2">
      {chats.map((c) => (
        <ChatRow
          key={c.id}
          chat={c}
          open={openId === c.id}
          onToggle={() => setOpenId((prev) => (prev === c.id ? null : c.id))}
        />
      ))}
    </div>
  );
}

function ChatRow({
  chat,
  open,
  onToggle,
}: {
  chat: InboxRow;
  open: boolean;
  onToggle: () => void;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [messages, setMessages] = useState<ThreadMessage[] | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const unread = chat.unreadCount > 0;

  function loadThread() {
    setLoadingThread(true);
    getChatThread(chat.id)
      .then((res) => {
        if (res.error) toast.error(res.error);
        else setMessages(res.messages ?? []);
      })
      .finally(() => setLoadingThread(false));
  }

  function openAndRead() {
    const willOpen = !open;
    onToggle();
    if (willOpen) {
      loadThread();
      if (unread) start(async () => void (await markChatRead(chat.id)));
    }
  }

  function reply() {
    start(async () => {
      const res = await sendReply(chat.id, text);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Reply sent");
        setText("");
        loadThread();
        router.refresh();
      }
    });
  }

  return (
    <Card className={cn("overflow-hidden", unread && "border-l-4 border-l-primary")}>
      <button
        onClick={openAndRead}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
      >
        <Avatar className="h-9 w-9 shrink-0">
          <AvatarFallback className={cn("text-xs font-medium", unread ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary")}>
            {initials(chat.attendeeName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn("truncate", unread ? "font-semibold" : "font-medium")}>
              {chat.attendeeName ?? "Unknown"}
            </span>
            {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
            {chat.accountName && (
              <span className="truncate text-xs text-muted-foreground">· {chat.accountName}</span>
            )}
          </div>
          <p className={cn("truncate text-sm", unread ? "text-foreground" : "text-muted-foreground")}>
            {chat.lastMessageText}
          </p>
        </div>
        {chat.lastMessageAt && (
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(chat.lastMessageAt), { addSuffix: true })}
          </span>
        )}
      </button>

      {open && (
        <div className="space-y-3 border-t bg-muted/20 p-3">
          <div className="max-h-80 space-y-2 overflow-y-auto rounded-md">
            {loadingThread && messages === null ? (
              <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading conversation…
              </div>
            ) : messages && messages.length > 0 ? (
              messages.map((m) => (
                <div key={m.id} className={cn("flex", m.mine ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm",
                      m.mine
                        ? "rounded-br-sm bg-primary text-primary-foreground"
                        : "rounded-bl-sm bg-background ring-1 ring-border",
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
              <p className="py-4 text-center text-sm text-muted-foreground">No messages to show.</p>
            )}
          </div>

          <div className="flex items-end gap-2">
            <Textarea
              rows={2}
              placeholder="Write a reply…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="resize-none bg-background"
            />
            <Button size="sm" onClick={reply} disabled={pending || !text.trim()}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
