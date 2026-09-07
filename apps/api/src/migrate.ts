import { Config, Effect, Option } from "effect"
import { SqlClient } from "@effect/sql"
import * as Migrator from "@effect/sql/Migrator"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { DbLive } from "./shared/db.js"

/**
 * 数据库迁移入口（生产容器启动前执行：node dist/migrate.js）。
 * 未配置 DATABASE_URL 时直接跳过（内存仓储开发模式）。
 */
const migrationsDir = join(process.cwd(), "migrations")

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
  const applied = yield* Effect.provide(runMigrations, DbLive)
  yield* Effect.logInfo(`数据库迁移完成，共 ${applied.length} 个迁移文件`)
})

Effect.runPromise(program).then(
  () => process.exit(0),
  (error) => {
    console.error("数据库迁移失败：", error)
    process.exit(1)
  },
)
