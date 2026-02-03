"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { DayFootprintData } from "@/models/footprint";

export interface RawFootprintDataProps {
  data: DayFootprintData;
}

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
          <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-all">
            {JSON.stringify(data, null, 2)}
          </pre>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
