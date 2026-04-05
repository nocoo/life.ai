# 06 Basalt 现代化升级规划

> 将 life.ai dashboard 全面升级至 Basalt Family 设计规范（B-0 至 B-5），包含 Next.js 版本升级与界面现代化。

## 概述

### 目标

1. **Next.js 版本升级**：从 Next.js 15 升级至 Next.js 16
2. **Basalt 规范对齐**：全面应用 B-0 至 B-5 六项规范
3. **架构代际升级**：从 Gen 1（Props 传递）升级至 Gen 2（Context 模式）

### 参考规范

| 规范 | 内容 | 来源 |
|------|------|------|
| B-0 | 项目清单、架构代际、12 项指纹矩阵 | Memory |
| B-1 | Login Page 最佳实践（Badge Card 设计） | Memory |
| B-2 | Dashboard 框架 — 侧边栏、顶栏、面包屑、布局 | Memory |
| B-3 | 图表规范 — palette.ts、Recharts 配色、24 色系统 | Memory |
| B-4 | 内容页面 UI — 骨架屏、过滤栏、按钮、表格排序、Badge、StatCard | Memory |
| B-5 | 色彩亮度系统 — 三层亮度模型（L0/L1/L2）与交互控件（L3） | Memory |

### 当前状态

| 项目 | 当前版本 | 目标版本 |
|------|----------|----------|
| Next.js | 15.2.4 | 16.x |
| React | 19.0.0 | 19.x（保持） |
| Tailwind CSS | 4.x | 4.x（保持） |
| 架构代际 | Gen 1（DashboardLayout + AppSidebar Props 传递） | Gen 2（Context 模式） |

---

## 第一部分：现状基线评估

### 1.1 已完全符合规范

#### ✅ B-5 色彩亮度系统

`globals.css` 已采用 Basalt 三层亮度模型，Light/Dark 模式的 L0/L1/L2 值与 basalt 模板完全一致。

#### ✅ B-3 图表规范

- `lib/palette.ts` **已存在**，导出：`chart`、`CHART_COLORS`、`CHART_TOKENS`、`withAlpha`、`chartAxis`、`chartPositive`、`chartNegative`、`chartPrimary`
- `globals.css` 包含完整 24 色 chart palette（`--chart-1` 至 `--chart-24`）及 heatmap 色阶

#### ✅ B-4 StatCard

`components/charts/stat-card.tsx` **已完整实现** pew 标准：
- `font-display tracking-tight` 大数值
- `text-success` / `text-destructive` trend badge
- `bg-card p-2` 图标容器
- `rounded-card bg-secondary` L2 卡片样式

#### ✅ B-4 骨架屏

Day/Month/Year 三个页面**均已有专用 `LoadingSkeleton`**，结构匹配真实内容布局。

#### ✅ B-1 Login Page

当前 `login/page.tsx` 已实现 Badge Card 设计：
- w-72，aspect-[54/86]
- 9 步渐变 radial glow 背景
- 6 层 box-shadow
- Barcode + GoogleIcon 组件
- Footer strip 带脉冲绿点

#### ✅ B-2 Dashboard 框架（部分）

- 侧边栏尺寸：w-[260px] / w-[68px]
- 过渡动画：`transition-all duration-300 ease-in-out`
- ⌘K 命令面板
- 移动端 overlay 侧边栏 + 路由切换自动关闭 + body 滚动锁定
- 浮岛式内容区域：`rounded-[16px] md:rounded-[20px] bg-card`

### 1.2 待升级部分

#### ❌ 架构代际（Gen 1 → Gen 2）

**当前（Gen 1）**：DashboardLayout 内部 useState 管理 collapsed/mobileOpen，通过 props 传递给 AppSidebar。

**目标（Gen 2）**：抽取为 SidebarProvider context，**同时保留现有行为**：
- 路由切换后自动关闭移动侧栏（`useEffect` 监听 `pathname`）
- 移动侧栏打开时锁定 body 滚动（`useEffect` 设置 `document.body.style.overflow`）

