# ===== 生产镜像：Effect API 服务 =====
# 多阶段构建：完整 workspace 安装 → 编译 → pnpm deploy 裁剪生产依赖

FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install -g pnpm@11.25.0
WORKDIR /repo

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @evergrow/api build

# 基于 build 阶段继续：用 pnpm deploy 生成只含生产依赖的独立目录
FROM build AS prod-deps
RUN pnpm --filter @evergrow/api deploy --prod --legacy /app

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app /app
EXPOSE 3000
# 先跑数据库迁移（未配置 DATABASE_URL 时自动跳过），再启动服务
CMD ["sh", "-c", "node dist/migrate.js && node dist/main.js"]
