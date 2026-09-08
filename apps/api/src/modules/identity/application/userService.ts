import { Clock, Effect, Option, Schema } from "effect"

import type { PersistenceError } from "../../../shared/errors.js"
import { IdGenerator } from "../../../shared/kernel.js"
import { PhoneNumber } from "../../../shared/types.js"
import type {
  UserNotFound} from "../domain/errors.js";
import {
  InvalidCredentials,
  InvalidPassword,
  InvalidPhoneNumber,
  PhoneAlreadyRegistered,
  SessionInvalid
} from "../domain/errors.js"
import { PasswordHasher } from "../domain/password.js"
import { makePasswordHash } from "../domain/password.js"
import { SessionRepository, UserRepository } from "../domain/repository.js"
import { SESSION_TTL_MS, Session } from "../domain/session.js"
import type { UserId} from "../domain/user.js";
import { User, makeUserId } from "../domain/user.js"

/** 密码最小长度（领域规则：宁长勿短，6 位为底线） */
const MIN_PASSWORD_LENGTH = 6

/**
 * UserService 用例层：
 * 编排领域对象、控制事务边界，不接触 HTTP 与数据库实现。
 */
export class UserService extends Effect.Service<UserService>()("UserService", {
  effect: Effect.gen(function* () {
    // 依赖在服务构造时捕获：方法签名不泄漏上下文要求，组合根只需提供 Default 的依赖
    const repo = yield* UserRepository
    const sessions = yield* SessionRepository
    const idgen = yield* IdGenerator
    const hasher = yield* PasswordHasher

    return {
      register: (input: {
        phone: string
        nickname: string
        password: string
      }): Effect.Effect<
        User,
        PhoneAlreadyRegistered | InvalidPhoneNumber | InvalidPassword | PersistenceError
      > =>
        Effect.gen(function* () {
          // 密码强度是业务规则 → 用例层校验（哈希本身由端口完成，用例不关心算法）
          if (input.password.length < MIN_PASSWORD_LENGTH) {
            return yield* Effect.fail(
              new InvalidPassword({ reason: `密码至少 ${MIN_PASSWORD_LENGTH} 位` }),
            )
          }

          const phone = yield* Schema.decodeEither(PhoneNumber)(input.phone).pipe(
            Effect.mapError(() => new InvalidPhoneNumber({ phone: input.phone })),
          )

          const existing = yield* repo.findByPhone(phone)
          if (Option.isSome(existing)) {
            return yield* Effect.fail(new PhoneAlreadyRegistered({ phone }))
          }

          // 明文密码在此哈希后即刻丢弃——它不会再出现在任何返回值/日志/存储中
          const passwordHash = yield* hasher.hash(input.password)

          const id = yield* idgen.nextUUID
          const now = yield* Clock.currentTimeMillis
          const user = User.create({
            id: makeUserId(id),
            phone,
            nickname: input.nickname,
            passwordHash,
            createdAt: new Date(now),
          })

          yield* repo.save(user)
          return user
        }),

      getProfile: (id: UserId): Effect.Effect<User, UserNotFound | PersistenceError> =>
        repo.findById(id),

      /** [管理端] 全量注册用户列表（按注册时间倒序）；密码只暴露"是否已设置"，绝不返回密文 */
      listUsers: (): Effect.Effect<ReadonlyArray<User>, PersistenceError> => repo.findAll(),

      /**
       * 登录：凭证 → 会话令牌。
       * 安全规则：用户不存在 / 密码错误 / 账号被禁用，一律报同一个 InvalidCredentials，
       * 不向调用方泄露任何区分信息（防账号枚举）。
       */
      login: (input: {
        phone: string
        password: string
      }): Effect.Effect<
        { user: User; session: Session },
        InvalidCredentials | PersistenceError
      > =>
        Effect.gen(function* () {
          // 手机号格式不合法 → 同样报 InvalidCredentials（不给"这个号没注册过"的探测信号）
          const phone = yield* Schema.decodeEither(PhoneNumber)(input.phone).pipe(
            Effect.mapError(() => new InvalidCredentials()),
          )

          const userOption = yield* repo.findByPhone(phone)
          const user = Option.getOrUndefined(userOption)
          if (!user || !user.hasPassword()) {
            // 统一错误：不暴露"用户不存在"与"用户未设密码"的差异
            return yield* Effect.fail(new InvalidCredentials())
          }

          // 校验密码（scrypt 校验本身耗时 ~100ms，这也是防爆破的一部分）
          const ok = yield* hasher.verify(input.password, makePasswordHash(user.passwordHash))
          if (!ok || user.status === "Disabled") {
            return yield* Effect.fail(new InvalidCredentials())
          }

          // 签发不透明令牌：UUID v4 有 122 位随机性，无法枚举
          const token = yield* idgen.nextUUID
          const now = new Date(yield* Clock.currentTimeMillis)
          const session = Session.create({
            token,
            userId: user.id,
            expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
            createdAt: now,
          })
          yield* sessions.save(session)

          return { user, session }
        }),

      /** 登出：删除会话（幂等——令牌不存在也视为成功，不泄露会话是否存在） */
      logout: (token: string): Effect.Effect<void, PersistenceError> =>
        sessions.delete(token),

      /** 由令牌解析当前用户（鉴权横切关注点的用例入口） */
      currentUser: (token: string): Effect.Effect<User, SessionInvalid | PersistenceError> =>
        Effect.gen(function* () {
          const sessionOption = yield* sessions.findByToken(token)
          const session = Option.getOrUndefined(sessionOption)
          if (!session) {
            return yield* Effect.fail(new SessionInvalid())
          }
          const now = new Date(yield* Clock.currentTimeMillis)
          if (session.isExpired(now)) {
            // 过期会话顺手清掉（惰性清理，省一个定时任务）
            yield* sessions.delete(token)
            return yield* Effect.fail(new SessionInvalid())
          }
          // 会话有效但用户已被删除 → 同样视为会话无效（而非把仓储错误抛给调用方）
          return yield* repo.findById(session.userId).pipe(
            Effect.catchTag("UserNotFound", () => Effect.fail(new SessionInvalid())),
          )
        }),
    }
  }),
}) {}