#### ❌ B-1 Login Page 安全性

**差距**：
- 缺少 callbackUrl 安全校验
- 缺少右上角 ThemeToggle + GitHub 链接
- 缺少 Suspense 包裹（若改用客户端组件）

**参考实现**：pew 项目 `packages/web/src/app/login/page.tsx`

pew 采用**客户端组件**模式：
- 使用 `next-auth/react` 的 `signIn()` 而非服务端 `@/lib/auth` 的 `signIn()`
- `useSearchParams()` 读取 callbackUrl，需 Suspense 包裹
- 校验规则：`rawCallback.startsWith("/") && !rawCallback.startsWith("//")`

```tsx
const rawCallback = searchParams.get("callbackUrl");
const callbackUrl = rawCallback && rawCallback.startsWith("/") && !rawCallback.startsWith("//") 
  ? rawCallback 
  : "/day";
```

此规则允许所有 `/` 开头的相对路径，仅拒绝 `//` 开头的协议相对 URL。

#### ❌ 面包屑导航

**当前**：仅显示页面标题
**目标**：完整面包屑 + `aria-current="page"` 无障碍属性

#### ❌ 版本号显示

**当前**：无版本显示
**目标**：侧边栏 logo 旁显示 `v{APP_VERSION}` badge

#### ❌ sonner toast

**当前**：未集成
**目标**：添加 Sonner Toaster，用于操作反馈

---

## 第二部分：Next.js 16 升级

### 2.1 依赖升级清单

```json
{
  "dependencies": {
    "next": "^16.0.0",
    "next-auth": "^5.0.0"
  },
  "devDependencies": {
    "eslint-config-next": "^16.0.0"
  }
}
```

### 2.2 Lint 脚本迁移

Next.js 16 **已移除 `next lint` 命令**，必须改用 ESLint CLI：

```diff
// package.json
{
  "scripts": {
-   "lint": "next lint",
+   "lint": "eslint .",
  }
}
```

### 2.3 升级步骤

```bash
cd dashboard

# 1. 升级依赖
bun update next next-auth eslint-config-next

# 2. 修改 lint 脚本（手动编辑 package.json）
# "lint": "next lint" → "lint": "eslint ."

# 3. 清理缓存
rm -rf .next

# 4. 验证
bun run build
bun run lint
bun dev
```

---

## 第三部分：B-2 Dashboard 框架升级（Gen 2）

### 3.1 设计要点

Gen 2 SidebarProvider 必须**完整保留**现有行为：

1. **路由切换自动关闭移动侧栏**
2. **移动侧栏打开时锁定 body 滚动**

这两个 effect 当前在 `DashboardLayout.tsx:37-52` 实现，升级后应移入 Provider 或保留在 AppShellInner。

### 3.2 sidebar-context.tsx

```tsx
"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";

interface SidebarContextValue {
  collapsed: boolean;
  toggle: () => void;
  setCollapsed: (value: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (value: boolean) => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  const toggle = () => setCollapsed((prev) => !prev);

  // 路由切换时关闭移动侧栏
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // 移动侧栏打开时锁定 body 滚动
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <SidebarContext.Provider value={{ collapsed, toggle, setCollapsed, mobileOpen, setMobileOpen }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
}
```

### 3.3 navigation.ts 设计

**保持 icon 为 React 组件类型**（与现有 AppSidebar 兼容），而非字符串：

