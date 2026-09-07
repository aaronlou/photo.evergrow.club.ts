import { Effect, Layer, Option, Ref } from "effect"

import type { PhoneNumber } from "../../../shared/types.js"
import { UserNotFound } from "../domain/errors.js"
import { UserRepository } from "../domain/repository.js"
import type { User, UserId } from "../domain/user.js"

/**
 * UserRepository 内存实现：骨架阶段默认使用，无需任何基础设施即可启动。
 * 每个进程独立内存，仅用于本地开发与演示端口/适配器模式。
 */
export const UserRepositoryInMemory = Layer.effect(
  UserRepository,
  Effect.gen(function* () {
    const store = yield* Ref.make(new Map<string, User>())

    return UserRepository.make({
      findById: (id: UserId): Effect.Effect<User, UserNotFound> =>
        Ref.get(store).pipe(
          Effect.map((users) => Option.fromNullable(users.get(id))),
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.fail(new UserNotFound({ userId: id })),
              onSome: (user) => Effect.succeed(user),
            }),
          ),
        ),

      findByPhone: (phone: PhoneNumber): Effect.Effect<Option.Option<User>> =>
        Ref.get(store).pipe(
          Effect.map((users) =>
            Option.fromNullable([...users.values()].find((u) => u.phone === phone)),
          ),
        ),

      save: (user: User): Effect.Effect<void> =>
        Ref.update(store, (users) => users.set(user.id, user)),
    })
  }),
)
