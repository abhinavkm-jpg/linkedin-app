"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { RefreshCw, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { QuotaGauge } from "@/components/quota-gauge";
import { accountStatusTone } from "@/lib/status";
import { startSync, assignAccountOwner, setAccountAutoEnrich } from "@/app/(dashboard)/accounts/actions";
import type { AccountWithStats } from "@/lib/data";

export function AccountCard({
  account,
  isAdmin,
  members,
}: {
  account: AccountWithStats;
  isAdmin: boolean;
  members: { id: string; name: string | null; email: string }[];
}) {
  const [pending, start] = useTransition();

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
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
        <div className="min-w-0">
          <CardTitle className="truncate text-base">{account.name}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {account.connectionCount.toLocaleString()} connections
            {account.lastSyncAt
              ? ` · synced ${formatDistanceToNow(account.lastSyncAt, { addSuffix: true })}`
              : " · never synced"}
          </p>
        </div>
        <Badge variant={accountStatusTone(account.status)}>{account.status}</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <QuotaGauge label="Invites / day" used={account.quotas.invite.used} cap={account.quotas.invite.cap} />
          <QuotaGauge label="Messages / day" used={account.quotas.message.used} cap={account.quotas.message.cap} />
          <QuotaGauge label="InMail / day" used={account.quotas.inmail.used} cap={account.quotas.inmail.cap} />
          <QuotaGauge label="Enrichments / day" used={account.quotas.enrich.used} cap={account.quotas.enrich.cap} />
          <QuotaGauge
            label="Auto-enrich / day"
            used={account.quotas.autoEnrich.used}
            cap={account.quotas.autoEnrich.cap}
          />
        </div>

        {isAdmin && (
          <label className="flex cursor-pointer items-center justify-between gap-2 rounded-md border px-3 py-2">
            <span className="text-sm">
              <span className="font-medium">Auto-enrich daily</span>
              <span className="block text-xs text-muted-foreground">
                Fill in job title, company &amp; country for ICP — {account.autoEnrichDailyCap}/day.
              </span>
            </span>
            <Switch
              checked={account.autoEnrich}
              onCheckedChange={toggleAutoEnrich}
              disabled={pending}
            />
          </label>
        )}

        {isAdmin && (
          <div className="space-y-1.5">
            <Label className="text-xs">Assigned to</Label>
            <select
              className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm"
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
        )}

        {isAdmin && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={sync}
              disabled={pending || account.syncStatus === "running"}
            >
              {pending || account.syncStatus === "running" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {account.syncStatus === "running" ? "Syncing…" : "Sync connections"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
