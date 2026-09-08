import { Effect, Layer, Option } from "effect"
import { SqlClient } from "@effect/sql"

import { PersistenceError } from "../../../shared/errors.js"
import type { Hub } from "../domain/hub.js"
import { Hub as HubValue, makeHubId } from "../domain/hub.js"
import { HubRepository } from "../domain/repository.js"
import { seedHubs } from "./groupBuyInMemory.js"

/** 把底层 SQL 错误映射为领域层的 PersistenceError，不向领域泄漏具体错误类型 */
const query = <A, E>(self: Effect.Effect<A, E>): Effect.Effect<A, PersistenceError> =>
  self.pipe(
    Effect.mapError((e) =>
      new PersistenceError({ message: e instanceof Error ? e.message : String(e) }),
    ),
  )

/**
 * HubRepository SQL 实现（Effect SQL + PostgreSQL）。
 * 表结构见 migrations/0004_groupbuy_hubs.sql。
 * 首次启动（空表）时写入内存仓储同款种子数据；管理员增删改通过 save/delete 持久化。
 * 注意：列名必须写成 SQL 字面量——sql`` 模板中的 JS 插值会被当作参数占位符。
 */
export const HubRepositorySql = Layer.effect(
  HubRepository,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const toHub = (row: {
      id: string
      name: string
      city: string
      address: string
      joined_user_ids: ReadonlyArray<string> | null
      status: string
      created_at: Date | string
    }): HubValue =>
      new HubValue({
        id: makeHubId(row.id),
        name: row.name,
        city: row.city,
        address: row.address,
        joinedUserIds: row.joined_user_ids ?? [],
        status: row.status === "Closed" ? "Closed" : "Active",
        createdAt: new Date(row.created_at),
      })

    const HUB_SELECT = `SELECT id, name, city, address, joined_user_ids, status, created_at FROM groupbuy_hubs`

    const findAll = query(sql.unsafe(HUB_SELECT)).pipe(
      Effect.map((rows) =>
        (rows as unknown as ReadonlyArray<Parameters<typeof toHub>[0]>).map(toHub),
      ),
    )

    const repo = HubRepository.make({
      findAll: () => findAll,

      findById: (id): Effect.Effect<Option.Option<Hub>, PersistenceError> =>
        query(sql`${sql.literal(HUB_SELECT)} WHERE id = ${id}`).pipe(
          Effect.map((rows) => {
            const row = (rows as unknown as ReadonlyArray<Parameters<typeof toHub>[0]>)[0]
            return row ? Option.some(toHub(row)) : Option.none()
          }),
        ),

      save: (hub): Effect.Effect<void, PersistenceError> =>
        query(
          sql`INSERT INTO groupbuy_hubs (id, name, city, address, joined_user_ids, status, created_at)
              VALUES (${hub.id}, ${hub.name}, ${hub.city}, ${hub.address}, ${JSON.stringify(hub.joinedUserIds)}::jsonb, ${hub.status}, ${hub.createdAt.toISOString()})
              ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                city = EXCLUDED.city,
                address = EXCLUDED.address,
                joined_user_ids = EXCLUDED.joined_user_ids,
                status = EXCLUDED.status,
                created_at = EXCLUDED.created_at`,
        ).pipe(Effect.asVoid),

      delete: (id): Effect.Effect<void, PersistenceError> =>
        query(sql`DELETE FROM groupbuy_hubs WHERE id = ${id}`).pipe(Effect.asVoid),
    })

    // 种子数据：按 ID 补齐尚未入库的位置点（空表则全量写入），已存在的不覆盖
    yield* findAll.pipe(
      Effect.map((existing) => new Set(existing.map((h) => String(h.id)))),
      Effect.flatMap((existingIds) => {
        const missing = seedHubs(new Date()).filter((h) => !existingIds.has(String(h.id)))
        if (missing.length === 0) return Effect.void
        return Effect.forEach(missing, (hub) => repo.save(hub), { discard: true }).pipe(
          Effect.tap(Effect.logInfo(`hub 表补齐种子数据 ${missing.length} 条`)),
        )
      }),
      Effect.tapError((e) =>
        Effect.logWarning(`hub 表种子数据初始化失败（请检查迁移是否执行）: ${e.message}`),
      ),
      Effect.ignore,
    )

    return repo
  }),
)
