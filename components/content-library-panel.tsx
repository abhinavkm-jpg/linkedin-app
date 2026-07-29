"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Loader2,
  RefreshCw,
  Save,
  ExternalLink,
  FileText,
  Upload,
  Plus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import {
  setSitemapUrl,
  importContentFromSitemap,
  setContentSections,
  addContentUrls,
  deleteContentAsset,
  listContentAssets,
} from "@/app/(dashboard)/accounts/actions";

type Asset = { title: string; url: string; section: string };

const URL_RE = /https?:\/\/[^\s,;"'<>()\]]+/gi;

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
  assets: Asset[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [url, setUrl] = useState(sitemapUrl ?? "");
  const [sections, setSections] = useState(initialSections);
  const [assets, setAssets] = useState<Asset[]>(initialAssets);
  const [enabled, setEnabled] = useState<Set<string>>(new Set(contentSections));
  const [importing, setImporting] = useState(false);
  const [addText, setAddText] = useState("");
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState("");
  const [, save] = useTransition();

  const totalAssets = sections.reduce((sum, s) => sum + s.n, 0);
  const shareableCount = sections
    .filter((s) => enabled.has(s.section))
    .reduce((sum, s) => sum + s.n, 0);

  async function refresh() {
    setAssets(await listContentAssets(accountId, 500));
    router.refresh();
  }

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
        await refresh();
        toast.success(`Imported ${res.imported.toLocaleString()} URLs`);
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

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const found = text.match(URL_RE) ?? [];
    if (found.length === 0) {
      toast.error("No URLs found in that file");
    } else {
      setAddText((prev) => [prev.trim(), ...found].filter(Boolean).join("\n"));
      toast.success(`Loaded ${found.length} URLs from ${file.name}`);
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  function submitUrls() {
    const urls = (addText.match(URL_RE) ?? []).map((u) => u.trim());
    if (urls.length === 0) {
      toast.error("Paste or upload at least one http(s) URL");
      return;
    }
    setAdding(true);
    addContentUrls(accountId, urls)
      .then(async (res) => {
        if (res.error && res.imported === 0) {
          toast.error(res.error);
          return;
        }
        setSections(res.sections);
        setAddText("");
        await refresh();
        toast.success(`Added ${res.imported.toLocaleString()} URLs`);
      })
      .finally(() => setAdding(false));
  }

  function remove(asset: Asset) {
    setAssets((prev) => prev.filter((a) => a.url !== asset.url));
    save(async () => {
      await deleteContentAsset(accountId, asset.url);
      setSections((prev) =>
        prev
          .map((s) => (s.section === asset.section ? { ...s, n: s.n - 1 } : s))
          .filter((s) => s.n > 0),
      );
      router.refresh();
    });
  }

  const filtered = useMemo(
    () => (filter ? assets.filter((a) => a.section === filter) : assets),
    [assets, filter],
  );

  return (
    <div className="space-y-4">
      {/* Add sources: sitemap + manual/CSV */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 py-4">
            <Label>Crawl a sitemap</Label>
            <div className="flex flex-wrap gap-2">
              <Input
                className="min-w-[180px] flex-1"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/sitemap.xml"
              />
              <Button variant="outline" size="sm" onClick={saveUrl} title="Save URL">
                <Save className="h-4 w-4" />
              </Button>
              <Button size="sm" onClick={runImport} disabled={importing || !url.trim()}>
                {importing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Import
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Crawls the sitemap and stores every article so a follow-up can reference a real one.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 py-4">
            <div className="flex items-center justify-between">
              <Label>Add URLs manually or from CSV</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                title="Upload a CSV or text file of URLs"
              >
                <Upload className="h-4 w-4" /> Upload CSV
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                className="hidden"
                onChange={onFile}
              />
            </div>
            <Textarea
              value={addText}
              onChange={(e) => setAddText(e.target.value)}
              rows={3}
              className="text-xs"
              placeholder="Paste one URL per line, or upload a CSV — any https:// links are detected."
            />
            <Button size="sm" onClick={submitUrls} disabled={adding}>
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add URLs
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Counts */}
      <div className="flex items-center gap-4 rounded-md border bg-muted/30 px-3 py-2 text-sm">
        <span>
          <span className="font-semibold tabular-nums">{totalAssets.toLocaleString()}</span>{" "}
          <span className="text-muted-foreground">articles in library</span>
        </span>
        <span className="h-4 w-px bg-border" />
        <span>
          <span className="font-semibold tabular-nums">{shareableCount.toLocaleString()}</span>{" "}
          <span className="text-muted-foreground">shareable</span>
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_2fr]">
        {/* Shareable sections */}
        <Card>
          <CardContent className="space-y-2 py-4">
            <Label>Shareable sections</Label>
            <p className="text-xs text-muted-foreground">Tick what the AI may reference.</p>
            {sections.length === 0 ? (
              <p className="text-sm text-muted-foreground">No content yet.</p>
            ) : (
              <ul className="max-h-96 divide-y overflow-y-auto rounded-md border">
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

        {/* Full library list */}
        <Card>
          <CardContent className="space-y-2 py-4">
            <div className="flex items-center justify-between gap-2">
              <Label>Library ({filtered.length.toLocaleString()})</Label>
              <select
                className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="">All sections</option>
                {sections.map((s) => (
                  <option key={s.section} value={s.section}>
                    /{s.section} ({s.n})
                  </option>
                ))}
              </select>
            </div>
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing here yet — import a sitemap or add URLs above.
              </p>
            ) : (
              <ul className="max-h-96 divide-y overflow-y-auto rounded-md border">
                {filtered.map((a) => (
                  <li
                    key={a.url}
                    className="group flex items-start gap-2 px-3 py-2 text-sm hover:bg-muted/40"
                  >
                    <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 flex-1 truncate hover:underline"
                      title={a.url}
                    >
                      {a.title || a.url}
                      <span className="ml-1 text-xs text-muted-foreground">/{a.section}</span>
                    </a>
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noreferrer"
                      className="opacity-0 group-hover:opacity-100"
                      aria-label="Open"
                    >
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                    </a>
                    <button
                      onClick={() => remove(a)}
                      className="text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                      aria-label="Remove"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
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
