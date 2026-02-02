# 02 data structure - footprint

## 概览
这份数据来自 footprint 项目导出，目前仅包含轨迹文件（GPX）。

## 目录结构
```
/data
└── footprint/
    └── 20260202.gpx
```

## 20260202.gpx（轨迹文件）
- GPX 1.1 标准，`trk`/`trkseg`/`trkpt` 结构
- 轨迹点字段：经纬度 `lat/lon`、海拔 `ele`、时间 `time`
- 可用于轨迹可视化、路线分析、速度/海拔变化统计

## 数据库 schema
数据库名：`footprint`（SQLite 文件，见根目录 `db/footprint.sqlite`）

### track_point（原始轨迹点）
- `id` integer primary key
- `source` text not null（固定为 `footprint`）
- `track_date` text not null（ISO 日期 `YYYY-MM-DD`）
- `ts` text not null（ISO 时间）
- `lat` real not null
- `lon` real not null
- `ele` real
- `speed` real
- `course` real

索引：
- `idx_track_point_date` on `track_point(track_date)`
- `idx_track_point_ts` on `track_point(ts)`

### track_day_agg（按天聚合）
- `source` text not null
- `day` text not null（ISO 日期 `YYYY-MM-DD`）
- `point_count` integer not null
- `min_ts` text
- `max_ts` text
- `avg_speed` real
- `min_lat` real
- `max_lat` real
- `min_lon` real
- `max_lon` real
- primary key (`source`, `day`)

### track_week_agg（按周聚合，周一为起始）
- `source` text not null
- `week_start` text not null（ISO 日期，周一）
- `point_count` integer not null
- primary key (`source`, `week_start`)

### track_month_agg（按月聚合）
- `source` text not null
- `month` text not null（ISO 日期，使用每月 1 日）
- `point_count` integer not null
- primary key (`source`, `month`)

### track_year_agg（按年聚合）
- `source` text not null
- `year` integer not null
- `point_count` integer not null
- primary key (`source`, `year`)

## 规则映射
- `track_point` 每条对应一个 `trkpt`
- `track_point.track_date` 来自 `time` 的日期部分（UTC）
- `track_day_agg`/`track_week_agg`/`track_month_agg`/`track_year_agg` 均从 `track_point` 聚合

## 聚合规则
- 周聚合以周一为周起始：`week_start = date(ts, '-6 days', 'weekday 1')`
- 月聚合以每月 1 日作为 `month`
- 年聚合以年份整数作为 `year`
