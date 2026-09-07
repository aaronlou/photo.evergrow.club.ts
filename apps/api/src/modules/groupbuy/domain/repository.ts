import { Effect, Option } from "effect"

import type { PersistenceError } from "../../../shared/errors.js"
import type { Film, FilmId } from "./film.js"
import type { GroupBuy } from "./groupBuy.js"
import type { Hub, HubId } from "./hub.js"

/**
 * groupbuy 上下文仓储端口。
 * 领域层只定义接口；实现见 infrastructure（内存版，SQL 版后续接入）。
 */
export class HubRepository extends Effect.Service<HubRepository>()("HubRepository", {
  effect: Effect.gen(function* () {
    return {
      findAll: (): Effect.Effect<ReadonlyArray<Hub>, PersistenceError> => Effect.succeed([]),
      findById: (_id: HubId): Effect.Effect<Option.Option<Hub>, PersistenceError> =>
        Effect.succeed(Option.none()),
      save: (_hub: Hub): Effect.Effect<void, PersistenceError> => Effect.void,
    }
  }),
}) {}

export class FilmRepository extends Effect.Service<FilmRepository>()("FilmRepository", {
  effect: Effect.gen(function* () {
    return {
      findAll: (): Effect.Effect<ReadonlyArray<Film>, PersistenceError> => Effect.succeed([]),
      findById: (_id: FilmId): Effect.Effect<Option.Option<Film>, PersistenceError> =>
        Effect.succeed(Option.none()),
      save: (_film: Film): Effect.Effect<void, PersistenceError> => Effect.void,
    }
  }),
}) {}

export class GroupBuyRepository extends Effect.Service<GroupBuyRepository>()(
  "GroupBuyRepository",
  {
    effect: Effect.gen(function* () {
      return {
        findByHubAndFilm: (
          _hubId: HubId,
          _filmId: FilmId,
        ): Effect.Effect<Option.Option<GroupBuy>, PersistenceError> =>
          Effect.succeed(Option.none()),
        save: (_group: GroupBuy): Effect.Effect<void, PersistenceError> => Effect.void,
      }
    }),
  },
) {}
