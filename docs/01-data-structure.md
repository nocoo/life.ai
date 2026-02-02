# 01 data structure

## 概览
这份数据来自 Apple Health 导出，目录内主要包含三类原始数据文件：
- `导出.xml`：HealthKit 标准导出（包含 Record/Workout/Correlation/ActivitySummary 等实体）
- `export_cda.xml`：CDA（HL7 Clinical Document Architecture）格式的临床文档导出
- `electrocardiograms/*.csv`：心电图（ECG）原始采样序列
- `workout-routes/*.gpx`：运动轨迹（GPX）点位序列

## 目录结构
```
/data
├── apple-health/
│   ├── 导出.xml
│   ├── export_cda.xml
│   ├── electrocardiograms/
│   │   └── ecg_YYYY-MM-DD[_N].csv
│   └── workout-routes/
│       └── route_YYYY-MM-DD_h.mm(am|pm).gpx
└── footprint/
    └── 20260202.gpx
```

## 导出.xml（HealthKit Export XML）
### DTD/顶层结构
- 根节点：`HealthData`，带 `locale` 属性
- 主要子节点：`ExportDate`、`Me`、`Record`、`Correlation`、`Workout`、`ActivitySummary`
- 文件内包含 DTD 描述实体与属性（HealthKit Export Version: 14）

### 核心实体与字段特征
- `Record`
  - 典型字段：`type`、`unit`、`value`、`sourceName`、`sourceVersion`、`device`、`creationDate`、`startDate`、`endDate`
  - 示例：`HKQuantityTypeIdentifierDietaryWater`、`HKQuantityTypeIdentifierHeartRate` 等
- `Correlation`
  - 用于把多个 `Record` 组合成一个关联测量（如血压）
  - 典型字段：`type`、`sourceName`、`device`、`creationDate`、`startDate`、`endDate`
- `Workout`
  - 典型字段：`workoutActivityType`、`duration`、`totalDistance`、`totalEnergyBurned` 等
  - 内部可包含 `WorkoutStatistics`、`WorkoutEvent`、`WorkoutRoute`
- `ActivitySummary`
  - 按天聚合的活动摘要：`activeEnergyBurned`、`appleExerciseTime`、`appleStandHours` 等

### 类型体系（type 字段）
- 以 `HKQuantityTypeIdentifier*`、`HKCategoryTypeIdentifier*`、`HKCorrelationTypeIdentifier*` 为主
- `Workout` 的类型以 `HKWorkoutActivityType*` 和 `HKWorkoutEventType*` 为主
- 这是后续做数据字典和指标映射的关键维度

### 关联外部文件
- `WorkoutRoute` 内会出现 `FileReference path="/workout-routes/route_...gpx"`
- 说明 `导出.xml` 是索引，轨迹数据存放在独立 GPX 文件中

## export_cda.xml（CDA 文档）
- HL7 CDA 结构化临床文档
- 顶层为 `ClinicalDocument`，带完整命名空间与 schema 信息
- 示例片段中包含：`observation`、`effectiveTime`、`value` 等字段
- 该文件更接近“临床文书”语义，适合做摘要或与专业医疗系统对齐

## electrocardiograms/*.csv（ECG）
- CSV 文件前置元信息（中文字段）：姓名、出生日期、记录日期、分类、设备、采样率等
- 数据主体为单导联电压采样序列（单位：µV）
- 采样率示例：512 Hz
- 典型应用：心率/节律分析、噪声过滤、波形特征提取

## workout-routes/*.gpx（运动轨迹）
- GPX 1.1 标准，`trk`/`trkseg`/`trkpt` 结构
- 轨迹点包含：经纬度 `lat/lon`、海拔 `ele`、时间 `time`
- 扩展字段（`extensions`）包含：`speed`、`course`、`hAcc`、`vAcc`
- 可用于轨迹可视化、配速分析、路线聚类等

## 第一步建议（可视化与数据挖掘）
第一步是“建立数据字典 + 统一时间轴索引”，把原始数据映射成可分析的结构化表：
1. 从 `导出.xml` 解析出所有 `Record/Workout/Correlation/ActivitySummary` 的字段与 type 列表
2. 生成一份 “type -> 语义/单位/来源” 的数据字典（可先自动抽取，再人工标注）
3. 为所有数据统一时间字段（startDate/endDate/creationDate）并规范时区
4. 针对 ECG 与 GPX 做独立索引表（文件名、时间范围、采样率、点数量等）

完成这一步后，才能稳定进入：指标可视化、时序分析、行为模式与异常检测等工作。
