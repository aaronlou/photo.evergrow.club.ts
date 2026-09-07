import { Schema } from "effect"

/** 活动 ID（品牌类型） */
export const ActivityId = Schema.String.pipe(Schema.brand("ActivityId"))
export type ActivityId = Schema.Schema.Type<typeof ActivityId>

export const makeActivityId = (raw: string): ActivityId => Schema.decodeSync(ActivityId)(raw)

/**
 * 活动状态（按当前时间 + 报名名额推导，纯函数计算，不落库）：
 * - NotStarted：报名未开始（now < signupStartAt）
 * - Open：报名进行中（未满员且在报名窗口内）
 * - Full：已满员（participantCount >= capacity）
 * - Closed：报名截止（now >= signupEndAt）
 * - Ended：活动已结束（now >= endAt）
 */
export const ActivityStatus = Schema.Literal("NotStarted", "Open", "Full", "Closed", "Ended")
export type ActivityStatus = Schema.Schema.Type<typeof ActivityStatus>

/**
 * Activity 聚合根：一场活动（线下/线上活动，含报名名额与报名时间窗口）。
 * 领域层只建模、维护不变量，不依赖框架/数据库。
 */
export class Activity extends Schema.Class<Activity>("Activity")({
  id: ActivityId,
  name: Schema.String,
  description: Schema.String,
  location: Schema.String,
  coverImageUrl: Schema.String,
  startAt: Schema.DateFromSelf,
  endAt: Schema.DateFromSelf,
  signupStartAt: Schema.DateFromSelf,
  signupEndAt: Schema.DateFromSelf,
  /** 名额上限（>=1） */
  capacity: Schema.Int,
  /** 创建者（当前会话用户 ID，后续接入 role 权限） */
  createdBy: Schema.String,
  /** 已报名用户 ID 列表（同一用户只能报一次） */
  participantIds: Schema.Array(Schema.String),
  createdAt: Schema.DateFromSelf,
}) {
  static create(input: {
    id: ActivityId
    name: string
    description: string
    location: string
    coverImageUrl: string
    startAt: Date
    endAt: Date
    signupStartAt: Date
    signupEndAt: Date
    capacity: number
    createdBy: string
    createdAt: Date
  }): Activity {
    return new Activity({
      id: input.id,
      name: input.name,
      description: input.description,
      location: input.location,
      coverImageUrl: input.coverImageUrl,
      startAt: input.startAt,
      endAt: input.endAt,
      signupStartAt: input.signupStartAt,
      signupEndAt: input.signupEndAt,
      capacity: input.capacity,
      createdBy: input.createdBy,
      participantIds: [],
      createdAt: input.createdAt,
    })
  }

  participantCount(): number {
    return this.participantIds.length
  }

  hasEnrolled(userId: string): boolean {
    return this.participantIds.includes(userId)
  }

  isFull(): boolean {
    return this.participantCount() >= this.capacity
  }

  /** 领域规则：重复报名去重由用例层校验后调用，这里只做纯状态追加 */
  enroll(userId: string): Activity {
    return new Activity({ ...this, participantIds: [...this.participantIds, userId] })
  }

  /** 领域规则：取消报名（从参与者列表移除，纯函数）；是否允许由用例层按时间校验 */
  cancelEnrollment(userId: string): Activity {
    return new Activity({
      ...this,
      participantIds: this.participantIds.filter((id) => id !== userId),
    })
  }

  /** 按给定时间推导当前状态（纯函数，便于测试） */
  statusAt(now: Date): ActivityStatus {
    if (now.getTime() >= this.endAt.getTime()) return "Ended"
    if (now.getTime() >= this.signupEndAt.getTime()) return "Closed"
    if (this.isFull()) return "Full"
    if (now.getTime() >= this.signupStartAt.getTime()) return "Open"
    return "NotStarted"
  }
}
