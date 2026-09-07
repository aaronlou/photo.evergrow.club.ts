import { Schema } from "effect"

import { PhoneNumber } from "../../../shared/types.js"
import { UserId } from "./user.js"

/** 领域事件：跨聚合/跨上下文的一致性最终通过事件实现 */
export const UserRegisteredEvent = Schema.Struct({
  _tag: Schema.Literal("UserRegistered"),
  userId: UserId,
  phone: PhoneNumber,
  occurredAt: Schema.DateFromSelf,
})
export type UserRegisteredEvent = Schema.Schema.Type<typeof UserRegisteredEvent>
