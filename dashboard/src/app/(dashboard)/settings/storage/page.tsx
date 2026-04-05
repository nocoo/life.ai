"use client";

import { useEffect, useState } from "react";
import { Database, HardDrive, FileText, Table2 } from "lucide-react";
import { StatCard, StatGrid } from "@/components/charts/stat-card";
import { DonutChart, type DonutChartDataPoint } from "@/components/charts/pie-chart";
import { BarChart, type BarChartDataPoint } from "@/components/charts/bar-chart";
import { Skeleton } from "@/components/ui/skeleton";
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
            <div key={i} className="rounded-card bg-secondary p-4 space-y-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </StatGrid>
      </div>
      <div>
        <Skeleton className="h-5 w-40 mb-4" />
        <StatGrid columns={3}>
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-card bg-secondary p-4 space-y-3">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-3 w-32" />
            </div>
          ))}
        </StatGrid>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-card bg-secondary p-4">
          <Skeleton className="h-4 w-32 mb-4" />
          <Skeleton className="h-[200px] w-full" />
        </div>
        <div className="rounded-card bg-secondary p-4">
          <Skeleton className="h-4 w-32 mb-4" />
          <Skeleton className="h-[200px] w-full" />
        </div>
      </div>
    </div>
  );
}

function DatabaseCard({ db, color }: { db: DatabaseStats; color: string }) {
  return (
    <div className="rounded-card bg-secondary p-4 md:p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-sm font-medium text-foreground">{db.displayName}</p>
          <p className="text-2xl font-semibold text-foreground font-display tracking-tight">
            {db.sizeMB} MB
          </p>
        </div>
        <div className="rounded-md p-2" style={{ backgroundColor: `${color}20` }}>
          <Database className="h-5 w-5" style={{ color }} strokeWidth={1.5} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        {formatNumber(db.totalRows)} records in {db.tables.length} tables
      </p>
      <div className="space-y-1.5">
        {db.tables.slice(0, 5).map((table) => (
          <div key={table.name} className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground truncate max-w-[150px]">{table.name}</span>
            <span className="text-foreground font-medium">{formatNumber(table.rowCount)}</span>
          </div>
        ))}
        {db.tables.length > 5 && (
          <p className="text-xs text-muted-foreground">
            +{db.tables.length - 5} more tables
          </p>
        )}
      </div>
    </div>
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
        setError(e instanceof Error ? e.message : "Failed to fetch storage data");
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
      <div className="rounded-card bg-destructive/10 p-4 text-sm text-destructive">
        Failed to load storage data: {error}
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
            label: "GPX Files",
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
      {/* Overview Stats */}
      <section>
        <h2 className="text-sm font-normal text-muted-foreground mb-2">Storage Overview</h2>
        <StatGrid columns={4}>
          <StatCard
            title="Total Size"
            value={`${overview.totalSizeMB} MB`}
            subtitle="All data combined"
            icon={HardDrive}
            iconColor="text-chart-1"
          />
          <StatCard
            title="Databases"
            value={overview.databaseCount}
            subtitle="SQLite files"
            icon={Database}
            iconColor="text-chart-2"
          />
          <StatCard
            title="Total Records"
            value={formatNumber(overview.totalRecords)}
            subtitle="Across all tables"
            icon={Table2}
            iconColor="text-chart-3"
          />
          <StatCard
            title="GPX Files"
            value={overview.gpxFileCount}
            subtitle={`${overview.gpxSizeMB} MB`}
            icon={FileText}
            iconColor="text-chart-4"
          />
        </StatGrid>
      </section>

      {/* Database Details */}
      <section>
        <h2 className="text-sm font-normal text-muted-foreground mb-2">Database Details</h2>
        <StatGrid columns={3}>
          {databases.map((db, i) => (
            <DatabaseCard key={db.name} db={db} color={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </StatGrid>
      </section>

      {/* Charts */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-card bg-secondary p-4 md:p-5">
          <h3 className="text-sm font-medium text-foreground mb-4">Storage Distribution</h3>
          <DonutChart
            data={storageDistribution}
            height={220}
            showLegend
            valueFormatter={(v) => `${(v / (1024 * 1024)).toFixed(1)} MB`}
          />
        </div>
        <div className="rounded-card bg-secondary p-4 md:p-5">
          <h3 className="text-sm font-medium text-foreground mb-4">Top Tables by Records</h3>
          <BarChart
            data={recordsByType}
            height={220}
            horizontal
            valueFormatter={formatNumber}
            showYAxis
            showXAxis={false}
          />
        </div>
      </section>
    </div>
  );
}
