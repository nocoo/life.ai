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
import type { DayFootprintData } from "@/models/footprint";

export interface RawFootprintDataProps {
  data: DayFootprintData;
}

/** Format distance in meters to km */
const formatDistance = (meters: number): string => {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }
  return `${Math.round(meters)} m`;
};

/** Format speed from m/s to km/h */
const formatSpeed = (mps: number): string => {
  const kmh = mps * 3.6;
  return `${kmh.toFixed(1)} km/h`;
};

/** Format duration in minutes to human readable string */
const formatDuration = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
};

/** Extract time (HH:mm:ss) from ISO datetime string */
const extractTime = (isoString: string): string => {
  // Handle format like "2025-12-02T07:13:26Z"
  const match = isoString.match(/T(\d{2}:\d{2}:\d{2})/);
  return match ? match[1] : isoString;
};

/** Format coordinates to display */
const formatCoord = (value: number, decimals = 6): string => {
  return value.toFixed(decimals);
};

export function RawFootprintData({ data }: RawFootprintDataProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">
          Footprint Raw Data (运动软件)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[calc(100vh-200px)]">
          <div className="space-y-6">
            {/* Summary Section */}
            {data.summary && (
              <div>
                <h3 className="text-sm font-medium mb-2">轨迹概览</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">总距离</div>
                    <div className="text-xl font-bold">
                      {formatDistance(data.summary.totalDistance)}
                    </div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">平均速度</div>
                    <div className="text-xl font-bold">
                      {formatSpeed(data.summary.avgSpeed)}
                    </div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">轨迹点数</div>
                    <div className="text-xl font-bold">
                      {data.summary.pointCount.toLocaleString()}
                    </div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">记录时间</div>
                    <div className="text-lg font-bold">
                      {data.summary.minTime} - {data.summary.maxTime}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Track Points Section */}
            {data.trackPoints.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-2">
                  轨迹点 ({data.trackPoints.length})
                </h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>时间</TableHead>
                      <TableHead>纬度</TableHead>
                      <TableHead>经度</TableHead>
                      <TableHead className="text-right">海拔 (m)</TableHead>
                      <TableHead className="text-right">速度</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.trackPoints.map((point, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-muted-foreground">
                          {idx + 1}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {extractTime(point.ts)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {formatCoord(point.lat)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {formatCoord(point.lon)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {point.ele !== undefined ? point.ele.toFixed(1) : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          {point.speed !== undefined ? formatSpeed(point.speed) : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Locations Section */}
            {data.locations.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-2">
                  停留地点 ({data.locations.length})
                </h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>地点</TableHead>
                      <TableHead>时间段</TableHead>
                      <TableHead className="text-right">停留时长</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.locations.map((location) => (
                      <TableRow key={location.id}>
                        <TableCell>
                          <Badge variant="outline">{location.name}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {location.startTime} - {location.endTime}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatDuration(location.duration)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Segments Section */}
            {data.segments.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-2">
                  轨迹分段 ({data.segments.length})
                </h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>时间段</TableHead>
                      <TableHead>距离</TableHead>
                      <TableHead>平均速度</TableHead>
                      <TableHead className="text-right">轨迹点</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.segments.map((segment) => (
                      <TableRow key={segment.id}>
                        <TableCell className="text-muted-foreground">
                          {segment.startTime} - {segment.endTime}
                        </TableCell>
                        <TableCell>{formatDistance(segment.distance)}</TableCell>
                        <TableCell>{formatSpeed(segment.avgSpeed)}</TableCell>
                        <TableCell className="text-right font-medium">
                          {segment.pointCount}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Empty State */}
            {!data.summary &&
              data.trackPoints.length === 0 &&
              data.locations.length === 0 &&
              data.segments.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  当天没有轨迹数据
                </div>
              )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
