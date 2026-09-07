# 架构说明

## 总体架构

```
┌─────────────────────┐         ┌──────────────────────────────┐
│  apps/web (Vue 3)   │  HTTP   │  apps/api (Node + Effect)    │
│  Pinia / Router     │ ──────▶ │  DDD 模块化单体              │
│  Naive UI / Vite    │ /api/*  │  HttpApi 自动生成 OpenAPI    │
└─────────────────────┘         └──────────────────────────────┘
          │                                   │
          └──────── packages/contracts ───────┘  （共享契约类型）
                                   │
                     ┌─────────────┼─────────────┐
                     ▼             ▼             ▼
                PostgreSQL       Redis      MinIO / OSS
```

- **Monorepo**：pnpm workspaces + Turborepo，依赖顺序与缓存由 turbo 编排
- **模块化单体**：每个限界上下文是 `apps/api/src/modules/<context>` 下的独立模块，内部严格分层；未来某上下文负载升高可平滑拆为独立服务
- **契约共享**：HttpApi 自动生成 OpenAPI（http://localhost:3000/docs），骨架阶段 contracts 为手写类型，M1 起改用 codegen 自动生成

## 后端 DDD 分层（每个模块统一）

```
modules/<context>/
├── domain/             # 纯领域层：聚合根/实体/值对象/领域事件/端口，只用 Effect + Schema
├── application/        # 用例层：编排领域对象、控制事务边界、发布领域事件
├── infrastructure/     # 适配器：仓储实现（内存/SQL）、外部服务（支付网关、OSS）
└── interface/          # 接口层：HttpApi 路由、DTO、OpenAPI
```

### 依赖规则（eslint-plugin-boundaries 强制）

```
interface ──▶ application ──▶ domain
                   ▲
        infrastructure（实现 domain 定义的端口）
```

- `domain` 只允许依赖 `shared`（共享内核）；`application` 只依赖 `domain/shared`；`interface` 依赖 `application/domain/shared`
- 组合根 `src/main.ts` 是唯一允许跨层装配的地方
- 跨上下文只通过端口/适配器或领域事件通信；聚合间只持有外部引用（ID），不跨聚合导航
- 事务只在单个聚合内；跨聚合一致性通过领域事件最终一致（如"流团"事件驱动自动退款）

### Effect 与 DDD 概念的对应

| DDD 概念 | Effect 落地方式 |
|---|---|
| 领域模型与校验 | `Schema.Class` / `Schema.Struct` / `Schema.brand` |
| 领域错误 | `Schema.TaggedError` 类（既是错误又是 Schema，可进 OpenAPI） |
| 端口（Repository 等） | `Effect.Service` + `make`，默认实现为失败桩 |
| 适配器实现与注入 | `Layer`（`Layer.effect` / `Layer.succeed`） |
| 应用服务 | `Effect.Service` + `Default` Layer |
| 组合根 | `src/main.ts`：`Layer.provide` 逐层装配 + `Layer.launch` |
| 事务 | `SqlClient.withTransaction`（接入数据库后） |
| 时间 / 随机 | `Clock` / 自建 `IdGenerator` 服务（可测试、可注入） |

### 本项目踩过的 Effect 3.22 版本细节（重要）

- `Layer.provide(a, b, c)` 多依赖扁平写法有缺陷（部分依赖丢失）：**必须逐层嵌套** `Layer.provide(Layer.provide(a, b), c)`
- 服务在 `effect` 构造时**捕获依赖**（`const repo = yield* UserRepository`），方法签名不泄漏上下文要求
- 不支持 `yield* error`（那是 Effect 4 语法），失败用 `return yield* Effect.fail(...)`
- HttpApi 组注册：`HttpApi.make("Api").add(group.prefix("/x"))`；handler 用 `HttpApiBuilder.group(Api, "name", (handlers) => handlers.handle("endpoint", fn))`
- `Data.TaggedError` 不带 Schema，接口层错误用 `Schema.TaggedError`
- ID 生成：Effect 已无 `Crypto.randomUUID`，用共享内核自建 `IdGenerator` 服务

## 前端结构

```
apps/web/src/
├── api/          # 类型化 API 客户端（与 packages/contracts 对应）
├── components/   # 通用组件
├── composables/  # 组合式函数（如 useCountdown）
├── layouts/      # 布局
├── pages/        # 页面（按路由懒加载）
├── router/       # Vue Router
├── stores/       # Pinia（仅客户端会话态；服务端数据后续引入 @tanstack/vue-query）
└── styles/       # 全局样式与设计变量
```

- 移动端 H5 优先的响应式布局；开发环境由 Vite 代理 `/api` → `localhost:3000`
- 主题色等设计变量集中在 `styles/main.css` 与 `App.vue` 的 Naive UI themeOverrides

## 测试策略

- **领域层**：纯单元测试（vitest + `Effect.runPromise`），不依赖基础设施
- **应用层**：注入内存仓储测试用例行为（见 `apps/api/test/identity.test.ts`）
- **接口层**：本地启动服务 + curl / 浏览器端到端验证
- 错误断言使用 `Effect.runPromiseExit` + `Cause.failureOption`（`runPromise` 拒绝的是 FiberFailure 包装）

## 数据库与基础设施

- PostgreSQL（Effect SQL `@effect/sql-pg`），每上下文独立表命名空间，迁移脚本在 `apps/api/migrations/`
- Redis：限流 / 缓存 / 拼团名额并发控制（M2 接入）
- 对象存储：本地 MinIO / 生产 OSS（摄影作品图片）
- 数据接入由组合根按环境选择：配置 `DATABASE_URL` → `DbLive` + `*RepositorySql`；否则内存仓储（本地开发零依赖启动）
- 数据库迁移：`src/migrate.ts`（Effect SQL Migrator + `sql.unsafe` 执行 SQL 文件），生产容器启动前自动执行，未配置 `DATABASE_URL` 时跳过

## Docker 部署

- `apps/api/Dockerfile`：多阶段构建（workspace 安装 → tsc 编译 → `pnpm deploy --legacy --prod` 裁剪生产依赖），启动命令 `node dist/migrate.js && node dist/main.js`
- `apps/web/Dockerfile`：Vite 构建产物 + Nginx（SPA 回退 + `/api` 反向代理，见 `apps/web/nginx.conf`）
- `docker-compose.prod.yml`：api / web / postgres / redis 四服务，api 依赖 postgres 健康检查，数据卷 `evergrow_pgdata` 持久化
- 一条命令部署：`docker compose -f docker-compose.prod.yml up -d --build`，详见 README「Docker 部署」章节
