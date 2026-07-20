import { desc } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ConnectionsBrowser } from "@/components/connections-browser";
import { db } from "@/db";
import { linkedinAccounts, campaigns } from "@/db/schema";
import { getConnections, getConnectionCountries } from "@/lib/data-connections";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const filters = {
    accountId: sp.account,
    search: sp.q,
    country: sp.country,
    status: sp.status,
    page: sp.page ? parseInt(sp.page, 10) : 1,
  };

  let data: {
    result: Awaited<ReturnType<typeof getConnections>>;
    accounts: { id: string; name: string }[];
    countries: string[];
    camps: { id: string; name: string; accountId: string }[];
  } | null = null;
  let error: string | null = null;

  try {
    const [result, accounts, countries, camps] = await Promise.all([
      getConnections(filters),
      db
        .select({ id: linkedinAccounts.id, name: linkedinAccounts.name })
        .from(linkedinAccounts)
        .orderBy(desc(linkedinAccounts.createdAt)),
      getConnectionCountries(),
      db
        .select({ id: campaigns.id, name: campaigns.name, accountId: campaigns.accountId })
        .from(campaigns)
        .orderBy(desc(campaigns.createdAt)),
    ]);
    data = { result, accounts, countries, camps };
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load connections";
  }

  const content = error ? (
    <Card className="border-destructive/40">
      <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
    </Card>
  ) : data ? (
    <ConnectionsBrowser
      rows={data.result.rows}
      total={data.result.total}
      page={data.result.page}
      pageSize={data.result.pageSize}
      accounts={data.accounts}
      countries={data.countries}
      campaigns={data.camps}
      filters={filters}
    />
  ) : null;

  return (
    <>
      <PageHeader
        title="Connections"
        description="Search and filter your synced network, then enrich or enroll into campaigns."
      />
      <div className="p-6">{content}</div>
    </>
  );
}
