import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ConnectAccountButton } from "@/components/connect-account-button";
import { ImportAccountsButton } from "@/components/import-accounts-button";
import { AccountCard } from "@/components/account-card";
import { getAccountsWithStats } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  let accounts: Awaited<ReturnType<typeof getAccountsWithStats>> = [];
  let error: string | null = null;
  try {
    accounts = await getAccountsWithStats();
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load accounts";
  }

  return (
    <>
      <PageHeader
        title="Accounts"
        description="Connect LinkedIn accounts via Unipile. Each account has its own daily limits."
      >
        <ImportAccountsButton />
        <ConnectAccountButton />
      </PageHeader>
      <div className="space-y-6 p-6">
        {error && (
          <Card className="border-destructive/40">
            <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

        {accounts.length === 0 && !error ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-sm text-muted-foreground">
                No accounts yet. Connect a LinkedIn account to start syncing connections.
              </p>
              <ConnectAccountButton />
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {accounts.map((a) => (
              <AccountCard key={a.id} account={a} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
