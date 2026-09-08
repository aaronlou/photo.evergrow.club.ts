-- shared/llm：可运营的模型配置（不含密钥；密钥与接入点来自环境变量）
CREATE TABLE IF NOT EXISTS llm_models (
  id          TEXT PRIMARY KEY,
  provider    TEXT NOT NULL,
  model       TEXT NOT NULL,
  label       TEXT NOT NULL DEFAULT '',
  temperature REAL NOT NULL DEFAULT 0.3,
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- 至多一个默认：用唯一部分索引在数据库层兜住"全局唯一默认"这条不变量
CREATE UNIQUE INDEX IF NOT EXISTS idx_llm_models_single_default ON llm_models (is_default) WHERE is_default;
