"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { importAccountsFromUnipile } from "@/app/(dashboard)/accounts/actions";

export function ImportAccountsButton() {
  const [pending, start] = useTransition();
  const router = useRouter();

  function run() {
    start(async () => {
      const res = await importAccountsFromUnipile();
      if (res.error) toast.error(res.error);
      else {
        toast.success(`Imported ${res.imported} account(s) from Unipile`);
        router.refresh();
      }
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={run} disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      Import from Unipile
    </Button>
  );
}
