-- groupbuy：胶卷商品表（管理端可编辑：文案信息 + 封面图）
CREATE TABLE IF NOT EXISTS groupbuy_films (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  brand TEXT NOT NULL,
  format TEXT NOT NULL,
  iso INTEGER NOT NULL,
  process TEXT NOT NULL,
  cover_image_url TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  features JSONB NOT NULL DEFAULT '[]',
  scenarios JSONB NOT NULL DEFAULT '[]',
  sample_images JSONB NOT NULL DEFAULT '[]',
  base_price_in_cents INTEGER NOT NULL,
  threshold INTEGER NOT NULL,
  group_buy_price_in_cents INTEGER NOT NULL
);
