import { Clock, Effect, Option, Schema } from "effect"

import type { PersistenceError } from "../../../shared/errors.js"
import { IdGenerator } from "../../../shared/kernel.js"
import { PhoneNumber } from "../../../shared/types.js"
import type { UserNotFound } from "../domain/errors.js";
import { InvalidPhoneNumber, PhoneAlreadyRegistered } from "../domain/errors.js"
import { UserRepository } from "../domain/repository.js"
import type { UserId} from "../domain/user.js";
import { User, makeUserId } from "../domain/user.js"

/**
 * UserService 用例层：
 * 编排领域对象、控制事务边界，不接触 HTTP 与数据库实现。
 */
export class UserService extends Effect.Service<UserService>()("UserService", {
  effect: Effect.gen(function* () {
    // 依赖在服务构造时捕获：方法签名不泄漏上下文要求，组合根只需提供 Default 的依赖
    const repo = yield* UserRepository
    const idgen = yield* IdGenerator

    return {
      register: (input: {
        phone: string
        nickname: string
      }): Effect.Effect<
        User,
        PhoneAlreadyRegistered | InvalidPhoneNumber | PersistenceError
      > =>
        Effect.gen(function* () {
          const phone = yield* Schema.decodeEither(PhoneNumber)(input.phone).pipe(
            Effect.mapError(() => new InvalidPhoneNumber({ phone: input.phone })),
          )

          const existing = yield* repo.findByPhone(phone)
          if (Option.isSome(existing)) {
            return yield* Effect.fail(new PhoneAlreadyRegistered({ phone }))
          }

          const id = yield* idgen.nextUUID
          const now = yield* Clock.currentTimeMillis
          const user = User.create({
            id: makeUserId(id),
            phone,
            nickname: input.nickname,
            createdAt: new Date(now),
          })

          yield* repo.save(user)
          return user
        }),

      getProfile: (id: UserId): Effect.Effect<User, UserNotFound | PersistenceError> =>
        repo.findById(id),
    }
  }),
}) {}
