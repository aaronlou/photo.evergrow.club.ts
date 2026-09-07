-- identity 上下文：用户表
-- 迁移执行方式见 apps/api/README（骨架阶段可先跳过，默认使用内存仓储）
CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,
  phone      TEXT NOT NULL UNIQUE,
  nickname   TEXT NOT NULL,
  avatar_url TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'Active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
