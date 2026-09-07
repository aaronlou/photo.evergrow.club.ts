import { Schema } from "effect"

/**
 * 跨上下文通用的值对象。
 * 各上下文自己的 ID（UserId / GroupBuyId / OrderId ...）定义在各自的 domain 层。
 */

/** 金额值对象：以“分”为单位的整数，避免浮点误差 */
export const Money = Schema.Struct({
  amountInCents: Schema.Int,
  currency: Schema.Literal("CNY"),
})
export type Money = Schema.Schema.Type<typeof Money>

/** 中国大陆手机号（品牌类型，decode 校验） */
export const PhoneNumber = Schema.String.pipe(
  Schema.pattern(/^1\d{10}$/),
  Schema.brand("PhoneNumber"),
)
export type PhoneNumber = Schema.Schema.Type<typeof PhoneNumber>

export const makePhoneNumber = (raw: string): PhoneNumber => Schema.decodeSync(PhoneNumber)(raw)
