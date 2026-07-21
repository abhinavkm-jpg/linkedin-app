"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Target } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ChipMultiSelect } from "@/components/chip-multiselect";
import { updateCampaign } from "@/app/(dashboard)/campaigns/actions";
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

const COUNTRY_PRESETS = ["US", "GB", "UK", "SG", "IL", "CA", "AU"];

export function IcpEditor({
  campaignId,
  targeting,
  matchCount,
}: {
  campaignId: string;
  targeting: CampaignTargeting;
  matchCount: number | null;
  accountId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [titleKeywords, setTitleKeywords] = useState<string[]>(targeting.titleKeywords ?? []);
  const [countries, setCountries] = useState<string[]>(targeting.countries ?? []);
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="h-4 w-4" /> Ideal Customer Profile (ICP)
        </CardTitle>
        <CardDescription>
          Who this campaign targets. Leave everything empty to target your whole network on this
          account. Title keywords match a connection&apos;s LinkedIn headline (and role once
          enriched).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
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
          <ChipMultiSelect
            value={countries}
            onChange={setCountries}
            presets={COUNTRY_PRESETS}
            placeholder="Add a country code (e.g. US)…"
          />
          <p className="text-xs text-muted-foreground">
            Country filtering only applies to enriched connections (LinkedIn caps profile lookups).
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
              {matchCount.toLocaleString()} {empty ? "connections (whole network)" : "match"}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
