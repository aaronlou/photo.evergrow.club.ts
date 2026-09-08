import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "@effect/platform"

import { ApiError } from "../../../interface/apiError.js"
import {
  InvalidPassword,
  InvalidPhoneNumber,
  InvalidCredentials,
  PhoneAlreadyRegistered,
  SessionInvalid,
  UserNotFound,
} from "../domain/errors.js"
import type { User } from "../domain/user.js"

/** 用户 DTO：对外暴露的契约，与领域聚合解耦（与 packages/contracts 保持同步） */
export const UserDto = Schema.Struct({
  id: Schema.String,
  phone: Schema.String,
  nickname: Schema.String,
  avatarUrl: Schema.String,
  status: Schema.String,
})
export type UserDto = Schema.Schema.Type<typeof UserDto>

export const toUserDto = (user: User): UserDto => ({
  id: user.id,
  phone: user.phone,
  nickname: user.nickname,
  avatarUrl: user.avatarUrl,
  status: user.status,
})

/** 登录成功响应：不透明令牌 + 用户信息 */
export const LoginSuccessDto = Schema.Struct({
  token: Schema.String,
  user: UserDto,
})
export type LoginSuccessDto = Schema.Schema.Type<typeof LoginSuccessDto>

/** identity 上下文 HTTP API（自动生成 OpenAPI） */
export const IdentityApi = HttpApiGroup.make("identity")
  .add(
    HttpApiEndpoint.get("getUser", "/users/:id")
      .setPath(Schema.Struct({ id: Schema.String }))
      .addSuccess(Schema.Struct({ data: UserDto }))
      .addError(ApiError)
      .addError(UserNotFound),
  )
  .add(
    HttpApiEndpoint.post("register", "/users")
      .setPayload(Schema.Struct({ phone: Schema.String, nickname: Schema.String, password: Schema.String }))
      .addSuccess(Schema.Struct({ data: UserDto }))
      .addError(ApiError)
      .addError(PhoneAlreadyRegistered)
      .addError(InvalidPhoneNumber)
      .addError(InvalidPassword),
  )
  .add(
    // 登录：凭证换令牌
    HttpApiEndpoint.post("login", "/sessions")
      .setPayload(Schema.Struct({ phone: Schema.String, password: Schema.String }))
      .addSuccess(Schema.Struct({ data: LoginSuccessDto }))
      .addError(ApiError)
      .addError(InvalidCredentials),
  )
  .add(
    // 登出：吊销当前令牌（幂等）。Authorization 头在 handler 中从原始请求读取
    HttpApiEndpoint.del("logout", "/sessions")
      .addSuccess(Schema.Struct({ data: Schema.Struct({ loggedOut: Schema.Boolean }) }))
      .addError(ApiError),
  )
  .add(
    // 当前用户：令牌 → 身份。Authorization 头在 handler 中从原始请求读取
    HttpApiEndpoint.get("me", "/me")
      .addSuccess(Schema.Struct({ data: UserDto }))
      .addError(ApiError)
      .addError(SessionInvalid),
  )
