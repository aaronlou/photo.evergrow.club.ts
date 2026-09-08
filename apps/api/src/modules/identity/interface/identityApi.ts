import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "@effect/platform"

import { ApiError } from "../../../interface/apiError.js"
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

/** identity 上下文 HTTP API（自动生成 OpenAPI） */
export const IdentityApi = HttpApiGroup.make("identity")
  .add(
    HttpApiEndpoint.get("getUser", "/users/:id")
      .setPath(Schema.Struct({ id: Schema.String }))
      .addSuccess(Schema.Struct({ data: UserDto }))
      .addError(ApiError),
  )
  .add(
    HttpApiEndpoint.post("register", "/users")
      .setPayload(Schema.Struct({ phone: Schema.String, nickname: Schema.String, password: Schema.String }))
      .addSuccess(Schema.Struct({ data: UserDto }))
      .addError(ApiError),
  )
