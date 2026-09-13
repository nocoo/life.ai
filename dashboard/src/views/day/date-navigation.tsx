"use client";

import { format, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@nocoo/basalt";
import { DatePicker } from "@nocoo/basalt/components/date-picker";

export interface DateNavigationProps {
  selectedDate: Date;
  onPrevDay: () => void;
  onNextDay: () => void;
  onToday: () => void;
  onSelectDate: (date: Date) => void;
}

/** Date navigation component - displays current date with prev/next controls */
export function DateNavigation({
  selectedDate,
  onPrevDay,
  onNextDay,
  onToday,
  onSelectDate,
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
        <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
      </Button>

      <DatePicker
        value={format(selectedDate, "yyyy-MM-dd")}
        onChange={(value) => onSelectDate(parseISO(value))}
        locale="zh-CN"
        weekStartsOn={1}
        aria-label="选择日期"
      />

      {/* Next Day */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onNextDay}
        aria-label="后一天"
      >
        <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
      </Button>
    </div>
  );
}
