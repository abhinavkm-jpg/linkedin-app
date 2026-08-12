"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, X, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ChipMultiSelect } from "@/components/chip-multiselect";
import { updateCampaign } from "@/app/(dashboard)/campaigns/actions";
import { COUNTRIES, nameForCode, toCode } from "@/lib/countries";
import type { CampaignTargeting } from "@/db/schema";

const TITLE_PRESETS = [
  "Manager",
  "Director",
  "VP",
  "Head of",
  "CMO",
  "CRO",
  "CEO",
  "COO",
  "Founder",
  "Co-Founder",
  "Owner",
  "President",
  "Demand Generation",
  "Demand Gen",
  "Marketing",
  "Growth",
  "Revenue",
  "Lead Generation",
  "ABM",
  "Sales",
  "GTM",
];

/** Canonical country multi-select (searchable combobox). Value is a list of ISO2 codes. */
function CountryPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = new Set(value);
  const q = query.trim().toLowerCase();
  const options = COUNTRIES.filter(
    (c) =>
      !selected.has(c.code) &&
      (!q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)),
  );

  function add(code: string) {
    onChange([...value, code]);
    setQuery("");
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          placeholder="Search a country…"
          className="pl-8"
        />
        {open && options.length > 0 && (
          <ul className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-background shadow-lg">
            {options.map((c) => (
              <li key={c.code}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    add(c.code);
                  }}
                  className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted/60"
                >
                  <span>{c.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{c.code}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {open && options.length === 0 && q && (
          <div className="absolute z-50 mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground shadow-lg">
            No match for &ldquo;{query}&rdquo;
          </div>
        )}
      </div>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((code) => (
            <span
              key={code}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
            >
              {nameForCode(code) ?? code}
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => x !== code))}
                className="opacity-70 hover:opacity-100"
                aria-label={`Remove ${nameForCode(code) ?? code}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function IcpEditor({
  campaignId,
  targeting,
  matchCount,
  verifiedCount,
}: {
  campaignId: string;
  targeting: CampaignTargeting;
  matchCount: number | null;
  verifiedCount?: number | null;
  accountId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [titleKeywords, setTitleKeywords] = useState<string[]>(targeting.titleKeywords ?? []);
  // Normalize any legacy name-based targeting ("United States") to ISO codes.
  const [countries, setCountries] = useState<string[]>(() => [
    ...new Set((targeting.countries ?? []).map((c) => toCode(c)).filter((x): x is string => !!x)),
  ]);
  const [tags, setTags] = useState<string[]>(targeting.tags ?? []);

  function save() {
    start(async () => {
      await updateCampaign(campaignId, { targeting: { titleKeywords, countries, tags } });
      toast.success("ICP saved");
      router.refresh();
    });
  }

  const empty = titleKeywords.length + countries.length + tags.length === 0;

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Who this campaign targets. Leave everything empty to target your whole network on this
        account. Title keywords match a connection&apos;s headline, role, job description, company
        &amp; About. When you set countries,{" "}
        <span className="font-medium">only connections whose real country is confirmed to match are
        enrolled</span> — country fills in gradually as profiles get enriched, so the count climbs
        over time.
      </p>
      <div className="space-y-5">
        <div className="space-y-1.5">
          <Label>Title keywords</Label>
          <ChipMultiSelect
            value={titleKeywords}
            onChange={setTitleKeywords}
            presets={TITLE_PRESETS}
            placeholder="Add a title/keyword and press Enter…"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Countries</Label>
          <CountryPicker value={countries} onChange={setCountries} />
          <p className="text-xs text-muted-foreground">
            Country is matched by the connection&apos;s real location, and only applies to enriched
            connections (LinkedIn caps profile lookups).
          </p>
        </div>

        <div className="space-y-1.5">
          <Label>Tags (optional)</Label>
          <ChipMultiSelect value={tags} onChange={setTags} placeholder="Add a tag…" />
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save ICP
          </Button>
          {matchCount !== null && (
            <Badge variant="secondary">
              {matchCount.toLocaleString()} {empty ? "connections (whole network)" : "candidates"}
            </Badge>
          )}
          {!empty && verifiedCount != null && (
            <Badge variant="outline">{verifiedCount.toLocaleString()} verified</Badge>
          )}
        </div>
      </div>
    </div>
  );
}
