import { Schema } from "effect"

import { FilmId } from "./film.js"
import { HubId } from "./hub.js"

/** 领域事件：成团（后续接事件总线驱动订单/通知等） */
export const GroupBuySucceededEvent = Schema.Struct({
  _tag: Schema.Literal("GroupBuySucceeded"),
  hubId: HubId,
  filmId: FilmId,
  memberCount: Schema.Int,
  occurredAt: Schema.DateFromSelf,
})
export type GroupBuySucceededEvent = Schema.Schema.Type<typeof GroupBuySucceededEvent>
