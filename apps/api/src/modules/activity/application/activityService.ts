import { Clock, Effect, Option } from "effect"

import type { PersistenceError } from "../../../shared/errors.js"
import { IdGenerator } from "../../../shared/kernel.js"
import type { ActivityId, ActivityStatus } from "../domain/activity.js"
import { Activity, makeActivityId } from "../domain/activity.js"
import {
  ActivityEnded,
  ActivityFull,
  ActivityNotFound,
  AlreadyEnrolled,
  InvalidActivityInput,
  NotEnrolled,
  SignupClosed,
  SignupNotStarted,
} from "../domain/errors.js"
import { ActivityRepository } from "../domain/repository.js"

/** 创建活动的输入（日期为 ISO 字符串，由用例层解析校验） */
export interface CreateActivityInput {
  readonly name: string
  readonly description: string
  readonly location: string
  readonly coverImageUrl: string
  readonly startAt: string
  readonly endAt: string
  readonly signupStartAt: string
  readonly signupEndAt: string
  readonly capacity: number
}

/** 活动视图（用例层返回结构，DTO 映射在接口层） */
export interface ActivityView {
  readonly activity: Activity
  readonly status: ActivityStatus
  readonly participantCount: number
  readonly joinedByMe: boolean
}

/**
 * ActivityService 用例层：
 * 编排领域对象、控制规则边界，不接触 HTTP 与数据库实现。
 * 骨架阶段不做"仅管理员可创建"鉴权（任何人可创建），后续接入 role 后收紧。
 */
