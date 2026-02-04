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
import type { DayHealthData, SleepStageType } from "@/models/apple-health";

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

/** Get sleep stage display name and color */
const getSleepStageInfo = (type: SleepStageType): { name: string; color: string } => {
  switch (type) {
    case "deep":
      return { name: "深睡", color: "bg-indigo-500" };
    case "core":
      return { name: "核心", color: "bg-blue-500" };
    case "rem":
      return { name: "REM", color: "bg-purple-500" };
    case "awake":
      return { name: "清醒", color: "bg-orange-400" };
    default:
      return { name: type, color: "bg-gray-500" };
  }
};

export function RawHealthData({ data }: RawHealthDataProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          Apple Health 原始数据
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[calc(100vh-200px)]">
          <div className="space-y-6">
            {/* Summary Cards - Row 1: Core Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">总步数</div>
                <div className="text-xl font-bold">
                  {data.totalSteps.toLocaleString()}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">步行距离</div>
                <div className="text-xl font-bold">
                  {data.distance ? `${data.distance.total.toFixed(2)} km` : "-"}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">攀爬楼层</div>
                <div className="text-xl font-bold">{data.flightsClimbed} 层</div>
              </div>
              {data.activity && (
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">活动能量</div>
                  <div className="text-xl font-bold">
                    {Math.round(data.activity.activeEnergy)} kcal
                  </div>
                </div>
              )}
            </div>

            {/* Summary Cards - Row 2: Activity */}
            {data.activity && (
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border p-3 text-center">
                  <div className="text-xs text-muted-foreground">运动时间</div>
                  <div className="text-lg font-bold text-green-500">
                    {data.activity.exerciseMinutes} 分钟
                  </div>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <div className="text-xs text-muted-foreground">站立小时</div>
                  <div className="text-lg font-bold text-cyan-500">
                    {data.activity.standHours} 小时
                  </div>
                </div>
                {data.sleepingWristTemperature && (
                  <div className="rounded-lg border p-3 text-center">
                    <div className="text-xs text-muted-foreground">睡眠腕温</div>
                    <div className="text-lg font-bold">
                      {data.sleepingWristTemperature}°C
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Sleep Section */}
            {data.sleep && (
              <div>
                <h3 className="text-sm font-medium mb-2">睡眠分析</h3>
                <div className="rounded-lg border p-3 space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <div className="text-xs text-muted-foreground">总时长</div>
                      <div className="text-lg font-bold">
                        {formatDuration(data.sleep.duration)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">深睡</div>
                      <div className="text-lg font-bold text-indigo-500">
                        {formatDuration(data.sleep.deepMinutes)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">核心睡眠</div>
                      <div className="text-lg font-bold text-blue-500">
                        {formatDuration(data.sleep.coreMinutes)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">REM</div>
                      <div className="text-lg font-bold text-purple-500">
                        {formatDuration(data.sleep.remMinutes)}
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">时间范围</span>
                    <span>{data.sleep.start} - {data.sleep.end}</span>
                  </div>
                  {data.sleep.stages.length > 0 && (
                    <details className="text-sm">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                        查看 {data.sleep.stages.length} 个睡眠阶段
                      </summary>
                      <Table className="mt-2">
                        <TableHeader>
                          <TableRow>
                            <TableHead>阶段</TableHead>
                            <TableHead>开始</TableHead>
                            <TableHead>结束</TableHead>
                            <TableHead className="text-right">时长</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.sleep.stages.map((stage, idx) => {
                            const info = getSleepStageInfo(stage.type);
                            return (
                              <TableRow key={idx}>
                                <TableCell>
                                  <Badge className={info.color}>{info.name}</Badge>
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                  {stage.start}
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                  {stage.end}
                                </TableCell>
                                <TableCell className="text-right font-medium">
                                  {formatDuration(stage.duration)}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </details>
                  )}
                </div>
              </div>
            )}

            {/* Heart Rate Section */}
            {data.heartRate && (
              <div>
                <h3 className="text-sm font-medium mb-2">心率</h3>
                <div className="grid grid-cols-3 md:grid-cols-5 gap-3 mb-3">
                  <div className="rounded-lg border p-3 text-center">
                    <div className="text-xs text-muted-foreground">平均</div>
                    <div className="text-lg font-bold">
                      {data.heartRate.avg} bpm
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
                  {data.heartRate.restingHeartRate && (
                    <div className="rounded-lg border p-3 text-center">
                      <div className="text-xs text-muted-foreground">静息</div>
                      <div className="text-lg font-bold text-green-500">
                        {data.heartRate.restingHeartRate} bpm
                      </div>
                    </div>
                  )}
                  {data.heartRate.walkingAverage && (
                    <div className="rounded-lg border p-3 text-center">
                      <div className="text-xs text-muted-foreground">步行</div>
                      <div className="text-lg font-bold text-orange-500">
                        {data.heartRate.walkingAverage} bpm
                      </div>
                    </div>
                  )}
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

            {/* Blood Oxygen Section */}
            {data.oxygenSaturation && (
              <div>
                <h3 className="text-sm font-medium mb-2">血氧饱和度</h3>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div className="rounded-lg border p-3 text-center">
                    <div className="text-xs text-muted-foreground">平均</div>
                    <div className="text-lg font-bold">
                      {data.oxygenSaturation.avg}%
                    </div>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <div className="text-xs text-muted-foreground">最低</div>
                    <div className="text-lg font-bold text-yellow-500">
                      {data.oxygenSaturation.min}%
                    </div>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <div className="text-xs text-muted-foreground">最高</div>
                    <div className="text-lg font-bold text-green-500">
                      {data.oxygenSaturation.max}%
                    </div>
                  </div>
                </div>
                {data.oxygenSaturation.records.length > 0 && (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      查看 {data.oxygenSaturation.records.length} 条记录
                    </summary>
                    <Table className="mt-2">
                      <TableHeader>
                        <TableRow>
                          <TableHead>时间</TableHead>
                          <TableHead className="text-right">血氧 (%)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.oxygenSaturation.records.map((record, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="text-muted-foreground">
                              {record.time}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {record.value}%
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </details>
                )}
              </div>
            )}

            {/* Respiratory Rate Section */}
            {data.respiratoryRate && (
              <div>
                <h3 className="text-sm font-medium mb-2">呼吸频率</h3>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div className="rounded-lg border p-3 text-center">
                    <div className="text-xs text-muted-foreground">平均</div>
                    <div className="text-lg font-bold">
                      {data.respiratoryRate.avg} 次/分
                    </div>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <div className="text-xs text-muted-foreground">最低</div>
                    <div className="text-lg font-bold text-blue-500">
                      {data.respiratoryRate.min} 次/分
                    </div>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <div className="text-xs text-muted-foreground">最高</div>
                    <div className="text-lg font-bold text-red-500">
                      {data.respiratoryRate.max} 次/分
                    </div>
                  </div>
                </div>
                {data.respiratoryRate.records.length > 0 && (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      查看 {data.respiratoryRate.records.length} 条记录
                    </summary>
                    <Table className="mt-2">
                      <TableHeader>
                        <TableRow>
                          <TableHead>时间</TableHead>
                          <TableHead className="text-right">呼吸频率 (次/分)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.respiratoryRate.records.map((record, idx) => (
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
                  </details>
                )}
              </div>
            )}

            {/* HRV Section */}
            {data.hrv && (
              <div>
                <h3 className="text-sm font-medium mb-2">心率变异性 (HRV)</h3>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div className="rounded-lg border p-3 text-center">
                    <div className="text-xs text-muted-foreground">平均</div>
                    <div className="text-lg font-bold">
                      {data.hrv.avg} ms
                    </div>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <div className="text-xs text-muted-foreground">最低</div>
                    <div className="text-lg font-bold text-yellow-500">
                      {data.hrv.min} ms
                    </div>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <div className="text-xs text-muted-foreground">最高</div>
                    <div className="text-lg font-bold text-green-500">
                      {data.hrv.max} ms
                    </div>
                  </div>
                </div>
                {data.hrv.records.length > 0 && (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      查看 {data.hrv.records.length} 条记录
                    </summary>
                    <Table className="mt-2">
                      <TableHeader>
                        <TableRow>
                          <TableHead>时间</TableHead>
                          <TableHead className="text-right">HRV SDNN (ms)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.hrv.records.map((record, idx) => (
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
                      {data.distance && (
                        <TableHead className="text-right">距离 (km)</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.steps
                      .filter((s) => s.count > 0)
                      .map((step) => {
                        const distanceForHour = data.distance?.records.find(
                          (d) => d.hour === step.hour
                        );
                        return (
                          <TableRow key={step.hour}>
                            <TableCell className="text-muted-foreground">
                              {step.hour.toString().padStart(2, "0")}:00
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {step.count.toLocaleString()}
                            </TableCell>
                            {data.distance && (
                              <TableCell className="text-right text-muted-foreground">
                                {distanceForHour
                                  ? distanceForHour.distance.toFixed(3)
                                  : "-"}
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
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
              !data.oxygenSaturation &&
              !data.respiratoryRate &&
              !data.hrv &&
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
