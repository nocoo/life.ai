import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "lucide-react";

export default function MonthPage() {
  return (
    <div className="p-6">
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            月度总结
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            月度总结页面正在开发中...
          </p>
          <p className="text-sm text-muted-foreground">
            这里将展示每月的健康数据汇总、运动轨迹统计和财务报表。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
