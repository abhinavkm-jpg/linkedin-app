"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Send, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { sendReply, markChatRead } from "@/app/(dashboard)/inbox/actions";

export interface InboxRow {
  id: string;
  attendeeName: string | null;
  lastMessageText: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  accountName: string | null;
}

export function InboxList({ chats }: { chats: InboxRow[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (chats.length === 0) {
    return (
      <Card className="py-12 text-center text-sm text-muted-foreground">
        No conversations yet. Replies from your prospects will appear here.
      </Card>
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
  const [text, setText] = useState("");
  const [pending, start] = useTransition();

  function reply() {
    start(async () => {
      const res = await sendReply(chat.id, text);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Reply sent");
        setText("");
      }
    });
  }

  function openAndRead() {
    onToggle();
    if (!open && chat.unreadCount > 0) {
      start(async () => void (await markChatRead(chat.id)));
    }
  }

  return (
    <Card className="overflow-hidden">
      <button
        onClick={openAndRead}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{chat.attendeeName ?? "Unknown"}</span>
            {chat.unreadCount > 0 && <Badge>{chat.unreadCount}</Badge>}
            {chat.accountName && (
              <span className="text-xs text-muted-foreground">· {chat.accountName}</span>
            )}
          </div>
          <p className="truncate text-sm text-muted-foreground">{chat.lastMessageText}</p>
        </div>
        {chat.lastMessageAt && (
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(chat.lastMessageAt), { addSuffix: true })}
          </span>
        )}
      </button>

      {open && (
        <div className="space-y-2 border-t bg-muted/20 p-3">
          <Textarea
            rows={3}
            placeholder="Write a reply…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={reply} disabled={pending || !text.trim()}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send reply
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
