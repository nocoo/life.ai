"use client";

import { cn } from "@/lib/utils";
import type { TimelineEvent } from "@/models/day-view";

export interface TimelineProps {
  events: TimelineEvent[];
  className?: string;
}

/** Get hour from HH:mm time string */
const getHour = (time: string): number => {
  return parseInt(time.split(":")[0], 10);
};

/** Generate 24 hour slots */
const hours = Array.from({ length: 24 }, (_, i) => i);

export function Timeline({ events, className }: TimelineProps) {
  // Group events by hour
  const eventsByHour = new Map<number, TimelineEvent[]>();
  events.forEach((event) => {
    const hour = getHour(event.time);
    const existing = eventsByHour.get(hour) || [];
    eventsByHour.set(hour, [...existing, event]);
  });

  return (
    <div className={cn("flex flex-col pl-14", className)}>
      {hours.map((hour) => {
        const hourEvents = eventsByHour.get(hour) || [];
        const hasEvents = hourEvents.length > 0;

        return (
          <div
            key={hour}
            className={cn(
              "flex items-start border-l-2 py-2 pl-4 relative",
              hasEvents ? "border-primary" : "border-border"
            )}
          >
            {/* Hour label */}
            <div className="absolute left-0 -translate-x-full pr-2 text-xs text-muted-foreground w-12 text-right">
              {hour.toString().padStart(2, "0")}:00
            </div>

            {/* Hour marker dot */}
            <div
              className={cn(
                "absolute -left-[5px] top-2 h-2 w-2 rounded-full",
                hasEvents ? "bg-primary" : "bg-border"
              )}
            />

            {/* Events for this hour */}
            <div className="flex flex-col gap-1 min-h-[24px] w-full">
              {hourEvents.map((event) => (
                <div
                  key={event.id}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1 text-xs",
                    event.color ? `${event.color} text-white` : "bg-muted"
                  )}
                >
                  <span className="font-medium">{event.time}</span>
                  <span className="truncate">{event.title}</span>
                  {event.subtitle && (
                    <span className="text-white/80 truncate">
                      {event.subtitle}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
