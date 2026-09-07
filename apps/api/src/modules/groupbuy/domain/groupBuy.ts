import { Schema } from "effect"

import { FilmId } from "./film.js"
import { HubId } from "./hub.js"

export const GroupBuyStatus = Schema.Literal("Open", "Succeeded")
export type GroupBuyStatus = Schema.Schema.Type<typeof GroupBuyStatus>

/** 服务模式：货到付款 */
export const DeliveryMode = Schema.Literal("COD")
export type DeliveryMode = Schema.Schema.Type<typeof DeliveryMode>

/**
 * 参团记录：userId × 指定数量，并携带订单摘要。
 * 服务模式为货到付款（COD），下单需支付总金额的 10% 作为订金。
 */
export const GroupBuyParticipant = Schema.Struct({
  userId: Schema.String,
  quantity: Schema.Int,
  /** 成交单价快照（成团价，单位：分） */
  unitPriceInCents: Schema.Int,
  /** 数量 × 单价 = 商品总金额 */
  totalInCents: Schema.Int,
  /** 订金 = 总金额 × 10%（向下取整） */
  depositInCents: Schema.Int,
  /** 是否已支付订金 */
  depositPaid: Schema.Boolean,
  deliveryMode: DeliveryMode,
})
export type GroupBuyParticipant = Schema.Schema.Type<typeof GroupBuyParticipant>

/**
 * GroupBuy 聚合：某个位置点 × 某款胶卷 的拼团。
 * 参与者列表即"团购心愿单"——加入心愿单 = 参团，并可指定数量。
 * 成团按总件数判定：Σ参与者数量 >= threshold 即成团。
 */
export class GroupBuy extends Schema.Class<GroupBuy>("GroupBuy")({
  hubId: HubId,
  filmId: FilmId,
  participants: Schema.Array(GroupBuyParticipant),
  status: GroupBuyStatus,
}) {
  static open(input: { hubId: HubId; filmId: FilmId }): GroupBuy {
    return new GroupBuy({
      hubId: input.hubId,
      filmId: input.filmId,
      participants: [],
      status: "Open",
    })
  }

  /** 参与人数 */
  participantCount(): number {
    return this.participants.length
  }

  /** 累计件数（成团判定依据） */
  totalQuantity(): number {
    return this.participants.reduce((sum, p) => sum + p.quantity, 0)
  }

  hasJoined(userId: string): boolean {
    return this.participants.some((p) => p.userId === userId)
  }

  quantityOf(userId: string): number {
    return this.participants.find((p) => p.userId === userId)?.quantity ?? 0
  }

  participantOf(userId: string): GroupBuyParticipant | undefined {
    return this.participants.find((p) => p.userId === userId)
  }

  /**
   * 参团（领域规则）：按指定数量加入，生成订单摘要（总价 + 订金 + 货到付款）。
   * 累计件数达到 threshold 即成团。去重由用例层校验后调用。
   */
  join(userId: string, quantity: number, unitPriceInCents: number, threshold: number): GroupBuy {
    const totalInCents = unitPriceInCents * quantity
    const participant: GroupBuyParticipant = {
      userId,
      quantity,
      unitPriceInCents,
      totalInCents,
      depositInCents: Math.floor(totalInCents * 0.1),
      depositPaid: false,
      deliveryMode: "COD",
    }
    const participants = [...this.participants, participant]
    const totalQuantity = participants.reduce((sum, p) => sum + p.quantity, 0)
    return new GroupBuy({
      ...this,
      participants,
      status: totalQuantity >= threshold ? "Succeeded" : "Open",
    })
  }

  /** 标记某参与者已支付订金（幂等） */
  markDepositPaid(userId: string): GroupBuy {
    return new GroupBuy({
      ...this,
      participants: this.participants.map((p) =>
        p.userId === userId ? { ...p, depositPaid: true } : p,
      ),
    })
  }
}
