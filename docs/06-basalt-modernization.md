> 历史参考：本文涉及的旧运行时/数据库路径属于 0.2.x（Git `6cdb344`）。当前架构见 [08 重构记录](08-chronicle-rewrite.md)，UI 见 [09 Basalt UI](09-basalt-ui.md)。

# Basalt 公共组件升级

Life.ai Dashboard 已从自建 Basalt 风格组件迁移到 npm 包 `@nocoo/basalt` 2.1.7。本文件记录当前架构与保留边界；旧的分阶段现代化计划已经完成并不再作为实现依据。

## 应用框架

- 根布局挂载 Basalt `ThemeProvider`、`AccentProvider`、`LinkProvider`、`TooltipProvider` 与 `Toaster`。
- `AppShell`、`AppMain`、`AppHeader`、`ContentIsland` 和 `Sidebar` 共同管理固定视口、顶部栏、内容滚动和侧栏宽度。
- 桌面侧栏宽度由 Basalt 管理为 260px / 68px；移动端通过 `Sheet` 呈现同一导航。
- Sidebar 顶部从 Dashboard `package.json` 读取版本号，不在组件中硬编码。
- AppHeader 只显示当前页面与祖先面包屑；页面标题、说明和日期导航放在 `PageHeader`。

## 主题与表面

- `globals.css` 按 Basalt Tailwind 契约加载公共 token，不再维护第二套 `background`、`card`、`secondary` 或 24 色 chart token。
- Life.ai 使用蓝色品牌 accent：Light `217 91% 60%`，Dark `217 91% 65%`。首屏脚本预先设置对应的可访问语义 primary，避免 hydration 变色。
- 页面内容位于 L1 `ContentIsland`；内容卡片使用 `LayerCard`，嵌套卡片由 Basalt 自动提升到下一亮度层级。
- 页面区域使用 `SectionRule`，不再用 `muted` 模拟内容表面。

## 公共组件

直接使用 Basalt 的按钮、输入、日期选择、Select、Tabs、Badge、Table、ScrollArea、Skeleton、StatCard、HeatmapCalendar、Tooltip、命令面板和导航组件。

图表适配器保留 Life.ai 原有数据接口：

- 标准折线图和柱状图委托给 Basalt 图表。
- 平均参考线、独立坐标轴控制、数据点和水平柱状图等 Basalt 尚未直接提供的行为继续由 Recharts fallback 实现。
- Donut 图以 Basalt `ChartFrame` 提供可访问容器，同时保留原来的半径、标签和百分比 tooltip。
- 每个图表必须提供业务语义 `ariaLabel`，适配器会生成文本数据替代。

## 项目专用组件

以下组件没有等价的公共组合，继续保留在 `dashboard/src/components/ui/`：

- Leaflet / Google Map 与绘制、图层、定位控件。
- Photon 地点自动完成。
- 地图需要的 Checkbox / Radio dropdown 与组合按钮。

这些包装内部仍复用 Basalt Button、InputGroup、Loader、主题 token 和表面 token；不得重新引入通用 shadcn 组件副本。

## 安全与验证

- Google OAuth callback 只接受以单个 `/` 开头的站内路径。
- Dashboard 与 API 的认证边界保持不变。
- 提交门禁运行脚本与 Dashboard 单测、覆盖率及 lint。
- 发布前额外运行生产构建、API 集成测试和 Playwright 登录页冒烟测试。
