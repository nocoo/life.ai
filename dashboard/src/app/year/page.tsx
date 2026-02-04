import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays } from "lucide-react";

export default function YearPage() {
  return (
    <div className="p-6">
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            年度总结
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            年度总结页面正在开发中...
          </p>
          <p className="text-sm text-muted-foreground">
            这里将展示全年的健康趋势分析、重要里程碑和年度财务概览。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
