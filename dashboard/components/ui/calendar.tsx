"use client";

import * as React from "react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-4", className)}
      classNames={{
        months: "flex flex-col gap-4",
        month: "space-y-4",
        month_caption: "flex items-center justify-between",
        caption_label: "text-sm font-semibold text-zinc-900",
        nav: "flex items-center gap-2",
        button_previous:
          "inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-600 shadow-sm transition hover:text-zinc-900",
        button_next:
          "inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-600 shadow-sm transition hover:text-zinc-900",
        month_grid: "w-full border-collapse",
        weekdays: "grid grid-cols-7 gap-1",
        weekday:
          "h-8 w-full text-center text-[10px] uppercase tracking-[0.2em] text-zinc-400",
        week: "grid grid-cols-7 gap-1",
        day: "relative h-10 w-full p-0 text-center text-sm",
        day_button:
          "inline-flex h-10 w-10 items-center justify-center rounded-full text-sm text-zinc-700 transition hover:bg-zinc-100",
        today: "bg-zinc-900 text-white",
        selected: "bg-zinc-900 text-white",
        range_middle: "bg-zinc-100 text-zinc-900",
        hidden: "invisible",
        outside: "text-zinc-300",
        disabled: "text-zinc-300/60",
        ...classNames
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
