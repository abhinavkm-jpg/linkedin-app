"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { toast } from "sonner";
import { Search, Sparkles, UserPlus, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { relationshipStatusLabel } from "@/lib/status";
import { enrollConnections, enrichConnections } from "@/app/(dashboard)/connections/actions";
import type { Connection, LinkedinAccount } from "@/db/schema";

const STATUSES = [
  "connection",
  "invite_queued",
  "invited",
  "pending",
  "accepted",
  "messaged",
  "replied",
  "do_not_contact",
];

export function ConnectionsBrowser({
  rows,
  total,
  page,
  pageSize,
  accounts,
  countries,
  campaigns,
  filters,
}: {
  rows: Connection[];
  total: number;
  page: number;
  pageSize: number;
  accounts: Pick<LinkedinAccount, "id" | "name">[];
  countries: string[];
  campaigns: { id: string; name: string; accountId: string }[];
  filters: { accountId?: string; search?: string; country?: string; status?: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [campaignId, setCampaignId] = useState("");
  const [pending, start] = useTransition();

  const setParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(key, value);
      else params.delete(key);
      if (key !== "page") params.delete("page");
      router.replace(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  function toggleAll() {
    setSelected(() => {
      if (allSelected) return new Set();
      return new Set(rows.map((r) => r.id));
    });
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function doEnroll() {
    if (!campaignId) {
      toast.error("Choose a campaign first");
      return;
    }
    const ids = [...selected];
    start(async () => {
      try {
        const res = await enrollConnections(ids, campaignId);
        toast.success(`Enrolled ${res.enrolled} connection(s)`);
        setSelected(new Set());
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Enroll failed");
      }
    });
  }

  function doEnrich() {
    const ids = [...selected];
    start(async () => {
      try {
        await enrichConnections(ids);
        toast.success(`Queued ${ids.length} for enrichment`);
        setSelected(new Set());
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Enrich failed");
      }
    });
  }

  const selectClass =
    "h-8 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            defaultValue={filters.search}
            placeholder="Search name, headline, company…"
            className="pl-8"
            onKeyDown={(e) => {
              if (e.key === "Enter") setParam("q", (e.target as HTMLInputElement).value);
            }}
          />
        </div>
        <select
          className={selectClass}
          defaultValue={filters.accountId ?? ""}
          onChange={(e) => setParam("account", e.target.value)}
        >
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select
          className={selectClass}
          defaultValue={filters.country ?? ""}
          onChange={(e) => setParam("country", e.target.value)}
        >
          <option value="">All countries</option>
          {countries.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          className={selectClass}
          defaultValue={filters.status ?? ""}
          onChange={(e) => setParam("status", e.target.value)}
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {relationshipStatusLabel(s)}
            </option>
          ))}
        </select>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="ml-auto flex items-center gap-2">
            <select
              className={selectClass}
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
            >
              <option value="">Select campaign…</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <Button size="sm" onClick={doEnroll} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Enroll
            </Button>
            <Button size="sm" variant="outline" onClick={doEnrich} disabled={pending}>
              <Sparkles className="h-4 w-4" />
              Enrich
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all" />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="hidden md:table-cell">Headline</TableHead>
              <TableHead className="hidden lg:table-cell">Company</TableHead>
              <TableHead className="hidden lg:table-cell">Country</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  No connections match these filters.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((c) => (
                <TableRow key={c.id} data-state={selected.has(c.id) ? "selected" : undefined}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(c.id)}
                      onCheckedChange={() => toggleOne(c.id)}
                      aria-label="Select row"
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    {[c.firstName, c.lastName].filter(Boolean).join(" ") || c.publicIdentifier}
                  </TableCell>
                  <TableCell className="hidden max-w-xs truncate md:table-cell text-muted-foreground">
                    {c.headline}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">{c.company ?? "—"}</TableCell>
                  <TableCell className="hidden lg:table-cell">{c.locationCountry ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{relationshipStatusLabel(c.relationshipStatus)}</Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {total.toLocaleString()} connection{total === 1 ? "" : "s"}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setParam("page", String(page - 1))}
          >
            Previous
          </Button>
          <span>
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setParam("page", String(page + 1))}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
