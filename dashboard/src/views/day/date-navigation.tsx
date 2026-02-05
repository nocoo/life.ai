"use client";

import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface DateNavigationProps {
  selectedDate: Date;
  onPrevDay: () => void;
  onNextDay: () => void;
  onToday: () => void;
  onToggleCalendar?: () => void;
}

/** Date navigation component - displays current date with prev/next controls */
export function DateNavigation({
  selectedDate,
  onPrevDay,
  onNextDay,
  onToday,
  onToggleCalendar,
}: DateNavigationProps) {
  const isToday =
    format(selectedDate, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");

  return (
    <div className="flex items-center justify-center gap-1">
      {/* Today Button */}
      <Button
        variant="outline"
        size="sm"
        onClick={onToday}
        disabled={isToday}
        className="mr-1 h-8 px-2.5 text-xs"
      >
        今天
      </Button>

      {/* Previous Day */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onPrevDay}
        aria-label="前一天"
        className="h-8 w-8"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      {/* Current Date Display */}
      <Button
        variant="ghost"
        onClick={onToggleCalendar}
        className="gap-1.5 text-base font-medium h-8 px-2"
      >
        <span>{format(selectedDate, "yyyy年M月d日 EEEE", { locale: zhCN })}</span>
        {onToggleCalendar && (
          <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        )}
      </Button>

      {/* Next Day */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onNextDay}
        aria-label="后一天"
        className="h-8 w-8"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
