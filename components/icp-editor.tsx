"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Target } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { updateCampaign } from "@/app/(dashboard)/campaigns/actions";
import type { CampaignTargeting } from "@/db/schema";

const COUNTRY_PRESETS = ["US", "GB", "UK", "SG", "IL", "CA", "AU"];

function toList(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

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
  const [titles, setTitles] = useState((targeting.titleKeywords ?? []).join(", "));
  const [tags, setTags] = useState((targeting.tags ?? []).join(", "));
  const [countries, setCountries] = useState<string[]>(targeting.countries ?? []);

  function toggleCountry(c: string) {
    setCountries((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  function save() {
    start(async () => {
      await updateCampaign(campaignId, {
        targeting: {
          titleKeywords: toList(titles),
          countries,
          tags: toList(tags),
        },
      });
      toast.success("ICP saved");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="h-4 w-4" /> Ideal Customer Profile (ICP)
        </CardTitle>
        <CardDescription>
          Who this campaign targets. Title keywords match a connection&apos;s LinkedIn headline (and
          role once enriched). Used to find and enroll matching connections.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>Title keywords (comma separated)</Label>
          <Input
            value={titles}
            onChange={(e) => setTitles(e.target.value)}
            placeholder="VP, Director, Head of, Demand Gen, Marketing, CMO, Founder"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Countries</Label>
          <div className="flex flex-wrap gap-1.5">
            {[...new Set([...COUNTRY_PRESETS, ...countries])].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => toggleCountry(c)}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs",
                  countries.includes(c)
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input text-muted-foreground hover:bg-muted",
                )}
              >
                {c}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Country filtering only applies to enriched connections (LinkedIn caps profile lookups).
          </p>
        </div>

        <div className="space-y-1.5">
          <Label>Tags (optional, comma separated)</Label>
          <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="warm, event-lead" />
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save ICP
          </Button>
          {matchCount !== null && (
            <Badge variant="secondary">{matchCount.toLocaleString()} connections match</Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
