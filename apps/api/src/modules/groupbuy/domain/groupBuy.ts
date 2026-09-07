import { Schema } from "effect"

import { FilmId } from "./film.js"
import { HubId } from "./hub.js"

export const GroupBuyStatus = Schema.Literal("Open", "Succeeded")
export type GroupBuyStatus = Schema.Schema.Type<typeof GroupBuyStatus>

/**
 * GroupBuy 聚合：某个位置点 × 某款胶卷 的拼团。
 * 成员列表即"团购心愿单"——加入心愿单 = 参团。
 */
export class GroupBuy extends Schema.Class<GroupBuy>("GroupBuy")({
  hubId: HubId,
  filmId: FilmId,
  members: Schema.Array(Schema.String),
  status: GroupBuyStatus,
}) {
  static open(input: { hubId: HubId; filmId: FilmId }): GroupBuy {
    return new GroupBuy({
      hubId: input.hubId,
      filmId: input.filmId,
      members: [],
      status: "Open",
    })
  }

  memberCount(): number {
    return this.members.length
  }

  hasJoined(userId: string): boolean {
    return this.members.includes(userId)
  }

  /**
   * 参团（领域规则）：成员加入后，若达到商家谈定的成团人数则成团。
   * 去重由用例层校验后调用。
   */
  join(userId: string, threshold: number): GroupBuy {
    const members = [...this.members, userId]
    return new GroupBuy({
      ...this,
      members,
      status: members.length >= threshold ? "Succeeded" : "Open",
    })
  }
}
