import { Effect, Layer, Option } from "effect"
import { SqlClient } from "@effect/sql"

import { PersistenceError } from "../../../shared/errors.js"
import { SessionRepository } from "../domain/repository.js"
import type { Session } from "../domain/session.js"
import { Session as SessionValue } from "../domain/session.js"
import { makeUserId } from "../domain/user.js"

/** 把底层 SQL 错误映射为领域层的 PersistenceError，不向领域泄漏具体错误类型 */
const query = <A, E>(self: Effect.Effect<A, E>): Effect.Effect<A, PersistenceError> =>
  self.pipe(
    Effect.mapError((e) =>
      new PersistenceError({ message: e instanceof Error ? e.message : String(e) }),
    ),
  )

/**
 * SessionRepository SQL 实现（Effect SQL + PostgreSQL）。
 * 表结构见 migrations/0006_identity_sessions.sql。
 */
export const SessionRepositorySql = Layer.effect(
  SessionRepository,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const toSession = (row: {
      token: string
      user_id: string
      expires_at: Date
      created_at: Date
    }): SessionValue =>
      SessionValue.create({
        token: row.token,
        userId: makeUserId(row.user_id),
        expiresAt: new Date(row.expires_at),
        createdAt: new Date(row.created_at),
      })

    return SessionRepository.make({
      findByToken: (token: string): Effect.Effect<Option.Option<Session>, PersistenceError> =>
        Effect.gen(function* () {
          const rows = yield* query(
            sql`SELECT token, user_id, expires_at, created_at FROM sessions WHERE token = ${token}`,
          )
          const row = rows[0]
          return row ? Option.some(toSession(row as unknown as Parameters<typeof toSession>[0])) : Option.none()
        }),

      save: (session: Session): Effect.Effect<void, PersistenceError> =>
        query(
          sql`INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (${session.token}, ${session.userId}, ${session.expiresAt.toISOString()}, ${session.createdAt.toISOString()})
              ON CONFLICT (token) DO UPDATE SET
                user_id = EXCLUDED.user_id,
                expires_at = EXCLUDED.expires_at`,
        ).pipe(Effect.asVoid),

      delete: (token: string): Effect.Effect<void, PersistenceError> =>
        query(sql`DELETE FROM sessions WHERE token = ${token}`).pipe(Effect.asVoid),
    })
  }),
)
