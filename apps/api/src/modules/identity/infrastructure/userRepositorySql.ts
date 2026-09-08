import { Effect, Layer, Option } from "effect"
import { SqlClient } from "@effect/sql"

import { PersistenceError } from "../../../shared/errors.js"
import type { PhoneNumber} from "../../../shared/types.js";
import { makePhoneNumber } from "../../../shared/types.js"
import { UserNotFound } from "../domain/errors.js"
import { UserRepository } from "../domain/repository.js"
import type { UserId, UserStatus} from "../domain/user.js";
import { User, makeUserId } from "../domain/user.js"

/** 把底层 SQL 错误映射为领域层的 PersistenceError，不向领域泄漏具体错误类型 */
const query = <A, E>(self: Effect.Effect<A, E>): Effect.Effect<A, PersistenceError> =>
  self.pipe(
    Effect.mapError((e) =>
      new PersistenceError({ message: e instanceof Error ? e.message : String(e) }),
    ),
  )

/**
 * UserRepository SQL 实现（Effect SQL + PostgreSQL）。
 * 表结构见 migrations/0001_init.sql；使用时在组合根提供 DbLive + 本 Layer。
 */
export const UserRepositorySql = Layer.effect(
  UserRepository,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const toUser = (row: {
      id: string
      phone: string
      nickname: string
      avatar_url: string
      password_hash: string | null
      status: string
      created_at: Date
    }): User =>
      new User({
        id: makeUserId(row.id),
        phone: makePhoneNumber(row.phone),
        nickname: row.nickname,
        avatarUrl: row.avatar_url ?? "",
        passwordHash: row.password_hash ?? "",
        status: row.status as UserStatus,
        createdAt: row.created_at,
      })

    return UserRepository.make({
      findById: (id: UserId): Effect.Effect<User, UserNotFound | PersistenceError> =>
        Effect.gen(function* () {
          const rows = yield* query(
            sql`SELECT id, phone, nickname, avatar_url, password_hash, status, created_at FROM users WHERE id = ${id}`,
          )
          const row = rows[0]
          if (!row) {
            return yield* Effect.fail(new UserNotFound({ userId: id }))
          }
          return toUser(row as unknown as Parameters<typeof toUser>[0])
        }),

      findByPhone: (phone: PhoneNumber): Effect.Effect<Option.Option<User>, PersistenceError> =>
        Effect.gen(function* () {
          const rows = yield* query(
            sql`SELECT id, phone, nickname, avatar_url, password_hash, status, created_at FROM users WHERE phone = ${phone}`,
          )
          const row = rows[0]
          if (!row) {
            return Option.none()
          }
          return Option.some(toUser(row as unknown as Parameters<typeof toUser>[0]))
        }),

      findAll: (): Effect.Effect<ReadonlyArray<User>, PersistenceError> =>
        query(
          sql`SELECT id, phone, nickname, avatar_url, password_hash, status, created_at FROM users ORDER BY created_at DESC`,
        ).pipe(
          Effect.map((rows) =>
            (rows as unknown as ReadonlyArray<Parameters<typeof toUser>[0]>).map(toUser),
          ),
        ),

      save: (user: User): Effect.Effect<void, PersistenceError> =>
        query(
          sql`INSERT INTO users (id, phone, nickname, avatar_url, password_hash, status, created_at) VALUES (${user.id}, ${user.phone}, ${user.nickname}, ${user.avatarUrl}, ${user.passwordHash}, ${user.status}, ${user.createdAt})
              ON CONFLICT (id) DO UPDATE SET
                phone = EXCLUDED.phone,
                nickname = EXCLUDED.nickname,
                avatar_url = EXCLUDED.avatar_url,
                password_hash = EXCLUDED.password_hash,
                status = EXCLUDED.status`,
        ).pipe(Effect.asVoid),
    })
  }),
)
