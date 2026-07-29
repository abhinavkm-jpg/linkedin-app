"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RefreshCw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  setSitemapUrl,
  importContentFromSitemap,
  setContentSections,
  getContentSections,
} from "@/app/(dashboard)/accounts/actions";

export function ContentLibraryDialog({
  accountId,
  accountName,
  sitemapUrl,
  contentSections,
}: {
  accountId: string;
  accountName: string;
  sitemapUrl: string | null;
  contentSections: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(sitemapUrl ?? "");
  const [sections, setSections] = useState<{ section: string; n: number }[]>([]);
  const [enabled, setEnabled] = useState<Set<string>>(new Set(contentSections));
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [, save] = useTransition();

  function openDialog() {
    setOpen(true);
    setLoading(true);
    getContentSections(accountId)
      .then(setSections)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  const shareableCount = sections
    .filter((s) => enabled.has(s.section))
    .reduce((sum, s) => sum + s.n, 0);

  function saveUrl() {
    save(async () => {
      await setSitemapUrl(accountId, url);
      toast.success("Sitemap URL saved");
      router.refresh();
    });
  }

  function runImport() {
    setImporting(true);
    // Persist the URL first so the import uses the latest value.
    setSitemapUrl(accountId, url)
      .then(() => importContentFromSitemap(accountId))
      .then((res) => {
        if (res.error) toast.error(res.error);
        else {
          setSections(res.sections);
          toast.success(`Imported ${res.imported.toLocaleString()} URLs`);
          router.refresh();
        }
      })
      .finally(() => setImporting(false));
  }

  function toggleSection(section: string, on: boolean) {
    const next = new Set(enabled);
    if (on) next.add(section);
    else next.delete(section);
    setEnabled(next);
    save(async () => {
      await setContentSections(accountId, [...next]);
      router.refresh();
    });
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={openDialog}>
        Content library
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Content library — {accountName}</DialogTitle>
            <DialogDescription>
              Crawl this account&apos;s sitemap and choose which sections are shareable in
              content follow-ups.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Sitemap URL</Label>
              <div className="flex gap-2">
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/sitemap.xml"
                />
                <Button variant="outline" size="sm" onClick={saveUrl} title="Save URL">
                  <Save className="h-4 w-4" />
                </Button>
              </div>
              <Button size="sm" onClick={runImport} disabled={importing || !url.trim()}>
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Import content
              </Button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Shareable sections</Label>
                <span className="text-xs text-muted-foreground">
                  {shareableCount.toLocaleString()} shareable
                </span>
              </div>
              {loading ? (
                <p className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </p>
              ) : sections.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No content yet — set a sitemap URL and click Import.
                </p>
              ) : (
                <ul className="divide-y rounded-md border">
                  {sections.map((s) => (
                    <li key={s.section}>
                      <label className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-muted/40">
                        <span className="flex items-center gap-2">
                          <Checkbox
                            checked={enabled.has(s.section)}
                            onCheckedChange={(v) => toggleSection(s.section, v === true)}
                          />
                          <span className="font-medium">/{s.section}</span>
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {s.n.toLocaleString()}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">
                Checked sections are used when a follow-up shares an article.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
