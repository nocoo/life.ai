"use client";

import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
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
          今天
        </Button>

        {/* Previous Day */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onPrevDay}
          aria-label="前一天"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        {/* Current Date Display - Use Button component for consistency */}
        <Button
          variant="ghost"
          onClick={onToggleCalendar}
          className="gap-2"
        >
          <span>{format(selectedDate, "yyyy年M月d日 EEEE", { locale: zhCN })}</span>
          {onToggleCalendar && (
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>

        {/* Next Day */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onNextDay}
          aria-label="后一天"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Placeholder for future actions */}
      <div className="w-32" />
    </header>
  );
}
