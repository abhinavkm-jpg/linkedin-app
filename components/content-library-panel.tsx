"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RefreshCw, Save, ExternalLink, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import {
  setSitemapUrl,
  importContentFromSitemap,
  setContentSections,
  listContentAssets,
} from "@/app/(dashboard)/accounts/actions";

export function ContentLibraryPanel({
  accountId,
  sitemapUrl,
  contentSections,
  sections: initialSections,
  assets: initialAssets,
}: {
  accountId: string;
  sitemapUrl: string | null;
  contentSections: string[];
  sections: { section: string; n: number }[];
  assets: { title: string; url: string; section: string }[];
}) {
  const router = useRouter();
  const [url, setUrl] = useState(sitemapUrl ?? "");
  const [sections, setSections] = useState(initialSections);
  const [assets, setAssets] = useState(initialAssets);
  const [enabled, setEnabled] = useState<Set<string>>(new Set(contentSections));
  const [importing, setImporting] = useState(false);
  const [, save] = useTransition();

  const totalAssets = sections.reduce((sum, s) => sum + s.n, 0);
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
    setSitemapUrl(accountId, url)
      .then(() => importContentFromSitemap(accountId))
      .then(async (res) => {
        if (res.error) {
          toast.error(res.error);
          return;
        }
        setSections(res.sections);
        setAssets(await listContentAssets(accountId, 12));
        toast.success(`Imported ${res.imported.toLocaleString()} URLs`);
        router.refresh();
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

  const visibleAssets = assets.filter((a) => enabled.size === 0 || enabled.has(a.section));

  return (
    <div className="space-y-4">
      {/* Sitemap + import */}
      <Card>
        <CardContent className="space-y-3 py-4">
          <div className="space-y-1.5">
            <Label>Sitemap URL</Label>
            <div className="flex flex-wrap gap-2">
              <Input
                className="min-w-[220px] flex-1"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/sitemap.xml"
              />
              <Button variant="outline" size="sm" onClick={saveUrl} title="Save URL">
                <Save className="h-4 w-4" /> Save
              </Button>
              <Button size="sm" onClick={runImport} disabled={importing || !url.trim()}>
                {importing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Import content
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Crawls the sitemap and stores every article so a follow-up can reference a real one.
            </p>
          </div>

          <div className="flex items-center gap-4 rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <span>
              <span className="font-semibold tabular-nums">{totalAssets.toLocaleString()}</span>{" "}
              <span className="text-muted-foreground">articles synced</span>
            </span>
            <span className="h-4 w-px bg-border" />
            <span>
              <span className="font-semibold tabular-nums">{shareableCount.toLocaleString()}</span>{" "}
              <span className="text-muted-foreground">shareable</span>
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Sections */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="space-y-2 py-4">
            <div className="flex items-center justify-between">
              <Label>Shareable sections</Label>
              <span className="text-xs text-muted-foreground">Tick what AI may reference</span>
            </div>
            {sections.length === 0 ? (
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
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {s.n.toLocaleString()}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Article preview */}
        <Card>
          <CardContent className="space-y-2 py-4">
            <div className="flex items-center justify-between">
              <Label>Recently synced</Label>
              <span className="text-xs text-muted-foreground">
                {visibleAssets.length ? "sample of the library" : ""}
              </span>
            </div>
            {visibleAssets.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Imported articles will appear here.
              </p>
            ) : (
              <ul className="space-y-1">
                {visibleAssets.slice(0, 10).map((a) => (
                  <li key={a.url}>
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noreferrer"
                      className="group flex items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/40"
                    >
                      <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">
                        {a.title || a.url}
                        <span className="ml-1 text-xs text-muted-foreground">/{a.section}</span>
                      </span>
                      <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
