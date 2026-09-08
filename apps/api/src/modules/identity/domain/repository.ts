import { Effect, Option } from "effect"

import type { PersistenceError } from "../../../shared/errors.js"
import type { PhoneNumber } from "../../../shared/types.js"
import { UserNotFound } from "./errors.js"
import type { Session } from "./session.js"
import type { User, UserId } from "./user.js"

/**
 * UserRepository 端口（Port）：
 * 领域层只定义接口，实现放在 infrastructure 层（内存版 / SQL 版）。
 * 默认实现为“未装配”的失败桩，组合根负责注入真实实现。
 */
export class UserRepository extends Effect.Service<UserRepository>()("UserRepository", {
  effect: Effect.gen(function* () {
    return {
      findById: (id: UserId): Effect.Effect<User, UserNotFound | PersistenceError> =>
        Effect.fail(new UserNotFound({ userId: id })),

      findByPhone: (_phone: PhoneNumber): Effect.Effect<Option.Option<User>, PersistenceError> =>
        Effect.succeed(Option.none()),

      findAll: (): Effect.Effect<ReadonlyArray<User>, PersistenceError> => Effect.succeed([]),

      save: (_user: User): Effect.Effect<void, PersistenceError> => Effect.void,
    }
  }),
}) {}

/**
 * SessionRepository 端口：会话的存取。
 * delete 语义为幂等（登出时记录不存在也视为成功）。
 */
export class SessionRepository extends Effect.Service<SessionRepository>()("SessionRepository", {
  effect: Effect.gen(function* () {
    return {
      findByToken: (_token: string): Effect.Effect<Option.Option<Session>, PersistenceError> =>
        Effect.succeed(Option.none()),
      save: (_session: Session): Effect.Effect<void, PersistenceError> => Effect.void,
      delete: (_token: string): Effect.Effect<void, PersistenceError> => Effect.void,
    }
  }),
}) {}
