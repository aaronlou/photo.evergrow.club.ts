-- identity：users 表增加密码密文列（空串 = 未设置密码，兼容历史数据）
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT NOT NULL DEFAULT '';
