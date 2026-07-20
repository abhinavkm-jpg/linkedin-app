"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createConnectLink } from "@/app/(dashboard)/accounts/actions";

export function ConnectAccountButton() {
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);

  function connect() {
    setBusy(true);
    start(async () => {
      const res = await createConnectLink();
      setBusy(false);
      if (res.error || !res.url) {
        toast.error(res.error ?? "Could not start connection");
        return;
      }
      // Open Unipile's hosted auth page in a new tab.
      window.open(res.url, "_blank", "noopener,noreferrer");
      toast.info("Complete the connection in the new tab. It will appear here shortly.");
    });
  }

  return (
    <Button onClick={connect} disabled={pending || busy} size="sm">
      <Plus className="h-4 w-4" />
      Connect LinkedIn
    </Button>
  );
}
