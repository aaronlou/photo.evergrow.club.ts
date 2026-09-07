# 拾光团购 · EverGrow

摄影爱好者的在线团购平台：拼团购买专业摄影服务（旅拍 / 写真 / 课程 / 器材）。

- 前端：**Vue 3** + Vite + TypeScript + Pinia + Vue Router + Naive UI
- 后端：**Node.js + TypeScript + Effect**，DDD 模块化单体（限界上下文模块化，可平滑拆分微服务）
- 仓库：**pnpm workspaces + Turborepo** monorepo，前后端共享 API 契约（packages/contracts）

## 环境要求

- Node.js **≥ 22.13**（配合 pnpm 11；本机可用 `nvm use 24`）
- pnpm ≥ 11
- Docker（可选，仅接入 PostgreSQL/Redis/MinIO 时需要）

## 快速开始

```bash
# 1. 安装依赖
pnpm install

# 2. （可选）启动基础设施：Postgres / Redis / MinIO
docker compose up -d
cp .env.example .env        # 骨架阶段不接数据库也可直接运行

# 3. 启动开发服务（api: http://localhost:3000，web: http://localhost:5173）
pnpm dev

# 或分别启动
pnpm --filter @evergrow/api dev
pnpm --filter @evergrow/web dev
```

打开 http://localhost:5173 即可看到前端页面（首页会显示后端连接状态）。

- API 文档（Swagger，由 Effect HttpApi 自动生成）：http://localhost:3000/docs
- 健康检查：`curl http://localhost:3000/api/health`

**注意**：骨架阶段后端默认使用**内存仓储**，无需数据库即可运行；接入 PostgreSQL 后切换方式见 `apps/api/src/shared/db.ts` 与各模块的 SQL 仓储实现。

## 常用命令

```bash
pnpm dev         # 并行启动 api + web 开发服务
pnpm build       # 构建所有包（turbo 自动处理依赖顺序）
pnpm typecheck   # 全量 TypeScript 检查
pnpm test        # 运行测试（vitest）
pnpm lint        # ESLint（含 DDD 分层边界规则）
```

## Docker 部署

生产环境一条命令部署（api + web + postgres + redis）：

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

- 访问 `http://<服务器>:8080`（宿主机端口用 `WEB_PORT` 环境变量调整，如 `WEB_PORT=18080 docker compose -f docker-compose.prod.yml up -d`）
- 数据库密码用 `POSTGRES_PASSWORD` 环境变量配置（默认 `evergrow`，生产务必修改）
- **api 容器启动时自动执行 `apps/api/migrations/` 下的数据库迁移**（Effect SQL Migrator，幂等可重复执行）
- 配置了 `DATABASE_URL` 时后端自动切换到 PostgreSQL 仓储；未配置则回落到内存仓储
- 数据持久化在 `evergrow_pgdata` 卷；备份示例：`docker compose -f docker-compose.prod.yml exec postgres pg_dump -U evergrow evergrow > backup.sql`
- 前端由 Nginx 托管并反向代理 `/api` 到 api 容器（SPA 路由回退已配置），api 不直接暴露到宿主机

### 生产 HTTPS

compose 里的 web 容器只监听 80，对外建议加一层反向代理终止 TLS：

```bash
# 服务器上用 Caddy（自动申请证书）
caddy reverse-proxy --from your-domain.com --to localhost:8080
```

### 常用运维命令

```bash
docker compose -f docker-compose.prod.yml ps                 # 状态
docker compose -f docker-compose.prod.yml logs -f api        # api 日志
docker compose -f docker-compose.prod.yml restart api        # 滚动重启单个服务
docker compose -f docker-compose.prod.yml down               # 停止（保留数据卷）
```

## 目录结构

```
apps/
  api/            # 后端：Effect + DDD 模块化单体（组合根 src/main.ts）
  web/            # 前端：Vue 3 单页应用
packages/
  contracts/      # 前后端共享 API 契约类型
  eslint-config/  # 共享 ESLint 配置
docs/
  architecture.md # 架构与分层规范
  contexts.md     # 限界上下文与上下文映射
```

后端模块组织与 DDD 分层规范详见 [docs/architecture.md](docs/architecture.md)；各限界上下文的规划见 [docs/contexts.md](docs/contexts.md) 与 `apps/api/src/modules/*/README.md`。

## 当前进度

- ✅ **M0 骨架**：monorepo 工程化、DDD 分层模板、identity 上下文完整示例（内存 + SQL 双仓储适配器）、前后端契约与端到端联调
- ⏳ M1：catalog（商家 / 摄影套餐目录）
- ⏳ M2：groupbuy + ordering + payment（核心业务闭环：拼团 → 下单 → 支付 → 成团）
- ⏳ M3：redemption（券码核销）+ 管理端
- ⏳ M4：community（作品分享 / 评价）与营销
