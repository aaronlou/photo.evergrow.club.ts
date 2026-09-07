# 生产部署（镜像拉取版）

本项目采用 **GitHub Actions 构建镜像 → 推送 GHCR → 服务器仅 `docker pull` + 编排** 的方式部署。

```
[GitHub push/tag]
      │  GitHub Actions（.github/workflows/docker-build-push.yml）
      ▼
 构建 api / web 镜像 ──push──▶ ghcr.io/aaronlou/photo.evergrow.club.ts/{api,web}
                                       │
                                       ▼  服务器 docker pull + compose up
                              (api / web / postgres / redis)
```

## 镜像列表

| 镜像 | 说明 | 启动 |
|---|---|---|
| `ghcr.io/aaronlou/photo.evergrow.club.ts/api` | Effect API（含迁移） | `node dist/migrate.js && node dist/main.js`，`:3000`（仅内网） |
| `ghcr.io/aaronlou/photo.evergrow.club.ts/web` | Vue 构建产物 + Nginx（SPA 回退 + `/api`→api 反代） | `:80`，宿主机 `WEB_PORT` |

标签策略：`latest` + `sha-<commit>`，打 `v*` 标签时额外出 `vX.Y.Z`。

## 一、GitHub 侧（一次配置）

1. 确认仓库 Settings → Actions → General → **Workflow permissions** 设为 **Read and write permissions**（保证 `GITHUB_TOKEN` 具备 `packages: write`）。
2. Actions 里首次运行时，`docker/login-action` 会用 `secrets.GITHUB_TOKEN` 登录 `ghcr.io`；`packages: write` 已在本工作流的 `permissions` 声明。
3. 推送 main 或 `v*` 标签即触发构建与推送；PR 仅校验构建不推送。
4. （可选）私仓或私有包：服务器端拉取需 `read:packages` 的 PAT。

> 私有仓库的 GHCR 包默认是私有的。若本仓库是私有的，需要把 `api`/`web` 两个镜像包在 GitHub → Packages 里设为 **Public**（或授权给服务器读取），否则服务器匿名拉取会 401。

## 二、服务器侧

前置：Docker Engine + Compose v2。

```bash
# 1. 准备 .env（可选；默认值即可起步）
cat > .env <<'EOF'
WEB_PORT=8080                 # 宿主机暴露端口
POSTGRES_PASSWORD=change-me   # 务必修改
# 私有镜像仓库才需要：
# GHCR_USER=your-github-user
# GHCR_TOKEN=your-fine-grained-pat (read:packages)
EOF

# 私有镜像仓库：先登录（匿名可拉取公包则跳过）
echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin

# 2. 首次部署（自动拉取镜像并启动）
docker compose -f docker-compose.prod.yml up -d

# 3. 查看状态 / 日志
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f api
```

访问：`http://<服务器>:8080`（用 `WEB_PORT` 调整）；API 文档 `http://<服务器>:8080/docs`。

## 三、发布更新

GHCR 镜像更新后，服务器一步更新：

```bash
docker compose -f docker-compose.prod.yml pull   # 拉取最新镜像
docker compose -f docker-compose.prod.yml up -d  # 重建容器
```

## 四、常用运维

```bash
docker compose -f docker-compose.prod.yml ps                # 状态
docker compose -f docker-compose.prod.yml restart api       # 滚动重启 api（自动跑迁移）
docker compose -f docker-compose.prod.yml down              # 停止（保留数据卷）
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U evergrow evergrow > backup.sql                  # 备份
```

## 五、镜像地址覆盖

默认镜像指向 `ghcr.io/aaronlou/...`。如需切换（如 Docker Hub），在服务器 `.env` 覆盖：

```bash
API_IMAGE=registry.example.com/you/api:latest
WEB_IMAGE=registry.example.com/you/web:latest
docker compose -f docker-compose.prod.yml up -d
```

CI 侧同样可用 `REGISTRY`/`IMAGE_OWNER` 环境变量覆盖（见工作流开头），并相应调整登录步骤。

## 六、前置约定

- 环境变量 `DATABASE_URL` 已在 compose 内拼好（指向 `postgres`），api 容器启动时自动执行 `migrations/`。
- 未配置 `DATABASE_URL` 时 API 回落内存仓储（生产请务必配置）。
- 生产 HTTPS：web 容器只监听 80，建议前级用 Caddy/Nginx 终止 TLS（见 README）。
