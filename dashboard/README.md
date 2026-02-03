# Dashboard

Life.AI 可视化前端项目。

## 技术栈
- **框架**: Next.js 15 (App Router)
- **样式**: Tailwind CSS v4
- **组件库**: shadcn/ui (Button, Calendar)
- **状态管理**: Zustand (MVVM ViewModel 层)
- **运行时**: Bun
- **测试**: Bun Test
- **端口**: 7013

## 目录结构

```
dashboard/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/health/         # Health API 端点
│   │   ├── layout.tsx          # 根布局
│   │   └── page.tsx            # 首页
│   ├── models/                 # Model 层 (数据模型/类型)
│   ├── viewmodels/             # ViewModel 层 (Zustand Stores)
│   ├── views/                  # View 层 (UI 组件)
│   ├── services/               # 服务层 (API 调用)
│   ├── components/ui/          # shadcn/ui 组件
│   └── lib/                    # 工具函数
├── tests/                      # 单元测试
└── coverage-check.ts           # 覆盖率检查脚本
```

## MVVM 架构

```
View 层 (React Components)
    ↓ useStore hooks
ViewModel 层 (Zustand Stores)
    ↓ async calls
Service 层 (API Clients)
    ↓ HTTP
Model 层 (Types & Interfaces)
```

## 命令

```bash
# 开发
bun dev           # 启动开发服务器 (端口 7013)

# 测试
bun run ut        # 运行测试 + 覆盖率检查 (阈值 90%)
bun run ut:watch  # 监视模式

# 构建
bun run build     # 生产构建
bun run start     # 启动生产服务器

# 代码检查
bun run lint      # ESLint 检查
```

## API 端点

### GET /api/health
健康检查端点。

**响应**:
```json
{
  "status": "ok",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "version": "1.0.0"
}
```
