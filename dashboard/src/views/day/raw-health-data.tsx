"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DayHealthData } from "@/models/apple-health";

export interface RawHealthDataProps {
  data: DayHealthData;
}

/** Format duration in minutes to human readable string */
const formatDuration = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
};

/** Format distance in meters to km */
const formatDistance = (meters: number): string => {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }
  return `${Math.round(meters)} m`;
};

export function RawHealthData({ data }: RawHealthDataProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">
          Apple Health Raw Data
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[calc(100vh-200px)]">
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">总步数</div>
                <div className="text-xl font-bold">
                  {data.totalSteps.toLocaleString()}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">饮水量</div>
                <div className="text-xl font-bold">{data.totalWater} ml</div>
              </div>
              {data.activity && (
                <>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">活动能量</div>
                    <div className="text-xl font-bold">
                      {Math.round(data.activity.activeEnergy)} kcal
                    </div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">运动时间</div>
                    <div className="text-xl font-bold">
                      {data.activity.exerciseMinutes} 分钟
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Sleep Section */}
            {data.sleep && (
              <div>
                <h3 className="text-sm font-medium mb-2">睡眠</h3>
                <div className="rounded-lg border p-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">总时长</span>
                    <span className="font-medium">
                      {formatDuration(data.sleep.duration)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">开始时间</span>
                    <span>{data.sleep.start}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">结束时间</span>
                    <span>{data.sleep.end}</span>
                  </div>
                  {data.sleep.stages.length > 0 && (
                    <div className="flex gap-2 flex-wrap pt-2">
                      {data.sleep.stages.map((stage, idx) => (
                        <Badge key={idx} variant="secondary">
                          {stage.type}: {formatDuration(stage.duration)}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Heart Rate Section */}
            {data.heartRate && (
              <div>
                <h3 className="text-sm font-medium mb-2">心率</h3>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div className="rounded-lg border p-3 text-center">
                    <div className="text-xs text-muted-foreground">平均</div>
                    <div className="text-lg font-bold">
                      {Math.round(data.heartRate.avg)} bpm
                    </div>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <div className="text-xs text-muted-foreground">最低</div>
                    <div className="text-lg font-bold text-blue-500">
                      {data.heartRate.min} bpm
                    </div>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <div className="text-xs text-muted-foreground">最高</div>
                    <div className="text-lg font-bold text-red-500">
                      {data.heartRate.max} bpm
                    </div>
                  </div>
                </div>
                {data.heartRate.records.length > 0 && (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      查看 {data.heartRate.records.length} 条记录
                    </summary>
                    <Table className="mt-2">
                      <TableHeader>
                        <TableRow>
                          <TableHead>时间</TableHead>
                          <TableHead className="text-right">心率 (bpm)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.heartRate.records.slice(0, 50).map((record, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="text-muted-foreground">
                              {record.time}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {record.value}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {data.heartRate.records.length > 50 && (
                      <p className="text-xs text-muted-foreground mt-2">
                        显示前 50 条，共 {data.heartRate.records.length} 条
                      </p>
                    )}
                  </details>
                )}
              </div>
            )}

            {/* Steps Section */}
            {data.steps.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-2">每小时步数</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>时间</TableHead>
                      <TableHead className="text-right">步数</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.steps
                      .filter((s) => s.count > 0)
                      .map((step) => (
                        <TableRow key={step.hour}>
                          <TableCell className="text-muted-foreground">
                            {step.hour.toString().padStart(2, "0")}:00
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {step.count.toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Workouts Section */}
            {data.workouts.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-2">
                  运动记录 ({data.workouts.length})
                </h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>类型</TableHead>
                      <TableHead>时长</TableHead>
                      <TableHead>距离</TableHead>
                      <TableHead className="text-right">消耗</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.workouts.map((workout) => (
                      <TableRow key={workout.id}>
                        <TableCell>
                          <Badge variant="outline">{workout.typeName}</Badge>
                        </TableCell>
                        <TableCell>{formatDuration(workout.duration)}</TableCell>
                        <TableCell>
                          {workout.distance
                            ? formatDistance(workout.distance)
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {workout.calories
                            ? `${Math.round(workout.calories)} kcal`
                            : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Water Section */}
            {data.water.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-2">饮水记录</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>时间</TableHead>
                      <TableHead className="text-right">水量 (ml)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.water.map((record, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-muted-foreground">
                          {record.time}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {record.amount}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* ECG Records Section */}
            {data.ecgRecords.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-2">
                  心电图记录 ({data.ecgRecords.length})
                </h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>记录时间</TableHead>
                      <TableHead className="text-right">采样率</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.ecgRecords.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell className="text-muted-foreground">
                          {record.recordedAt}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {record.samplingRate} Hz
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Empty State */}
            {!data.sleep &&
              !data.heartRate &&
              data.steps.length === 0 &&
              data.workouts.length === 0 &&
              data.water.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  当天没有健康数据
                </div>
              )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
