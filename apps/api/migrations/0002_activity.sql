-- activity 上下文：活动表（活动 + 报名参与者 ID 数组）
-- 参与人数强一致热点：名额上限在聚合内校验，数据库以整行 upsert 兜底
CREATE TABLE IF NOT EXISTS activities (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  location        TEXT NOT NULL DEFAULT '',
  cover_image_url TEXT NOT NULL DEFAULT '',
  start_at        TIMESTAMPTZ NOT NULL,
  end_at          TIMESTAMPTZ NOT NULL,
  signup_start_at TIMESTAMPTZ NOT NULL,
  signup_end_at   TIMESTAMPTZ NOT NULL,
  capacity        INT NOT NULL,
  created_by      TEXT NOT NULL DEFAULT '',
  participant_ids TEXT[] NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
