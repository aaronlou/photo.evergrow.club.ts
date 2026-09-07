import { Schema } from "effect"

import { ActivityId } from "./activity.js"

/** 领域事件：活动创建 */
export const ActivityCreatedEvent = Schema.Struct({
  _tag: Schema.Literal("ActivityCreated"),
  activityId: ActivityId,
  name: Schema.String,
  occurredAt: Schema.DateFromSelf,
})
export type ActivityCreatedEvent = Schema.Schema.Type<typeof ActivityCreatedEvent>

/** 领域事件：用户报名成功 */
export const ActivityEnrolledEvent = Schema.Struct({
  _tag: Schema.Literal("ActivityEnrolled"),
  activityId: ActivityId,
  participantCount: Schema.Int,
  occurredAt: Schema.DateFromSelf,
})
export type ActivityEnrolledEvent = Schema.Schema.Type<typeof ActivityEnrolledEvent>
