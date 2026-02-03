"use client";

import { format } from "date-fns";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface DayHeaderProps {
  selectedDate: Date;
  onPrevDay: () => void;
  onNextDay: () => void;
  onToday: () => void;
  onToggleCalendar?: () => void;
}

export function DayHeader({
  selectedDate,
  onPrevDay,
  onNextDay,
  onToday,
  onToggleCalendar,
}: DayHeaderProps) {
  const isToday =
    format(selectedDate, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");

  return (
    <header className="flex items-center justify-between border-b border-border bg-background px-6 py-4">
      {/* Logo and Title */}
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <span className="text-lg font-bold">L</span>
        </div>
        <h1 className="text-xl font-semibold">Life.ai</h1>
      </div>

      {/* Date Navigation */}
      <div className="flex items-center gap-2">
        {/* Today Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={onToday}
          disabled={isToday}
          className="mr-2"
        >
          Today
        </Button>

        {/* Previous Day */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onPrevDay}
          aria-label="Previous day"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        {/* Current Date Display */}
        <button
          onClick={onToggleCalendar}
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
        >
          <span>{format(selectedDate, "EEEE, MMMM d, yyyy")}</span>
          {onToggleCalendar && (
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {/* Next Day */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onNextDay}
          aria-label="Next day"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Placeholder for future actions */}
      <div className="w-32" />
    </header>
  );
}
