"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/status-pill";
import { enrollMatchingIcp } from "@/app/(dashboard)/campaigns/actions";

export function EnrollmentPanel({
  campaignId,
  hasIcp,
  matchCount,
  enrolled,
}: {
  campaignId: string;
  hasIcp: boolean;
  matchCount: number | null;
  enrolled: { enrollmentId: string; state: string; name: string; headline: string | null }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function enroll() {
    start(async () => {
      try {
        const res = await enrollMatchingIcp(campaignId);
        const parts = [`Enrolled ${res.enrolled}`];
        if (res.skipped > 0) parts.push(`${res.skipped} already in this campaign`);
        if (res.matched > res.enrolled + res.skipped) parts.push("first 1000 per run");
        toast.success(parts.join(" · "));
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Enroll failed");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Enrollment</CardTitle>
        <CardDescription>
          Add connections into this campaign. Enroll everyone matching your ICP, or pick people
          manually from the Connections page.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={enroll} disabled={pending || (matchCount ?? 0) === 0}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            {hasIcp ? "Enroll matching" : "Enroll all"}
            {matchCount !== null ? ` (${matchCount.toLocaleString()})` : ""}
          </Button>
          <Button variant="outline" render={<Link href="/connections" />}>
            Enroll manually
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {hasIcp
            ? "Targets connections matching your ICP."
            : "No ICP set — this targets your whole network on this account."}{" "}
          People already in this campaign are skipped unless &ldquo;multi DMs&rdquo; is on.
        </p>

        <div>
          <h4 className="mb-2 text-sm font-medium">
            Enrolled {enrolled.length > 0 ? `(showing ${enrolled.length})` : ""}
          </h4>
          {enrolled.length === 0 ? (
            <p className="text-sm text-muted-foreground">No one enrolled yet.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {enrolled.map((e) => (
                <li key={e.enrollmentId} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium">{e.name}</span>
                    {e.headline && (
                      <span className="ml-2 truncate text-muted-foreground">{e.headline}</span>
                    )}
                  </div>
                  <StatusPill status={e.state} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
