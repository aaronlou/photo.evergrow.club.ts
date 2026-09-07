import { Effect, Layer, Option } from "effect"
import { SqlClient } from "@effect/sql"

import { PersistenceError } from "../../../shared/errors.js"
import type { Activity } from "../domain/activity.js"
import { Activity as ActivityValue, makeActivityId } from "../domain/activity.js"
import { ActivityRepository } from "../domain/repository.js"
import { seedActivities } from "./activityRepositoryInMemory.js"

/** 把底层 SQL 错误映射为领域层的 PersistenceError，不向领域泄漏具体错误类型 */
const query = <A, E>(self: Effect.Effect<A, E>): Effect.Effect<A, PersistenceError> =>
  self.pipe(
    Effect.mapError((e) =>
      new PersistenceError({ message: e instanceof Error ? e.message : String(e) }),
    ),
  )

/**
 * ActivityRepository SQL 实现（Effect SQL + PostgreSQL）。
 * 表结构见 migrations/0002_activity.sql；使用时在组合根提供 DbLive + 本 Layer，
 * 或由 ActivityPersistence 依据 DATABASE_URL 自动切换。
 */
export const ActivityRepositorySql = Layer.effect(
  ActivityRepository,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const toActivity = (row: {
      id: string
      name: string
      description: string
      location: string
      cover_image_url: string
      start_at: Date
      end_at: Date
      signup_start_at: Date
      signup_end_at: Date
      capacity: number
      created_by: string
      participant_ids: string[] | null
      created_at: Date
    }): ActivityValue =>
      new ActivityValue({
        id: makeActivityId(row.id),
        name: row.name,
        description: row.description,
        location: row.location,
        coverImageUrl: row.cover_image_url ?? "",
        startAt: row.start_at,
        endAt: row.end_at,
        signupStartAt: row.signup_start_at,
        signupEndAt: row.signup_end_at,
        capacity: row.capacity,
        createdBy: row.created_by ?? "",
        participantIds: row.participant_ids ?? [],
        createdAt: row.created_at,
      })

    const repo = ActivityRepository.make({
      findAll: (): Effect.Effect<ReadonlyArray<Activity>, PersistenceError> =>
        query(
          sql`SELECT id, name, description, location, cover_image_url, start_at, end_at, signup_start_at, signup_end_at, capacity, created_by, participant_ids, created_at FROM activities`,
        ).pipe(
          Effect.map((rows) =>
            (rows as unknown as ReadonlyArray<Parameters<typeof toActivity>[0]>).map(toActivity),
          ),
        ),

      findById: (id): Effect.Effect<Option.Option<Activity>, PersistenceError> =>
        query(
          sql`SELECT id, name, description, location, cover_image_url, start_at, end_at, signup_start_at, signup_end_at, capacity, created_by, participant_ids, created_at FROM activities WHERE id = ${id}`,
        ).pipe(
          Effect.map((rows) => {
            const row = (rows as unknown as ReadonlyArray<Parameters<typeof toActivity>[0]>)[0]
            return row ? Option.some(toActivity(row)) : Option.none()
          }),
        ),

      save: (activity): Effect.Effect<void, PersistenceError> =>
        query(
          sql`INSERT INTO activities (id, name, description, location, cover_image_url, start_at, end_at, signup_start_at, signup_end_at, capacity, created_by, participant_ids, created_at)
              VALUES (${activity.id}, ${activity.name}, ${activity.description}, ${activity.location}, ${activity.coverImageUrl}, ${activity.startAt}, ${activity.endAt}, ${activity.signupStartAt}, ${activity.signupEndAt}, ${activity.capacity}, ${activity.createdBy}, ${activity.participantIds}, ${activity.createdAt})
              ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                description = EXCLUDED.description,
                location = EXCLUDED.location,
                cover_image_url = EXCLUDED.cover_image_url,
                start_at = EXCLUDED.start_at,
                end_at = EXCLUDED.end_at,
                signup_start_at = EXCLUDED.signup_start_at,
                signup_end_at = EXCLUDED.signup_end_at,
                capacity = EXCLUDED.capacity,
                created_by = EXCLUDED.created_by,
                participant_ids = EXCLUDED.participant_ids,
                created_at = EXCLUDED.created_at`,
        ).pipe(Effect.asVoid),
    })

    // 首次启动（空表）：写入内存仓储同款种子活动（报名中 / 已满员 / 已结束）。
    // 失败只告警不中断启动（与 groupbuy film 种子策略一致）。
    yield* query(sql`SELECT COUNT(*)::int AS count FROM activities`).pipe(
      Effect.map((rows) => (rows as unknown as ReadonlyArray<{ count: number }>)[0]?.count ?? 0),
      Effect.flatMap((count) =>
        count === 0
          ? Effect.forEach(seedActivities(), (a) => repo.save(a), { discard: true })
          : Effect.void,
      ),
      Effect.tapError((e) =>
        Effect.logWarning(`activities 表种子数据初始化失败（请检查迁移是否执行）: ${e.message}`),
      ),
      Effect.ignore,
    )

    return repo
  }),
)