export class ActivityService extends Effect.Service<ActivityService>()("ActivityService", {
  effect: Effect.gen(function* () {
    // 依赖在服务构造时捕获：方法签名不泄漏上下文要求
    const repo = yield* ActivityRepository
    const idgen = yield* IdGenerator

    const parseDate = (value: string, label: string): Effect.Effect<Date, InvalidActivityInput> => {
      const date = new Date(value)
      return Number.isNaN(date.getTime())
        ? Effect.fail(new InvalidActivityInput({ reason: `${label} 不是合法的日期时间` }))
        : Effect.succeed(date)
    }

    const requireActivity = (
      activityId: ActivityId,
    ): Effect.Effect<Activity, ActivityNotFound | PersistenceError> =>
      repo.findById(activityId).pipe(
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.fail(new ActivityNotFound({ activityId })),
            onSome: (activity) => Effect.succeed(activity),
          }),
        ),
      )

    /** 基于"当前时间 + 当前用户"组装视图 */
    const toView = (activity: Activity, now: Date, userId: string): ActivityView => ({
      activity,
      status: activity.statusAt(now),
      participantCount: activity.participantCount(),
      joinedByMe: activity.hasEnrolled(userId),
    })

    return {
      /** 创建活动（管理员/组织者入口，暂不鉴权） */
      create: (
        input: CreateActivityInput,
        createdBy: string,
      ): Effect.Effect<ActivityView, InvalidActivityInput | PersistenceError> =>
        Effect.gen(function* () {
          const startAt = yield* parseDate(input.startAt, "开始时间")
          const endAt = yield* parseDate(input.endAt, "结束时间")
          const signupStartAt = yield* parseDate(input.signupStartAt, "报名开始时间")
          const signupEndAt = yield* parseDate(input.signupEndAt, "报名截止时间")

          if (input.capacity < 1) {
            return yield* Effect.fail(new InvalidActivityInput({ reason: "名额上限必须 ≥ 1" }))
          }
          if (startAt.getTime() >= endAt.getTime()) {
            return yield* Effect.fail(new InvalidActivityInput({ reason: "开始时间必须早于结束时间" }))
          }
          if (signupStartAt.getTime() >= signupEndAt.getTime()) {
            return yield* Effect.fail(
              new InvalidActivityInput({ reason: "报名开始时间必须早于报名截止时间" }),
            )
          }

          const id = yield* idgen.nextUUID
          const now = new Date(yield* Clock.currentTimeMillis)
          const activity = Activity.create({
            id: makeActivityId(id),
            name: input.name,
            description: input.description,
            location: input.location,
            coverImageUrl: input.coverImageUrl,
            startAt,
            endAt,
            signupStartAt,
            signupEndAt,
            capacity: input.capacity,
            createdBy,
            createdAt: now,
          })

          yield* repo.save(activity)
          yield* Effect.logInfo(`【活动创建】${activity.name}（${activity.id}，容量 ${activity.capacity}）`)
          return toView(activity, now, createdBy)
        }),

      /** 活动列表（按开始时间升序） */
      listActivities: (
        userId: string,
      ): Effect.Effect<ReadonlyArray<ActivityView>, PersistenceError> =>
        Effect.gen(function* () {
          const now = new Date(yield* Clock.currentTimeMillis)
          const all = yield* repo.findAll()
          return all
            .slice()
            .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
            .map((activity) => toView(activity, now, userId))
        }),

      /** 我参加的活动（当前用户已报名的，按开始时间升序） */
      listMyActivities: (
        userId: string,
      ): Effect.Effect<ReadonlyArray<ActivityView>, PersistenceError> =>
        Effect.gen(function* () {
          const now = new Date(yield* Clock.currentTimeMillis)
          const all = yield* repo.findAll()
          return all
            .slice()
            .filter((activity) => activity.hasEnrolled(userId))
            .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
            .map((activity) => toView(activity, now, userId))
        }),

      /** 活动详情 */
      getActivity: (
        activityId: ActivityId,
        userId: string,
      ): Effect.Effect<ActivityView, ActivityNotFound | PersistenceError> =>
        Effect.gen(function* () {
          const now = new Date(yield* Clock.currentTimeMillis)
          const activity = yield* requireActivity(activityId)
          return toView(activity, now, userId)
        }),

      /** 报名参加活动（名额上限 + 报名时间窗口校验） */
      enroll: (
        activityId: ActivityId,
        userId: string,
      ): Effect.Effect<
        ActivityView,
        | ActivityNotFound
        | SignupNotStarted
        | SignupClosed
        | ActivityEnded
        | ActivityFull
        | AlreadyEnrolled
        | PersistenceError
      > =>
        Effect.gen(function* () {
          const now = new Date(yield* Clock.currentTimeMillis)
          const activity = yield* requireActivity(activityId)

          if (activity.hasEnrolled(userId)) {
            return yield* Effect.fail(new AlreadyEnrolled({ activityId }))
          }
          if (now.getTime() >= activity.endAt.getTime()) {
            return yield* Effect.fail(new ActivityEnded({ activityId }))
          }
          if (now.getTime() < activity.signupStartAt.getTime()) {
            return yield* Effect.fail(new SignupNotStarted({ activityId }))
          }
          if (now.getTime() >= activity.signupEndAt.getTime()) {
            return yield* Effect.fail(new SignupClosed({ activityId }))
          }
          if (activity.isFull()) {
            return yield* Effect.fail(new ActivityFull({ activityId }))
          }

          const updated = activity.enroll(userId)
          yield* repo.save(updated)
          yield* Effect.logInfo(
            `【活动报名】${updated.name}（${updated.id}）已报名 ${updated.participantCount()}/${updated.capacity}`,
          )
          return toView(updated, now, userId)
        }),

      /** 取消报名（活动未结束前可退出） */
      cancelEnrollment: (
        activityId: ActivityId,
        userId: string,
      ): Effect.Effect<
        ActivityView,
        ActivityNotFound | ActivityEnded | NotEnrolled | PersistenceError
      > =>
        Effect.gen(function* () {
          const now = new Date(yield* Clock.currentTimeMillis)
          const activity = yield* requireActivity(activityId)

          if (now.getTime() >= activity.endAt.getTime()) {
            return yield* Effect.fail(new ActivityEnded({ activityId }))
          }
          if (!activity.hasEnrolled(userId)) {
            return yield* Effect.fail(new NotEnrolled({ activityId }))
          }

          const updated = activity.cancelEnrollment(userId)
          yield* repo.save(updated)
          yield* Effect.logInfo(
            `【取消报名】${updated.name}（${updated.id}）剩余 ${updated.participantCount()}/${updated.capacity}`,
          )
          return toView(updated, now, userId)
        }),
    }
  }),
}) {}
