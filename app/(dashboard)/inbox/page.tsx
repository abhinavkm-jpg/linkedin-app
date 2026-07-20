import { desc, eq } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { InboxList, type InboxRow } from "@/components/inbox-list";
import { db } from "@/db";
import { chats, linkedinAccounts } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  let rows: InboxRow[] = [];
  let error: string | null = null;

  try {
    const data = await db
      .select({
        id: chats.id,
        attendeeName: chats.attendeeName,
        lastMessageText: chats.lastMessageText,
        lastMessageAt: chats.lastMessageAt,
        unreadCount: chats.unreadCount,
        accountName: linkedinAccounts.name,
      })
      .from(chats)
      .leftJoin(linkedinAccounts, eq(chats.accountId, linkedinAccounts.id))
      .orderBy(desc(chats.lastMessageAt))
      .limit(200);

    rows = data.map((c) => ({
      ...c,
      lastMessageAt: c.lastMessageAt ? c.lastMessageAt.toISOString() : null,
    }));
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load inbox";
  }

  return (
    <>
      <PageHeader title="Inbox" description="Replies from prospects. Responding pauses their sequence." />
      <div className="p-6">
        {error ? (
          <Card className="border-destructive/40">
            <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
          </Card>
        ) : (
          <InboxList chats={rows} />
        )}
      </div>
    </>
  );
}