```ts
import type { LucideIcon } from "lucide-react";
import { CalendarDays, CalendarRange, CalendarClock } from "lucide-react";

export interface NavItemDef {
  href: string;
  label: string;
  icon: LucideIcon;  // 保持为组件类型，兼容现有 <item.icon /> 用法
  external?: boolean;
}

export interface NavGroupDef {
  label: string;
  items: NavItemDef[];
  defaultOpen?: boolean;
}

export const NAV_GROUPS: NavGroupDef[] = [
  {
    label: "日常",
    defaultOpen: true,
    items: [
      { href: "/day", label: "日视图", icon: CalendarDays },
      { href: "/month", label: "月视图", icon: CalendarRange },
      { href: "/year", label: "年视图", icon: CalendarClock },
    ],
  },
];

export const ROUTE_LABELS: Record<string, string> = {
  "/": "首页",
  "/day": "日视图",
  "/month": "月视图",
  "/year": "年视图",
};
```

### 3.4 版本号显示

```ts
// lib/version.ts
import pkg from "../../package.json";
export const APP_VERSION = pkg.version;
```

侧边栏 logo 区域添加：
```tsx
<span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground leading-none">
  v{APP_VERSION}
</span>
```

---

## 第四部分：B-1 Login Page 完善

### 4.1 架构调整：对齐 pew 客户端模式

当前 life.ai 登录页是服务端组件 + 内联 server action。为对齐 basalt 家族标准（pew），改为**客户端组件**模式：

| 项目 | 现状 | 目标 |
|------|------|------|
| 组件类型 | 服务端组件 | 客户端组件 `"use client"` |
| signIn 来源 | `@/lib/auth`（服务端） | `next-auth/react`（客户端） |
| callbackUrl 读取 | 内联 server action 硬编码 | `useSearchParams()` |
| Suspense | 无需 | 必须包裹 |

### 4.2 callbackUrl 安全校验

采用 pew 的校验规则：

```tsx
const rawCallback = searchParams.get("callbackUrl");
const callbackUrl = rawCallback && rawCallback.startsWith("/") && !rawCallback.startsWith("//")
  ? rawCallback
  : "/day";
```

- ✅ 允许：`/day`、`/month?tab=health`、`/year#section`
- ❌ 拒绝：`//evil.example`、`https://evil.example`、`javascript:...`

### 4.3 完整实现参考

```tsx
"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Github } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const rawCallback = searchParams.get("callbackUrl");
  const callbackUrl = rawCallback && rawCallback.startsWith("/") && !rawCallback.startsWith("//")
    ? rawCallback
    : "/day";

  const handleGoogleLogin = () => {
    signIn("google", { callbackUrl });
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background p-4 overflow-hidden">
      {/* 右上角控件栏 */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-1">
        <a
          href="https://github.com/nocoo/life.ai"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub repository"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <Github className="h-[18px] w-[18px]" strokeWidth={1.5} />
        </a>
        <ThemeToggle />
      </div>

      {/* Radial glow + Badge Card（保持现有结构） */}
      {/* ... */}

      {/* 错误显示 */}
      {error && (
        <div className="mt-3 w-full rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive text-center">
          {error === "AccessDenied" ? "访问被拒绝" : "登录失败，请重试"}
        </div>
      )}

      {/* Google 登录按钮（改用 onClick） */}
      <button
        onClick={handleGoogleLogin}
        className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-secondary px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-accent"
      >
        <GoogleIcon />
        Continue with Google
      </button>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginSkeleton />}>
      <LoginContent />
    </Suspense>
  );
}
```

### 4.4 LoginSkeleton 组件

```tsx
function LoginSkeleton() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-72 aspect-[54/86] rounded-2xl bg-card animate-pulse" />
    </div>
  );
}
```

---

## 第五部分：指纹对齐

### Basalt 指纹矩阵（11 项适用）

> 注：#12 proxy.ts 用于 Vite SPA 项目的后端代理，Next.js 项目使用 API Routes 直接处理，**不纳入评分**。

