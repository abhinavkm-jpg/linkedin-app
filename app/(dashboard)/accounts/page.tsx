import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ConnectAccountButton } from "@/components/connect-account-button";
import { ImportAccountsButton } from "@/components/import-accounts-button";
import { AccountCard } from "@/components/account-card";
import { EmptyState } from "@/components/empty-state";
import { Users } from "lucide-react";
import { getAccountsWithStats } from "@/lib/data";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/access";
import { db } from "@/db";
import { users } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const session = await auth();
  const user = session!.user;
  const admin = isAdmin(user);

  let accounts: Awaited<ReturnType<typeof getAccountsWithStats>> = [];
  let members: { id: string; name: string | null; email: string }[] = [];
  let error: string | null = null;
  try {
    accounts = await getAccountsWithStats(user);
    if (admin) {
      members = await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users);
    }
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load accounts";
  }

  return (
    <>
      <PageHeader
        title="Accounts"
        description={
          admin
            ? "All connected LinkedIn accounts. Sync from Unipile and assign each to a team member."
            : "LinkedIn accounts assigned to you. Connect your own via Unipile."
        }
      >
        {admin && <ImportAccountsButton />}
        <ConnectAccountButton />
      </PageHeader>
      <div className="space-y-6 p-6">
        {error && (
          <Card className="border-destructive/40">
            <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

        {accounts.length === 0 && !error ? (
          <EmptyState
            icon={Users}
            title={admin ? "No accounts connected" : "No accounts assigned"}
            description={
              admin
                ? "Import the LinkedIn accounts already connected in your Unipile workspace, or connect a new one."
                : "Connect your own LinkedIn account, or ask an admin to assign one to you."
            }
          >
            {admin ? <ImportAccountsButton /> : <ConnectAccountButton />}
          </EmptyState>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {accounts.map((a) => (
              <AccountCard key={a.id} account={a} isAdmin={admin} members={members} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
