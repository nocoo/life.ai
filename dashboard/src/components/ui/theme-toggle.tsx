"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  const cycleTheme = () => {
    if (theme === "system") setTheme("light");
    else if (theme === "light") setTheme("dark");
    else setTheme("system");
  };

  if (!mounted) {
    return (
      <button
        disabled
        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground"
      >
        <Sun className="h-4 w-4" strokeWidth={1.5} />
      </button>
    );
  }

  return (
    <button
      onClick={cycleTheme}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      aria-label={`Toggle theme, currently ${theme}`}
    >
      {resolvedTheme === "dark" ? (
        <Moon className="h-4 w-4" aria-hidden="true" strokeWidth={1.5} />
      ) : (
        <Sun className="h-4 w-4" aria-hidden="true" strokeWidth={1.5} />
      )}
    </button>
  );
}
