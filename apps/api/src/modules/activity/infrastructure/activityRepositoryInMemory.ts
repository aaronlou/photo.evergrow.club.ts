import { Effect, Layer, Option, Ref } from "effect"

import { PersistenceError } from "../../../shared/errors.js"
import { Activity, makeActivityId } from "../domain/activity.js"
import { ActivityRepository } from "../domain/repository.js"

/**
 * ActivityRepository 内存实现（骨架阶段默认）：零基础设施即可启动与演示。
 * 内含 3 条种子活动，覆盖 报名中 / 已满员 / 已结束 三种状态，便于联调。
 */

const DAY = 24 * 60 * 60 * 1000
const daysFromNow = (days: number): Date => new Date(Date.now() + days * DAY)

const seedActivities = (): ReadonlyArray<Activity> => [
  // 报名进行中（未满员）
  Activity.create({
    id: makeActivityId("act-citywalk-sh"),
    name: "胶片街头漫游 · 上海武康路",
    description: "跟着老摄影师用 135 胶卷扫街，边走边拍，结束后一起冲洗分享。适合新手。",
    location: "上海 · 武康路 285 号 集合",
    coverImageUrl: "",
    startAt: daysFromNow(4),
    endAt: daysFromNow(4.5),
    signupStartAt: daysFromNow(-1),
    signupEndAt: daysFromNow(3),
    capacity: 30,
    createdBy: "seed-admin",
    createdAt: daysFromNow(-2),
  }).enroll("u1").enroll("u2").enroll("u3").enroll("u4").enroll("u5")
    .enroll("u6").enroll("u7").enroll("u8"),
  // 已满员
  Activity.create({
    id: makeActivityId("act-portrait-studio"),
    name: "室内人像实拍训练营",
    description: "三灯棚拍实训，每人可带一组模特，讲师逐一点评。",
    location: "杭州 · 滨江 KIKI 摄影棚",
    coverImageUrl: "",
    startAt: daysFromNow(2),
    endAt: daysFromNow(2.3),
    signupStartAt: daysFromNow(-2),
    signupEndAt: daysFromNow(1),
    capacity: 12,
    createdBy: "seed-admin",
    createdAt: daysFromNow(-3),
  }).enroll("u1").enroll("u2").enroll("u3").enroll("u4").enroll("u5")
    .enroll("u6").enroll("u7").enroll("u8").enroll("u9").enroll("u10")
    .enroll("u11").enroll("u12"),
  // 已结束
  Activity.create({
    id: makeActivityId("act-spring-walk"),
    name: "春日扫街 · 老照片展",
    description: "春季街区漫游，结合作品展现场拍摄。",
    location: "北京 · 798 艺术区",
    coverImageUrl: "",
    startAt: daysFromNow(-4),
    endAt: daysFromNow(-3),
    signupStartAt: daysFromNow(-10),
    signupEndAt: daysFromNow(-4.5),
    capacity: 20,
    createdBy: "seed-admin",
    createdAt: daysFromNow(-12),
  }).enroll("u1").enroll("u2").enroll("u3"),
]

const persistence = <A, E>(self: Effect.Effect<A, E>): Effect.Effect<A, PersistenceError> =>
  self.pipe(
    Effect.mapError((e) =>
      new PersistenceError({ message: e instanceof Error ? e.message : String(e) }),
    ),
  )

export const ActivityRepositoryInMemory = Layer.effect(
  ActivityRepository,
  Effect.gen(function* () {
    const store = yield* Ref.make(
      new Map<string, Activity>(seedActivities().map((a) => [a.id, a])),
    )
    return ActivityRepository.make({
      findAll: () => persistence(Ref.get(store).pipe(Effect.map((m) => [...m.values()]))),
      findById: (id) =>
        persistence(Ref.get(store).pipe(Effect.map((m) => Option.fromNullable(m.get(id))))),
      save: (activity: Activity) =>
        persistence(Ref.update(store, (m) => m.set(activity.id, activity))),
    })
  }),
)
