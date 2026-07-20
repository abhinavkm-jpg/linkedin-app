"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { updateAccountCaps } from "@/app/(dashboard)/accounts/actions";

export function CapsEditor({
  accountId,
  initial,
}: {
  accountId: string;
  initial: {
    dailyInviteCap: number;
    dailyMessageCap: number;
    dailyInmailCap: number;
    dailyEnrichCap: number;
  };
}) {
  const [caps, setCaps] = useState(initial);
  const [pending, start] = useTransition();

  function field(key: keyof typeof caps, label: string) {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}</Label>
        <Input
          type="number"
          min={0}
          value={caps[key]}
          onChange={(e) => setCaps({ ...caps, [key]: parseInt(e.target.value || "0", 10) })}
        />
      </div>
    );
  }

  function save() {
    start(async () => {
      await updateAccountCaps(accountId, caps);
      toast.success("Limits updated");
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {field("dailyInviteCap", "Invites / day")}
        {field("dailyMessageCap", "Messages / day")}
        {field("dailyInmailCap", "InMail / day")}
        {field("dailyEnrichCap", "Enrichments / day")}
      </div>
      <Button size="sm" onClick={save} disabled={pending}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        Save limits
      </Button>
    </div>
  );
}
