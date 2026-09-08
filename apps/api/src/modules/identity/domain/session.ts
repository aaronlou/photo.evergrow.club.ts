import { Schema } from "effect"

import { UserId } from "./user.js"

/**
 * Session 聚合：登录会话（不透明令牌模型）。
 * token 是服务端生成的随机串，本身不携带任何用户信息；
 * 真正的"谁是谁"由本表查询得出——因此登出 = 删一行，封禁立即生效。
 */
export class Session extends Schema.Class<Session>("Session")({
  /** 不透明令牌（UUID v4，128 位随机），同时充当主键 */
  token: Schema.String,
  userId: UserId,
  expiresAt: Schema.DateFromSelf,
  createdAt: Schema.DateFromSelf,
}) {
  static create(input: { token: string; userId: UserId; expiresAt: Date; createdAt: Date }): Session {
    return new Session(input)
  }

  /** 时间驱动的失效判断（行为在聚合上，调用方传"现在"，保持可测试性） */
  isExpired(now: Date): boolean {
    return now >= this.expiresAt
  }
}

/** 会话有效期（30 天；滑动续期可在后续版本实现） */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
