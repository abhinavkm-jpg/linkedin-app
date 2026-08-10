"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
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

/** Canonical country multi-select. Value is a list of ISO2 codes; labels show names. */
function CountryPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const selected = new Set(value);
  const available = COUNTRIES.filter((c) => !selected.has(c.code));
  return (
    <div className="space-y-2">
      <select
        className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
        value=""
        onChange={(e) => {
          if (e.target.value) onChange([...value, e.target.value]);
        }}
      >
        <option value="">Add a country…</option>
        {available.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name} ({c.code})
          </option>
        ))}
      </select>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((code) => (
            <span
              key={code}
              className="inline-flex items-center gap-1 rounded-full border bg-muted px-2.5 py-1 text-xs font-medium"
            >
              {nameForCode(code) ?? code}
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => x !== code))}
                className="text-muted-foreground hover:text-foreground"
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
        &amp; About. <span className="font-medium">Country is verified as each connection gets
        enriched</span> — everyone matching by title enters the pipeline, then only true matches are
        messaged.
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
