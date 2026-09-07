import { Schema } from "effect"

import { PhoneNumber } from "../../../shared/types.js"

/** 用户 ID（品牌类型） */
export const UserId = Schema.String.pipe(Schema.brand("UserId"))
export type UserId = Schema.Schema.Type<typeof UserId>

export const makeUserId = (raw: string): UserId => Schema.decodeSync(UserId)(raw)

export const UserStatus = Schema.Literal("Active", "Disabled")
export type UserStatus = Schema.Schema.Type<typeof UserStatus>

/**
 * User 聚合根。
 * 领域层不依赖任何框架/数据库：建模、不变量与状态变更都在这里。
 */
export class User extends Schema.Class<User>("User")({
  id: UserId,
  phone: PhoneNumber,
  nickname: Schema.String,
  avatarUrl: Schema.String,
  status: UserStatus,
  createdAt: Schema.DateFromSelf,
}) {
  static create(input: {
    id: UserId
    phone: PhoneNumber
    nickname: string
    createdAt: Date
  }): User {
    return new User({
      id: input.id,
      phone: input.phone,
      nickname: input.nickname,
      avatarUrl: "",
      status: "Active",
      createdAt: input.createdAt,
    })
  }

  rename(nickname: string): User {
    return new User({ ...this, nickname })
  }
}
