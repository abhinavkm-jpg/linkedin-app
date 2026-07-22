"use client";

import { useState, useTransition } from "react";
import { Search, X, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { searchConnectionsForTest } from "@/app/(dashboard)/templates/actions";

export interface PickedConnection {
  id: string;
  name: string;
  headline: string | null;
}

/** Search-and-pick a single connection, used to test templates/prompts against real people. */
export function ConnectionPicker({
  value,
  onChange,
}: {
  value: PickedConnection | null;
  onChange: (c: PickedConnection | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickedConnection[]>([]);
  const [pending, start] = useTransition();

  function search(q: string) {
    setQuery(q);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    start(async () => {
      const rows = await searchConnectionsForTest(q.trim());
      setResults(rows);
    });
  }

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
        <div className="min-w-0">
          <p className="truncate font-medium">{value.name}</p>
          {value.headline && (
            <p className="truncate text-xs text-muted-foreground">{value.headline}</p>
          )}
        </div>
        <Button size="icon-sm" variant="ghost" onClick={() => onChange(null)} className="shrink-0">
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => search(e.target.value)}
          placeholder="Search a connection by name…"
          className="pl-8"
        />
      </div>
      {pending && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Searching…
        </p>
      )}
      {!pending && results.length > 0 && (
        <ul className="max-h-40 divide-y overflow-y-auto rounded-md border">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(r);
                  setResults([]);
                  setQuery("");
                }}
                className="flex w-full flex-col px-3 py-1.5 text-left transition-colors hover:bg-muted/40"
              >
                <span className="truncate text-sm font-medium">{r.name}</span>
                {r.headline && (
                  <span className="truncate text-xs text-muted-foreground">{r.headline}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!pending && query.trim().length >= 2 && results.length === 0 && (
        <p className="text-xs text-muted-foreground">No matches — try a different name.</p>
      )}
    </div>
  );
}
