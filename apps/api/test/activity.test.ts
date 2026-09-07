import { describe, expect, it } from "vitest"
import { Cause, Effect, Exit, Layer, Option } from "effect"

import { ActivityService } from "../src/modules/activity/application/activityService.js"
import { Activity, makeActivityId } from "../src/modules/activity/domain/activity.js"
import { ActivityRepositoryInMemory } from "../src/modules/activity/infrastructure/activityRepositoryInMemory.js"
import { IdGenerator } from "../src/shared/kernel.js"

// 注意：effect 3.22 的 Layer.provide 多依赖扁平写法有缺陷，必须逐层嵌套
const TestLive = Layer.provide(
  Layer.provide(ActivityService.Default, ActivityRepositoryInMemory),
  IdGenerator.Default,
)

// 不同时间偏移构造一个纯 Activity（用于领域规则单测）
const activityAt = (opts: {
  signupStartAtMs?: number
  signupEndAtMs?: number
  startAtMs?: number
  endAtMs?: number
  capacity?: number
  participants?: ReadonlyArray<string>
}): Activity => {
  const base = Activity.create({
    id: makeActivityId("act-test"),
    name: "测试活动",
    description: "描述",
    location: "某地",
    coverImageUrl: "",
    startAt: new Date(opts.startAtMs ?? 0),
    endAt: new Date(opts.endAtMs ?? 0),
    signupStartAt: new Date(opts.signupStartAtMs ?? 0),
    signupEndAt: new Date(opts.signupEndAtMs ?? 0),
    capacity: opts.capacity ?? 10,
    createdBy: "admin",
    createdAt: new Date(0),
  })
  return (opts.participants ?? []).reduce((acc, u) => acc.enroll(u), base)
}

const failureOf = async <E>(program: Effect.Effect<unknown, E>): Promise<E> => {
  const exit = await Effect.runPromiseExit(program.pipe(Effect.provide(TestLive)))
  expect(Exit.isFailure(exit)).toBe(true)
  if (!Exit.isFailure(exit)) {
    throw new Error("预期失败但成功了")
  }
  const failure = Cause.failureOption(exit.cause)
  expect(Option.isSome(failure)).toBe(true)
  return failure.value as E
}

describe("Activity 聚合（领域规则 / 状态机）", () => {
  const base = Date.now()

  it("报名窗口未开放 → NotStarted", () => {
    const activity = activityAt({
      signupStartAtMs: base + 1000,
      signupEndAtMs: base + 2000,
      startAtMs: base + 3000,
      endAtMs: base + 4000,
    })
    expect(activity.statusAt(new Date(base))).toBe("NotStarted")
  })

  it("窗口内且未满员 → Open", () => {
    const activity = activityAt({
      signupStartAtMs: base - 1000,
      signupEndAtMs: base + 2000,
      startAtMs: base + 3000,
      endAtMs: base + 4000,
    })
    expect(activity.statusAt(new Date(base))).toBe("Open")
  })

  it("满员 → Full", () => {
    const activity = activityAt({
      signupStartAtMs: base - 1000,
      signupEndAtMs: base + 2000,
      startAtMs: base + 3000,
      endAtMs: base + 4000,
      capacity: 2,
      participants: ["u1", "u2"],
    })
    expect(activity.statusAt(new Date(base))).toBe("Full")
  })

  it("已过报名截止 → Closed", () => {
    const activity = activityAt({
      signupStartAtMs: base - 3000,
      signupEndAtMs: base - 1000,
      startAtMs: base + 1000,
      endAtMs: base + 2000,
    })
    expect(activity.statusAt(new Date(base))).toBe("Closed")
  })

  it("已结束 → Ended（优先级高于 Closed/Full）", () => {
    const activity = activityAt({
      signupStartAtMs: base - 3000,
      signupEndAtMs: base + 1000,
      startAtMs: base - 2000,
      endAtMs: base - 1000,
      capacity: 2,
      participants: ["u1", "u2"],
    })
    expect(activity.statusAt(new Date(base))).toBe("Ended")
  })

  it("enroll 追加报名、isFull 生效", () => {
    const activity = activityAt({ capacity: 2 })
    const joined = activity.enroll("u1")
    expect(joined.participantCount()).toBe(1)
    expect(joined.hasEnrolled("u1")).toBe(true)
    expect(joined.isFull()).toBe(false)
    const full = joined.enroll("u2")
    expect(full.isFull()).toBe(true)
  })
})

