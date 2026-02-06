"use client";

import { format, parse } from "date-fns";
import { zhCN } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface MonthNavigationProps {
  /** Selected month in YYYY-MM format */
  selectedMonth: string;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onCurrentMonth: () => void;
  onToggleCalendar?: () => void;
}

/** Format month string to display format */
const formatMonthDisplay = (month: string): string => {
  const date = parse(month, "yyyy-MM", new Date());
  return format(date, "yyyy年M月", { locale: zhCN });
};

/** Check if the given month is the current month */
const isCurrentMonth = (month: string): boolean => {
  return month === format(new Date(), "yyyy-MM");
};

/** Month navigation component - displays current month with prev/next controls */
export function MonthNavigation({
  selectedMonth,
  onPrevMonth,
  onNextMonth,
  onCurrentMonth,
  onToggleCalendar,
}: MonthNavigationProps) {
  const isCurrent = isCurrentMonth(selectedMonth);

  return (
    <div className="flex items-center justify-center gap-2">
      {/* Current Month Button */}
      <Button
        variant="outline"
        size="sm"
        onClick={onCurrentMonth}
        disabled={isCurrent}
        className="mr-2"
      >
        本月
      </Button>

      {/* Previous Month */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onPrevMonth}
        aria-label="上一月"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      {/* Current Month Display */}
      <Button
        variant="ghost"
        onClick={onToggleCalendar}
        className="gap-2 text-lg font-medium"
      >
        <span>{formatMonthDisplay(selectedMonth)}</span>
        {onToggleCalendar && (
          <CalendarIcon className="h-4 w-4 text-muted-foreground" />
        )}
      </Button>

      {/* Next Month */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onNextMonth}
        aria-label="下一月"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
