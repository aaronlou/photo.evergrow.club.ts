import { Config } from "effect"
import { PgClient } from "@effect/sql-pg"

/**
 * PostgreSQL 接入层（Effect SQL）。
 * 设置 DATABASE_URL 后可用；骨架阶段默认使用内存仓储，
 * 切换方式：在 bootstrap 中用 DbLive + *RepositorySql 替换内存 Layer。
 */
export const DbLive = PgClient.layerConfig({
  url: Config.redacted("DATABASE_URL"),
})
