import { HttpApiSchema } from "@effect/platform"
import { Schema } from "effect"

import { PhoneNumber } from "../../../shared/types.js"
import { UserId } from "./user.js"

export class UserNotFound extends Schema.TaggedError<UserNotFound>("UserNotFound")(
  "UserNotFound",
  { userId: UserId },
  HttpApiSchema.annotations({ status: 404 }),
) {}

export class PhoneAlreadyRegistered extends Schema.TaggedError<PhoneAlreadyRegistered>(
  "PhoneAlreadyRegistered",
)("PhoneAlreadyRegistered", { phone: PhoneNumber }, HttpApiSchema.annotations({ status: 409 })) {}

export class InvalidPhoneNumber extends Schema.TaggedError<InvalidPhoneNumber>(
  "InvalidPhoneNumber",
)("InvalidPhoneNumber", { phone: Schema.String }, HttpApiSchema.annotations({ status: 400 })) {}

/** 密码强度不足（注册/重置时，400） */
export class InvalidPassword extends Schema.TaggedError<InvalidPassword>("InvalidPassword")(
  "InvalidPassword",
  { reason: Schema.String },
  HttpApiSchema.annotations({ status: 400 }),
) {}

/** 手机号或密码错误（登录失败统一报此错，不区分"用户不存在/密码错"，防账号枚举探测） */
export class InvalidCredentials extends Schema.TaggedError<InvalidCredentials>(
  "InvalidCredentials",
)("InvalidCredentials", {}, HttpApiSchema.annotations({ status: 401 })) {}

/** 令牌无效或会话已过期（鉴权失败统一报此错） */
export class SessionInvalid extends Schema.TaggedError<SessionInvalid>("SessionInvalid")(
  "SessionInvalid",
  {},
  HttpApiSchema.annotations({ status: 401 }),
) {}
