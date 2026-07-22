"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Search, Sparkles, UserPlus, Loader2, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StatusPill } from "@/components/status-pill";
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

const SORTS = [
  { value: "connected", label: "Newest connected" },
  { value: "oldest", label: "Oldest connected" },
  { value: "recent", label: "Recently added" },
  { value: "name", label: "Name (A–Z)" },
];

// Optional columns the user can show/hide. "Name" and "Status" are always shown.
const COLUMNS = [
  { key: "headline", label: "Headline" },
  { key: "position", label: "Position" },
  { key: "company", label: "Company" },
  { key: "country", label: "Country" },
  { key: "tags", label: "Tags" },
  { key: "connected", label: "Connected" },
  { key: "account", label: "Account" },
] as const;
type ColKey = (typeof COLUMNS)[number]["key"];
const DEFAULT_COLS: ColKey[] = ["headline", "company", "country"];

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
  filters: {
    accountId?: string;
    search?: string;
    country?: string;
    status?: string;
    enriched?: string;
    sort?: string;
  };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [campaignId, setCampaignId] = useState("");
  const [pending, start] = useTransition();
  const [cols, setCols] = useState<Set<ColKey>>(new Set(DEFAULT_COLS));
  const [colsOpen, setColsOpen] = useState(false);

  const accountName = new Map(accounts.map((a) => [a.id, a.name]));

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
    setSelected(() => (allSelected ? new Set() : new Set(rows.map((r) => r.id))));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleCol(key: ColKey) {
    setCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
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
        toast.success(
          `Enrolled ${res.enrolled}` +
            (res.skipped > 0 ? ` · ${res.skipped} already in this campaign` : ""),
        );
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

  // Checkbox + Name + visible optional cols + Status.
  const colSpan = 2 + cols.size + 1;

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
        <select
          className={selectClass}
          defaultValue={filters.enriched ?? ""}
          onChange={(e) => setParam("enriched", e.target.value)}
        >
          <option value="">Any enrichment</option>
          <option value="yes">Enriched</option>
          <option value="no">Not enriched</option>
        </select>
        <select
          className={selectClass}
          defaultValue={filters.sort ?? "connected"}
          onChange={(e) => setParam("sort", e.target.value)}
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        <div className="relative">
          <Button variant="outline" size="sm" onClick={() => setColsOpen((o) => !o)}>
            <SlidersHorizontal className="h-4 w-4" /> Columns
          </Button>
          {colsOpen && (
            <>
              {/* click-away overlay */}
              <div className="fixed inset-0 z-40" onClick={() => setColsOpen(false)} />
              <div className="absolute right-0 z-50 mt-1 w-52 rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
                <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Show columns</p>
                {COLUMNS.map((c) => (
                  <label
                    key={c.key}
                    className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted/60"
                  >
                    <Checkbox checked={cols.has(c.key)} onCheckedChange={() => toggleCol(c.key)} />
                    {c.label}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
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
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all" />
              </TableHead>
              <TableHead>Name</TableHead>
              {cols.has("headline") && <TableHead>Headline</TableHead>}
              {cols.has("position") && <TableHead>Position</TableHead>}
              {cols.has("company") && <TableHead>Company</TableHead>}
              {cols.has("country") && <TableHead>Country</TableHead>}
              {cols.has("tags") && <TableHead>Tags</TableHead>}
              {cols.has("connected") && <TableHead>Connected</TableHead>}
              {cols.has("account") && <TableHead>Account</TableHead>}
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="py-10 text-center text-sm text-muted-foreground">
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
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <Avatar className="h-7 w-7 shrink-0">
                        {c.profilePictureUrl ? <AvatarImage src={c.profilePictureUrl} alt="" /> : null}
                        <AvatarFallback className="bg-primary/10 text-[10px] font-medium text-primary">
                          {((c.firstName?.[0] ?? "") + (c.lastName?.[0] ?? "")).toUpperCase() || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium whitespace-nowrap">
                        {[c.firstName, c.lastName].filter(Boolean).join(" ") || c.publicIdentifier}
                      </span>
                    </div>
                  </TableCell>
                  {cols.has("headline") && (
                    <TableCell className="max-w-xs truncate text-muted-foreground">{c.headline}</TableCell>
                  )}
                  {cols.has("position") && (
                    <TableCell className="max-w-xs truncate text-muted-foreground">
                      {c.position ?? "—"}
                    </TableCell>
                  )}
                  {cols.has("company") && <TableCell className="whitespace-nowrap">{c.company ?? "—"}</TableCell>}
                  {cols.has("country") && <TableCell>{c.locationCountry ?? "—"}</TableCell>}
                  {cols.has("tags") && (
                    <TableCell className="max-w-40 truncate text-muted-foreground">
                      {c.tags && c.tags.length > 0 ? c.tags.join(", ") : "—"}
                    </TableCell>
                  )}
                  {cols.has("connected") && (
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {c.connectedAt
                        ? formatDistanceToNow(new Date(c.connectedAt), { addSuffix: true })
                        : "—"}
                    </TableCell>
                  )}
                  {cols.has("account") && (
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {accountName.get(c.accountId) ?? "—"}
                    </TableCell>
                  )}
                  <TableCell>
                    <StatusPill status={c.relationshipStatus} />
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
