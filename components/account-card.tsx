"use client";

import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { RefreshCw, Loader2, Settings, Sparkles, UserRound } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { QuotaGauge } from "@/components/quota-gauge";
import { AccountAvatar } from "@/components/account-avatar";
import { accountStatusPillClasses } from "@/lib/status";
import { cn } from "@/lib/utils";
import { startSync, assignAccountOwner, setAccountAutoEnrich } from "@/app/(dashboard)/accounts/actions";
import type { AccountWithStats } from "@/lib/data";

export function AccountCard({
  account,
  isAdmin,
  members,
  settingsLink = true,
}: {
  account: AccountWithStats;
  isAdmin: boolean;
  members: { id: string; name: string | null; email: string }[];
  settingsLink?: boolean;
}) {
  const [pending, start] = useTransition();
  const syncing = pending || account.syncStatus === "running";

  function sync() {
    start(async () => {
      try {
        await startSync(account.id);
        toast.success("Sync started. Connections will populate as it runs.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to start sync");
      }
    });
  }

  function assign(userId: string) {
    start(async () => {
      try {
        await assignAccountOwner(account.id, userId || null);
        toast.success("Owner updated");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to assign");
      }
    });
  }

  function toggleAutoEnrich(next: boolean) {
    start(async () => {
      try {
        await setAccountAutoEnrich(account.id, next);
        toast.success(
          next
            ? `Auto-enrich on — enriching up to ${account.autoEnrichDailyCap}/day`
            : "Auto-enrich off",
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to update");
      }
    });
  }

  return (
    <Card className="group relative gap-0 overflow-hidden py-0 transition-shadow hover:shadow-md">
      <div className="h-1 w-full bg-gradient-to-r from-primary via-primary/70 to-primary/30" />

      {/* Identity */}
      <div className="flex items-center gap-3 px-5 pt-5">
        <AccountAvatar name={account.name} className="h-11 w-11 text-sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold leading-tight">{account.name}</p>
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              {account.connectionCount.toLocaleString()}
            </span>{" "}
            connections
            {account.lastSyncAt
              ? ` · synced ${formatDistanceToNow(account.lastSyncAt, { addSuffix: true })}`
              : " · never synced"}
          </p>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
            accountStatusPillClasses(account.status),
          )}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {account.status}
        </span>
      </div>

      <CardContent className="space-y-4 px-5 pt-4 pb-5">
        {/* Daily quotas */}
        <div className="grid grid-cols-2 gap-x-5 gap-y-3 rounded-lg border bg-muted/30 p-3">
          <QuotaGauge label="Invites" used={account.quotas.invite.used} cap={account.quotas.invite.cap} />
          <QuotaGauge label="Messages" used={account.quotas.message.used} cap={account.quotas.message.cap} />
          <QuotaGauge label="InMail" used={account.quotas.inmail.used} cap={account.quotas.inmail.cap} />
          <QuotaGauge label="Enrichments" used={account.quotas.enrich.used} cap={account.quotas.enrich.cap} />
          <QuotaGauge
            label="Auto-enrich"
            used={account.quotas.autoEnrich.used}
            cap={account.quotas.autoEnrich.cap}
          />
        </div>

        {isAdmin && (
          <>
            <label className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 py-2 transition-colors hover:bg-muted/40">
              <span className="flex items-start gap-2 text-sm">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>
                  <span className="font-medium">Auto-enrich daily</span>
                  <span className="block text-xs text-muted-foreground">
                    Fill job title, company &amp; country for ICP — {account.autoEnrichDailyCap}/day.
                  </span>
                </span>
              </span>
              <Switch checked={account.autoEnrich} onCheckedChange={toggleAutoEnrich} disabled={pending} />
            </label>

            <div className="flex items-center gap-2 rounded-lg border px-3 py-1.5">
              <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Owner</span>
              <select
                className="ml-auto h-8 max-w-[60%] rounded-md border border-input bg-transparent px-2 text-sm"
                value={account.ownerUserId ?? ""}
                onChange={(e) => assign(e.target.value)}
                disabled={pending}
              >
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name ?? m.email}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={sync} disabled={syncing} className="flex-1">
                {syncing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {account.syncStatus === "running" ? "Syncing…" : "Sync"}
              </Button>
              {settingsLink && (
                <Button
                  size="sm"
                  render={<Link href={`/accounts/${account.id}`} />}
                  className="flex-1"
                >
                  <Settings className="h-4 w-4" /> Settings
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