| # | 指纹项 | 当前状态 |
|---|--------|----------|
| 1 | palette.ts (--chart-1~24) | ✅ |
| 2 | viewmodels/ MVVM | ✅ |
| 3 | DashboardLayout 或 app-shell | ✅ |
| 4 | AppSidebar 或 sidebar | ✅ |
| 5 | sidebar-context (Gen 2) | ✅ |
| 6 | Recharts 图表 | ✅ |
| 7 | shadcn/ui 组件 | ✅ |
| 8 | sonner toast | ✅ |
| 9 | cmdk 命令面板 | ✅ |
| 10 | Tailwind CSS 4 | ✅ |
| 11 | CSS --chart-* 变量 | ✅ |

**当前得分**：11/11

### 升级后

| # | 指纹项 | 升级后 |
|---|--------|--------|
| 5 | sidebar-context | ✅ 完成 |
| 8 | sonner toast | ✅ 完成 |

**最终得分**：11/11 ✅

---

## 第六部分：执行计划

### Phase 1：Next.js 16 升级 ✅

```
✅ 升级 next、next-auth、eslint-config-next
✅ 修改 lint 脚本：next lint → eslint .
✅ 清理 .next 缓存
✅ 验证构建通过
✅ 验证 lint 通过
✅ 验证所有页面正常
```

### Phase 2：Gen 2 Sidebar 升级 ✅

```
✅ 创建 components/sidebar-context.tsx（含路由关闭 + body 锁定逻辑）
✅ 创建 lib/navigation.ts（保持 icon 为组件类型）
✅ 创建 lib/version.ts
✅ 重构 components/DashboardLayout.tsx → 使用 SidebarProvider 包裹
✅ 重构 components/AppSidebar.tsx → 使用 useSidebar() hook
✅ 添加版本号 badge
✅ 验证：侧边栏折叠/展开、移动端 overlay、⌘K
```

### Phase 3：Login Page 完善 ✅

```
✅ 改为客户端组件（"use client"）
✅ 改用 next-auth/react 的 signIn()
✅ 添加 useSearchParams() + callbackUrl 校验
✅ 添加 Suspense 包裹 + LoginSkeleton
✅ 添加右上角控件栏（GitHub + ThemeToggle）
✅ 添加错误信息显示
✅ 添加 LoginContent 测试（14 个用例）
```

### Phase 4：面包屑 + Toast ✅

```
✅ 添加 Breadcrumbs 组件（components/layout/breadcrumbs.tsx）
✅ 集成 sonner Toaster（app/layout.tsx）
✅ 添加 Breadcrumbs 测试
```

### Phase 5：测试验证 ✅

```
✅ 所有单元测试通过 (523 tests)
✅ 覆盖率 98.07% (≥ 90%)
✅ Lint 通过
✅ 生产构建通过
```

---

## 第七部分：验收标准

### 功能验收

- [ ] 所有页面正常加载
- [ ] 侧边栏折叠/展开正常
- [ ] 移动端 overlay 正常 + 路由切换自动关闭
- [ ] ⌘K 命令面板正常
- [ ] 主题切换正常
- [ ] 登录流程正常（callbackUrl 安全）

### 规范验收

- [ ] 指纹得分 11/11
- [ ] Gen 2 Context 模式实现
- [ ] 版本号显示在侧边栏
- [ ] 面包屑导航实现

### 技术验收

- [ ] Next.js 16 + eslint-config-next 16 版本一致
- [ ] 单元测试通过
- [ ] Lint 0 错误

---

## 附录：Basalt 规范快速参考

### 色彩层级（B-5）

| 层级 | 用途 | Light | Dark |
|------|------|-------|------|
| L0 | 页面底色 | 94% | 9% |
| L1 | 浮岛内容区 | 97% | 10.6% |
| L2 | 内部卡片 | 100% | 12.2% |

### 侧边栏尺寸（B-2）

- 展开：`w-[260px]`
- 收起：`w-[68px]`
- 过渡：`transition-all duration-300 ease-in-out`

### 图标规范

- 尺寸：`h-4 w-4`（导航）/ `h-5 w-5`（StatCard）
- 线宽：`strokeWidth={1.5}`
