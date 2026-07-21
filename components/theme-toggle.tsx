"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Toggle theme"
      onClick={() =>
        setTheme(
          document.documentElement.classList.contains("dark") ? "light" : "dark",
        )
      }
    >
      {/* CSS handles which icon shows based on the active theme class. */}
      <Sun className="hidden h-4 w-4 dark:block" />
      <Moon className="h-4 w-4 dark:hidden" />
    </Button>
  );
}
