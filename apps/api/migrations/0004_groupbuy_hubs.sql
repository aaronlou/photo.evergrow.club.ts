-- groupbuy：位置点表（管理端可增删改）
CREATE TABLE IF NOT EXISTS groupbuy_hubs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  address TEXT NOT NULL,
  joined_user_ids JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'Active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
