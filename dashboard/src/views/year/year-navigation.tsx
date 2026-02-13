"use client";

import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface YearNavigationProps {
  /** Selected year */
  selectedYear: number;
  onPrevYear: () => void;
  onNextYear: () => void;
  onCurrentYear: () => void;
  onToggleCalendar?: () => void;
}

/** Check if the given year is the current year */
const isCurrentYear = (year: number): boolean => {
  return year === new Date().getFullYear();
};

/** Year navigation component - displays current year with prev/next controls */
export function YearNavigation({
  selectedYear,
  onPrevYear,
  onNextYear,
  onCurrentYear,
  onToggleCalendar,
}: YearNavigationProps) {
  const isCurrent = isCurrentYear(selectedYear);

  return (
    <div className="flex items-center justify-center gap-2">
      {/* Current Year Button */}
      <Button
        variant="outline"
        size="sm"
        onClick={onCurrentYear}
        disabled={isCurrent}
        className="mr-2"
      >
        今年
      </Button>

      {/* Previous Year */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onPrevYear}
        aria-label="上一年"
      >
        <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
      </Button>

      {/* Current Year Display */}
      <Button
        variant="ghost"
        onClick={onToggleCalendar}
        className="gap-2 text-lg font-medium"
      >
        <span>{selectedYear}年</span>
        {onToggleCalendar && (
          <CalendarIcon className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
        )}
      </Button>

      {/* Next Year */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onNextYear}
        aria-label="下一年"
      >
        <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
      </Button>
    </div>
  );
}
