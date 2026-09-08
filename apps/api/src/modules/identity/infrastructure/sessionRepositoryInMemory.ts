import { Effect, Layer, Option, Ref } from "effect"

import { SessionRepository } from "../domain/repository.js"
import type { Session } from "../domain/session.js"

/**
 * SessionRepository 内存实现：本地开发零依赖启动。
 * 进程重启即全部会话失效（用户需重新登录）——内存模型的固有行为，生产用 SQL 版。
 */
export const SessionRepositoryInMemory = Layer.effect(
  SessionRepository,
  Effect.gen(function* () {
    const store = yield* Ref.make(new Map<string, Session>())

    return SessionRepository.make({
      findByToken: (token: string): Effect.Effect<Option.Option<Session>> =>
        Ref.get(store).pipe(Effect.map((sessions) => Option.fromNullable(sessions.get(token)))),

      save: (session: Session): Effect.Effect<void> =>
        Ref.update(store, (sessions) => sessions.set(session.token, session)),

      delete: (token: string): Effect.Effect<void> =>
        Ref.update(store, (sessions) => {
          sessions.delete(token)
          return sessions
        }),
    })
  }),
)
