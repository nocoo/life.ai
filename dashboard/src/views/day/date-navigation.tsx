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
    <div className="flex items-center justify-center gap-2">
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

      {/* Current Date Display */}
      <Button
        variant="ghost"
        onClick={onToggleCalendar}
        className="gap-2 text-lg font-medium"
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
  );
}
