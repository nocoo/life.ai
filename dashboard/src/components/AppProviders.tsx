"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  LinkProvider,
  Toaster,
  TooltipProvider,
} from "@nocoo/basalt";
import { AccentProvider } from "@nocoo/basalt/providers/accent";
import { ThemeProvider } from "@nocoo/basalt/providers/theme";

function AppLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children?: ReactNode;
}) {
  if (/^(?:https?:|mailto:|tel:|\/\/)/.test(href)) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AccentProvider
        defaultAccent="primary"
        persist={false}
        paletteOverrides={{
          primary: { light: "217 91% 60%", dark: "217 91% 65%" },
        }}
      >
        <LinkProvider render={AppLink}>
          <TooltipProvider>
            {children}
            <Toaster position="bottom-right" />
          </TooltipProvider>
        </LinkProvider>
      </AccentProvider>
    </ThemeProvider>
  );
}
