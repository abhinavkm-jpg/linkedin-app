"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Multi-select of string values: removable chips for what's selected, a text
 * input to add custom values (Enter or comma), and optional preset chips.
 */
export function ChipMultiSelect({
  value,
  onChange,
  presets = [],
  placeholder = "Type and press Enter to add…",
}: {
  value: string[];
  onChange: (v: string[]) => void;
  presets?: string[];
  placeholder?: string;
}) {
  const [input, setInput] = useState("");

  function add(raw: string) {
    const v = raw.trim();
    if (!v) return;
    if (!value.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...value, v]);
    setInput("");
  }
  function remove(v: string) {
    onChange(value.filter((x) => x !== v));
  }
  function toggle(v: string) {
    if (value.some((x) => x.toLowerCase() === v.toLowerCase())) remove(v);
    else onChange([...value, v]);
  }

  const availablePresets = presets.filter(
    (p) => !value.some((v) => v.toLowerCase() === p.toLowerCase()),
  );

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => remove(v)}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground"
            >
              {v}
              <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}

      <Input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(input);
          } else if (e.key === "Backspace" && input === "" && value.length > 0) {
            remove(value[value.length - 1]);
          }
        }}
        onBlur={() => add(input)}
        placeholder={placeholder}
      />

      {availablePresets.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {availablePresets.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => toggle(p)}
              className={cn(
                "rounded-md border border-input px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted",
              )}
            >
              + {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
