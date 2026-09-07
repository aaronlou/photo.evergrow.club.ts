import { Effect, Option } from "effect"

import type { PersistenceError } from "../../../shared/errors.js"
import type { Activity, ActivityId } from "./activity.js"

/**
 * ActivityRepository 端口（Port）：领域层只定义接口，
 * 实现见 infrastructure（内存版，SQL 版后续接入）。
 * 默认实现为未装配的失败桩，组合根负责注入真实实现。
 */
export class ActivityRepository extends Effect.Service<ActivityRepository>()("ActivityRepository", {
  effect: Effect.gen(function* () {
    return {
      findAll: (): Effect.Effect<ReadonlyArray<Activity>, PersistenceError> => Effect.succeed([]),
      findById: (_id: ActivityId): Effect.Effect<Option.Option<Activity>, PersistenceError> =>
        Effect.succeed(Option.none()),
      save: (_activity: Activity): Effect.Effect<void, PersistenceError> => Effect.void,
    }
  }),
}) {}