describe("ActivityService 用例", () => {
  it("报名成功：进度更新且 joinedByMe 为 true", async () => {
    const program = Effect.gen(function* () {
      const service = yield* ActivityService
      return yield* service.enroll(makeActivityId("act-citywalk-sh"), "user-99")
    }).pipe(Effect.provide(TestLive))

    const result = await Effect.runPromise(program)
    expect(result.activity.id).toBe("act-citywalk-sh")
    expect(result.participantCount).toBe(9)
    expect(result.joinedByMe).toBe(true)
    expect(result.status).toBe("Open")
  })

  it("同一用户重复报名会失败", async () => {
    const program = Effect.gen(function* () {
      const service = yield* ActivityService
      yield* service.enroll(makeActivityId("act-citywalk-sh"), "u1")
      return yield* service.enroll(makeActivityId("act-citywalk-sh"), "u1")
    })
    const failure = await failureOf(program)
    expect(failure._tag).toBe("AlreadyEnrolled")
  })

  it("已满员活动报名会失败", async () => {
    const program = Effect.gen(function* () {
      const service = yield* ActivityService
      return yield* service.enroll(makeActivityId("act-portrait-studio"), "user-99")
    })
    const failure = await failureOf(program)
    expect(failure._tag).toBe("ActivityFull")
  })

  it("已结束活动报名会失败", async () => {
    const program = Effect.gen(function* () {
      const service = yield* ActivityService
      return yield* service.enroll(makeActivityId("act-spring-walk"), "user-99")
    })
    const failure = await failureOf(program)
    expect(failure._tag).toBe("ActivityEnded")
  })

  it("未到报名开始时间会失败", async () => {
    const program = Effect.gen(function* () {
      const service = yield* ActivityService
      const now = Date.now()
      const created = yield* service.create({
        name: "未来活动",
        description: "d",
        location: "l",
        coverImageUrl: "",
        startAt: new Date(now + 3 * 86400000).toISOString(),
        endAt: new Date(now + 4 * 86400000).toISOString(),
        signupStartAt: new Date(now + 1 * 86400000).toISOString(),
        signupEndAt: new Date(now + 2 * 86400000).toISOString(),
        capacity: 10,
      }, "admin")
      return yield* service.enroll(created.activity.id, "u1")
    })
    const failure = await failureOf(program)
    expect(failure._tag).toBe("SignupNotStarted")
  })

  it("报名截止后报名会失败", async () => {
    const program = Effect.gen(function* () {
      const service = yield* ActivityService
      const now = Date.now()
      const created = yield* service.create({
        name: "已截止活动",
        description: "d",
        location: "l",
        coverImageUrl: "",
        startAt: new Date(now + 1 * 86400000).toISOString(),
        endAt: new Date(now + 2 * 86400000).toISOString(),
        signupStartAt: new Date(now - 2 * 86400000).toISOString(),
        signupEndAt: new Date(now - 1 * 86400000).toISOString(),
        capacity: 10,
      }, "admin")
      return yield* service.enroll(created.activity.id, "u1")
    })
    const failure = await failureOf(program)
    expect(failure._tag).toBe("SignupClosed")
  })

  it("创建活动：非法名额/时间顺序会失败", async () => {
    const now = Date.now()
    const badCapacity = Effect.gen(function* () {
      const service = yield* ActivityService
      return yield* service.create({
        name: "x",
        description: "d",
        location: "l",
        coverImageUrl: "",
        startAt: new Date(now + 1000).toISOString(),
        endAt: new Date(now + 2000).toISOString(),
        signupStartAt: new Date(now).toISOString(),
        signupEndAt: new Date(now + 500).toISOString(),
        capacity: 0,
      }, "admin")
    })
    const capacityFailure = await failureOf(badCapacity)
    expect(capacityFailure._tag).toBe("InvalidActivityInput")

    const badOrder = Effect.gen(function* () {
      const service = yield* ActivityService
      return yield* service.create({
        name: "x",
        description: "d",
        location: "l",
        coverImageUrl: "",
        startAt: new Date(now + 2000).toISOString(),
        endAt: new Date(now + 1000).toISOString(),
        signupStartAt: new Date(now).toISOString(),
        signupEndAt: new Date(now + 500).toISOString(),
        capacity: 5,
      }, "admin")
    })
    const orderFailure = await failureOf(badOrder)
    expect(orderFailure._tag).toBe("InvalidActivityInput")
  })

  it("列表包含种子活动（含不同状态）", async () => {
    const program = Effect.gen(function* () {
      const service = yield* ActivityService
      return yield* service.listActivities("u1")
    }).pipe(Effect.provide(TestLive))

    const list = await Effect.runPromise(program)
    expect(list.length).toBeGreaterThanOrEqual(3)
    const statuses = list.map((v) => v.status)
    expect(statuses).toContain("Open")
    expect(statuses).toContain("Full")
    expect(statuses).toContain("Ended")
  })

  it("listMyActivities 只返回该用户已报名的活动", async () => {
    const program = Effect.gen(function* () {
      const service = yield* ActivityService
      yield* service.enroll(makeActivityId("act-citywalk-sh"), "user-55")
      return yield* service.listMyActivities("user-55")
    })
    const list = await Effect.runPromise(program.pipe(Effect.provide(TestLive)))
    expect(list.length).toBe(1)
    expect(list[0].activity.id).toBe("act-citywalk-sh")
    expect(list[0].joinedByMe).toBe(true)
  })

  it("未报名的用户 listMyActivities 为空", async () => {
    const program = Effect.gen(function* () {
      const service = yield* ActivityService
      return yield* service.listMyActivities("no-such-user")
    })
    const list = await Effect.runPromise(program.pipe(Effect.provide(TestLive)))
    expect(list.length).toBe(0)
  })

  it("报名后取消报名：人数减少且 joinedByMe 变 false", async () => {
    const program = Effect.gen(function* () {
      const service = yield* ActivityService
      yield* service.enroll(makeActivityId("act-citywalk-sh"), "user-77")
      const before = yield* service.getActivity(makeActivityId("act-citywalk-sh"), "user-77")
      const after = yield* service.cancelEnrollment(makeActivityId("act-citywalk-sh"), "user-77")
      return { before, after }
    })
    const { before, after } = await Effect.runPromise(program.pipe(Effect.provide(TestLive)))
    expect(before.joinedByMe).toBe(true)
    expect(before.participantCount).toBe(9)
    expect(after.joinedByMe).toBe(false)
    expect(after.participantCount).toBe(8)
  })

  it("未报名就取消会失败", async () => {
    const program = Effect.gen(function* () {
      const service = yield* ActivityService
      return yield* service.cancelEnrollment(makeActivityId("act-citywalk-sh"), "never-enrolled")
    })
    const failure = await failureOf(program)
    expect(failure._tag).toBe("NotEnrolled")
  })

  it("已结束的活动无法取消（仅限未结束）", async () => {
    const program = Effect.gen(function* () {
      const service = yield* ActivityService
      return yield* service.cancelEnrollment(makeActivityId("act-spring-walk"), "u1")
    })
    const failure = await failureOf(program)
    expect(failure._tag).toBe("ActivityEnded")
  })
})
