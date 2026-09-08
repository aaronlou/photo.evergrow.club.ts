-- shared/llm：模型配置支持自定义接入点（官方 baseUrl 可能变更，运营可自助修改）
ALTER TABLE llm_models ADD COLUMN IF NOT EXISTS base_url TEXT NOT NULL DEFAULT '';
