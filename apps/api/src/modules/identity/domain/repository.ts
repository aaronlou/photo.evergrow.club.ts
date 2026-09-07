import { Effect, Option } from "effect"

import type { PersistenceError } from "../../../shared/errors.js"
import type { PhoneNumber } from "../../../shared/types.js"
import { UserNotFound } from "./errors.js"
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

      save: (_user: User): Effect.Effect<void, PersistenceError> => Effect.void,
    }
  }),
}) {}
