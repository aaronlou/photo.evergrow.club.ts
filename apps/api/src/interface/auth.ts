import type { HttpServerRequest } from "@effect/platform";
import { Headers } from "@effect/platform"
import { Effect, Option } from "effect"

import type { UserService } from "../modules/identity/application/userService.js"

/** 从请求头解析 Bearer 令牌（"Bearer <token>" → Option<token>），格式不符返回 None */
export const bearerTokenOf = (
  request: HttpServerRequest.HttpServerRequest,
): Option.Option<string> => {
  const header = Option.getOrElse(Headers.get(request.headers, "authorization"), () => "")
  return header.startsWith("Bearer ") ? Option.some(header.slice("Bearer ".length)) : Option.none()
}

/** 匿名身份回退：客户端自报的 x-user-id（localStorage 稳定匿名 ID），无则 "anonymous" */
const anonymousId = (request: HttpServerRequest.HttpServerRequest): string =>
  Option.getOrElse(Headers.get(request.headers, "x-user-id"), () => "anonymous")

/**
 * 尽力而为身份解析（渐进迁移策略）：
 * - 带 Bearer token → 服务端查会话验证，返回真实 userId（不可伪造）
 * - 无 token / token 失效 → 匿名回退，浏览与匿名参团等既有体验不受影响
 *
 * 错误通道为 never：身份解析本身永不失败。
 * "必须登录"的强身份用例（如我的参团记录）后续提供 requireUserId 变体，
 * 失败时抛 SessionInvalid → 401。
 */
export const currentUserId = (
  request: HttpServerRequest.HttpServerRequest,
  users: UserService,
): Effect.Effect<string, never> =>
  Option.match(bearerTokenOf(request), {
    onNone: () => Effect.succeed(anonymousId(request)),
    onSome: (token) =>
      users.currentUser(token).pipe(
        Effect.map((user) => user.id),
        // 无效/过期/被吊销的 token 一律静默降级为匿名（客户端应清除 token 重新登录）
        Effect.catchAll(() => Effect.succeed(anonymousId(request))),
      ),
  })
