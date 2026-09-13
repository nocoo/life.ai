"use client";

import { useEffect, useState } from "react";
import { Database, HardDrive, FileText, Table2 } from "lucide-react";
import { StatCard, StatGrid } from "@nocoo/basalt/charts/stat-card";
import { DonutChart, type DonutChartDataPoint } from "@/components/charts/pie-chart";
import { BarChart, type BarChartDataPoint } from "@/components/charts/bar-chart";
import { SkeletonLine as Skeleton } from "@nocoo/basalt/components/skeleton-line";
import { LayerCard } from "@nocoo/basalt/components/layer-card";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import { SectionRule } from "@nocoo/basalt/components/section-rule";
import type { StorageStats, DatabaseStats } from "@/services/storage-service";
import { CHART_COLORS } from "@/lib/palette";

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString();
}

function StorageSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-5 w-40 mb-4" />
        <StatGrid columns={4}>
          {[...Array(4)].map((_, i) => (
            <LayerCard key={i} className="space-y-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-24" />
              <Skeleton className="h-3 w-16" />
            </LayerCard>
          ))}
        </StatGrid>
      </div>
      <div>
        <Skeleton className="h-5 w-40 mb-4" />
        <StatGrid columns={3}>
          {[...Array(3)].map((_, i) => (
            <LayerCard key={i} className="space-y-3">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-3 w-32" />
            </LayerCard>
          ))}
        </StatGrid>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LayerCard>
          <Skeleton className="h-4 w-32 mb-4" />
          <Skeleton className="h-[200px] w-full" />
        </LayerCard>
        <LayerCard>
          <Skeleton className="h-4 w-32 mb-4" />
          <Skeleton className="h-[200px] w-full" />
        </LayerCard>
      </div>
    </div>
  );
}

function DatabaseCard({ db, color }: { db: DatabaseStats; color: string }) {
  return (
    <LayerCard>
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-sm font-medium text-basalt-foreground">{db.displayName}</p>
          <p className="text-2xl font-semibold text-basalt-foreground font-display tracking-tight">
            {db.sizeMB} MB
          </p>
        </div>
        <div className="rounded-md p-2" style={{ backgroundColor: `${color}20` }}>
          <Database className="h-5 w-5" style={{ color }} strokeWidth={1.5} />
        </div>
      </div>
      <p className="text-xs text-basalt-muted-foreground mb-3">
        {formatNumber(db.totalRows)} 条记录，{db.tables.length} 个表
      </p>
      <div className="space-y-1.5">
        {db.tables.slice(0, 5).map((table) => (
          <div key={table.name} className="flex items-center justify-between text-xs">
            <span className="text-basalt-muted-foreground truncate max-w-[150px]">{table.name}</span>
            <span className="text-basalt-foreground font-medium">{formatNumber(table.rowCount)}</span>
          </div>
        ))}
        {db.tables.length > 5 && (
          <p className="text-xs text-basalt-muted-foreground">
            还有 {db.tables.length - 5} 个表
          </p>
        )}
      </div>
    </LayerCard>
  );
}

export default function StoragePage() {
  const [data, setData] = useState<StorageStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/storage");
        const json = await res.json();
        if (json.success) {
          setData(json.data);
        } else {
          setError(json.error);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "加载存储数据失败");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return <StorageSkeleton />;
  }

  if (error) {
    return (
      <div className="rounded-basalt-lg bg-basalt-destructive/10 p-4 text-sm text-basalt-destructive">
        加载存储数据失败：{error}
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { overview, databases } = data;

  // Prepare chart data
  const storageDistribution: DonutChartDataPoint[] = [
    ...databases.map((db, i) => ({
      label: db.displayName,
      value: db.sizeBytes,
      color: CHART_COLORS[i % CHART_COLORS.length],
    })),
    ...(overview.gpxSizeBytes > 0
      ? [
          {
            label: "GPX 文件",
            value: overview.gpxSizeBytes,
            color: CHART_COLORS[databases.length % CHART_COLORS.length],
          },
        ]
      : []),
  ];

  const recordsByType: BarChartDataPoint[] = databases
    .flatMap((db) =>
      db.tables.map((t) => ({
        label: `${db.displayName}: ${t.name}`,
        value: t.rowCount,
      }))
    )
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <PageHeader title="存储" description="查看数据库、轨迹文件与记录数量。" />
      {/* Overview Stats */}
      <SectionRule title="存储概览">
        <StatGrid columns={4}>
          <StatCard
            title="总大小"
            value={`${overview.totalSizeMB} MB`}
            subtitle="所有数据合计"
            icon={HardDrive}
            iconColor="text-basalt-chart-1"
          />
          <StatCard
            title="数据库"
            value={overview.databaseCount}
            subtitle="SQLite 文件"
            icon={Database}
            iconColor="text-basalt-chart-2"
          />
          <StatCard
            title="总记录数"
            value={formatNumber(overview.totalRecords)}
            subtitle="所有表合计"
            icon={Table2}
            iconColor="text-basalt-chart-3"
          />
          <StatCard
            title="GPX 文件"
            value={overview.gpxFileCount}
            subtitle={`${overview.gpxSizeMB} MB`}
            icon={FileText}
            iconColor="text-basalt-chart-4"
          />
        </StatGrid>
      </SectionRule>

      {/* Database Details */}
      <SectionRule title="数据库详情">
        <StatGrid columns={3}>
          {databases.map((db, i) => (
            <DatabaseCard key={db.name} db={db} color={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </StatGrid>
      </SectionRule>

      {/* Charts */}
      <SectionRule title="数据分布">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <LayerCard>
          <h3 className="text-sm font-medium text-basalt-foreground mb-4">存储分布</h3>
          <DonutChart
              ariaLabel="存储空间分布"
            data={storageDistribution}
            height={220}
            showLegend
            valueFormatter={(v) => `${(v / (1024 * 1024)).toFixed(1)} MB`}
          />
        </LayerCard>
        <LayerCard>
          <h3 className="text-sm font-medium text-basalt-foreground mb-4">记录数最多的表</h3>
          <BarChart
              ariaLabel="记录数最多的表"
            data={recordsByType}
            height={220}
            horizontal
            valueFormatter={formatNumber}
            showYAxis
            showXAxis={false}
          />
        </LayerCard>
        </div>
      </SectionRule>
    </div>
  );
}
