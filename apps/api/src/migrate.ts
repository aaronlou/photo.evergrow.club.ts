import { Config, Effect, Option } from "effect"
import { SqlClient } from "@effect/sql"
import * as Migrator from "@effect/sql/Migrator"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { DbLive } from "./shared/db.js"

/**
 * 数据库迁移入口（生产容器启动前执行：node dist/migrate.js）。
 * 未配置 DATABASE_URL 时直接跳过（内存仓储开发模式）。
 */
// 按模块位置解析（不依赖 cwd）：dist/migrate.js → dist/../migrations；src/migrate.ts → src/../migrations
const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations")

/** 按文件名排序读取 migrations/*.sql，包装为 Migrator 加载器 */
const loadMigrations = (): Record<string, Effect.Effect<void, unknown, SqlClient.SqlClient>> => {
  const record: Record<string, Effect.Effect<void, unknown, SqlClient.SqlClient>> = {}
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
    const content = readFileSync(join(migrationsDir, file), "utf8")
    record[file] = Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql.unsafe(content).pipe(Effect.asVoid)
    })
  }
  return record
}

const runMigrations = Migrator.make({})({
  loader: Migrator.fromRecord(loadMigrations()),
  table: "migrations",
})

const program = Effect.gen(function* () {
  const databaseUrl = yield* Config.option(Config.string("DATABASE_URL"))
  if (Option.isNone(databaseUrl)) {
    yield* Effect.logInfo("DATABASE_URL 未配置，跳过数据库迁移（内存仓储模式）")
    return
  }
  if (!existsSync(migrationsDir)) {
    return yield* Effect.fail(new Error(`迁移目录不存在: ${migrationsDir}`))
  }
  const found = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).length
  yield* Effect.logInfo(`发现迁移文件 ${found} 个（目录: ${migrationsDir}）`)
  const applied = yield* Effect.provide(runMigrations, DbLive)
  yield* Effect.logInfo(`数据库迁移完成，本次执行 ${applied.length} 个迁移`)
})

Effect.runPromise(program).then(
  () => process.exit(0),
  (error) => {
    console.error("数据库迁移失败：", error)
    process.exit(1)
  },
)
