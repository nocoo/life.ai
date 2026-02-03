"use client";

import { Calendar } from "@/components/ui/calendar";

export interface DayCalendarProps {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  className?: string;
}

export function DayCalendar({
  selectedDate,
  onSelectDate,
  className,
}: DayCalendarProps) {
  return (
    <div className={className}>
      <Calendar
        mode="single"
        selected={selectedDate}
        onSelect={(date) => date && onSelectDate(date)}
        className="rounded-md border"
      />
    </div>
  );
}
