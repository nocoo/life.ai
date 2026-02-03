"use client";

import { MapPin, Dumbbell, Wallet, Route } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { DayFootprintData } from "@/models/footprint";
import type { DayPixiuData } from "@/models/pixiu";
import type { WorkoutRecord } from "@/models/apple-health";

export interface ActivityPanelProps {
  footprint: DayFootprintData;
  pixiu: DayPixiuData;
  workouts: WorkoutRecord[];
}

/** Format distance */
const formatDistance = (meters: number): string => {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${Math.round(meters)} m`;
};

/** Format duration */
const formatDuration = (minutes: number): string => {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${minutes}m`;
};

/** Format time from ISO datetime */
const formatTime = (datetime: string): string => {
  const match = datetime.match(/T(\d{2}:\d{2})/);
  return match ? match[1] : datetime;
};

export function ActivityPanel({
  footprint,
  pixiu,
  workouts,
}: ActivityPanelProps) {
  return (
    <div className="flex flex-col gap-4">
      {/* Workouts Card */}
      {workouts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Dumbbell className="h-4 w-4 text-green-500" />
              Workouts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {workouts.map((workout, i) => (
              <div key={workout.id}>
                {i > 0 && <Separator className="my-3" />}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{workout.typeName}</span>
                    <Badge variant="secondary" className="text-xs">
                      {formatTime(workout.start)} - {formatTime(workout.end)}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Duration</p>
                      <p className="font-medium">
                        {formatDuration(workout.duration)}
                      </p>
                    </div>
                    {workout.distance && (
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Distance
                        </p>
                        <p className="font-medium">
                          {formatDistance(workout.distance)}
                        </p>
                      </div>
                    )}
                    {workout.calories && (
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Calories
                        </p>
                        <p className="font-medium">{workout.calories} kcal</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Locations Card */}
      {footprint.locations.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <MapPin className="h-4 w-4 text-blue-500" />
              Locations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {footprint.locations
              .filter((loc) => loc.name !== "Commute")
              .map((loc) => (
                <div
                  key={loc.id}
                  className="flex items-center justify-between text-sm"
                >
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-blue-500" />
                    <span>{loc.name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {loc.startTime} - {loc.endTime}
                  </span>
                </div>
              ))}
          </CardContent>
        </Card>
      )}

      {/* Track Summary Card */}
      {footprint.summary && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Route className="h-4 w-4 text-cyan-500" />
              Movement
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total Distance</span>
              <span className="font-medium">
                {formatDistance(footprint.summary.totalDistance)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Avg Speed</span>
              <span>
                {(footprint.summary.avgSpeed * 3.6).toFixed(1)} km/h
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Track Points</span>
              <span>{footprint.summary.pointCount.toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Transactions Card */}
      {pixiu.transactions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Wallet className="h-4 w-4 text-rose-500" />
              Transactions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {/* Summary */}
            {pixiu.summary && (
              <>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div>
                    <p className="text-xs text-muted-foreground">Expense</p>
                    <p className="text-lg font-semibold text-rose-500">
                      ¥{pixiu.summary.expense.toFixed(2)}
                    </p>
                  </div>
                  {pixiu.summary.income > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground">Income</p>
                      <p className="text-lg font-semibold text-emerald-500">
                        ¥{pixiu.summary.income.toFixed(2)}
                      </p>
                    </div>
                  )}
                </div>
                <Separator />
              </>
            )}

            {/* Category breakdown */}
            {pixiu.expenseByCategory.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">By Category</p>
                {pixiu.expenseByCategory.slice(0, 5).map((cat) => (
                  <div
                    key={cat.category}
                    className="flex items-center justify-between text-sm"
                  >
                    <span>{cat.category}</span>
                    <span className="text-muted-foreground">
                      ¥{cat.amount.toFixed(2)} ({cat.count})
                    </span>
                  </div>
                ))}
              </div>
            )}

            <Separator />

            {/* Transaction list */}
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {pixiu.transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between text-sm"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {tx.time}
                      </span>
                      <span className="truncate">{tx.categoryL2}</span>
                    </div>
                    {tx.note && (
                      <p className="text-xs text-muted-foreground truncate">
                        {tx.note}
                      </p>
                    )}
                  </div>
                  <span
                    className={
                      tx.isIncome ? "text-emerald-500" : "text-rose-500"
                    }
                  >
                    {tx.isIncome ? "+" : "-"}¥{tx.amount.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
