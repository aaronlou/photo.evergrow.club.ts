import { describe, expect, it } from "vitest"
import { Cause, Effect, Exit, Layer, Option } from "effect"

import { GroupBuyService } from "../src/modules/groupbuy/application/groupBuyService.js"
import { makeFilmId } from "../src/modules/groupbuy/domain/film.js"
import { GroupBuy } from "../src/modules/groupbuy/domain/groupBuy.js"
import { Hub, makeHubId } from "../src/modules/groupbuy/domain/hub.js"
import { ImageStorage } from "../src/modules/groupbuy/domain/imageStorage.js"
import {
  FilmRepositoryInMemory,
  GroupBuyRepositoryInMemory,
  HubRepositoryInMemory,
} from "../src/modules/groupbuy/infrastructure/groupBuyInMemory.js"
import { IdGenerator } from "../src/shared/kernel.js"

// 注意：effect 3.22 的 Layer.provide 多依赖扁平写法有缺陷，必须逐层嵌套
const TestLive = Layer.provide(
  Layer.provide(
    Layer.provide(
      Layer.provide(
        Layer.provide(GroupBuyService.Default, HubRepositoryInMemory),
        FilmRepositoryInMemory,
      ),
      GroupBuyRepositoryInMemory,
    ),
    ImageStorage.Default,
  ),
  IdGenerator.Default,
)

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

describe("GroupBuy 聚合（领域规则）", () => {
  it("按件数累计，达到 threshold 后状态变为 Succeeded", () => {
    const group = GroupBuy.open({ hubId: makeHubId("h1"), filmId: makeFilmId("f1") })
      .join("u1", 2, 100, 5)
      .join("u2", 3, 100, 5)
    expect(group.totalQuantity()).toBe(5)
    expect(group.status).toBe("Succeeded")
    expect(group.participantCount()).toBe(2)
  })

  it("未达到 threshold 时为 Open", () => {
    const group = GroupBuy.open({ hubId: makeHubId("h1"), filmId: makeFilmId("f1") })
      .join("u1", 2, 100, 5)
    expect(group.totalQuantity()).toBe(2)
    expect(group.status).toBe("Open")
  })

  it("join 生成订单摘要：总价、订金(10%)、货到付款、未付订金", () => {
    const group = GroupBuy.open({ hubId: makeHubId("h1"), filmId: makeFilmId("f1") })
      .join("u1", 3, 4590, 5)
    const p = group.participantOf("u1")!
    expect(p.quantity).toBe(3)
    expect(p.unitPriceInCents).toBe(4590)
    expect(p.totalInCents).toBe(4590 * 3)
    expect(p.depositInCents).toBe(Math.floor(4590 * 3 * 0.1))
    expect(p.deliveryMode).toBe("COD")
    expect(p.depositPaid).toBe(false)
  })

  it("markDepositPaid 标记订金已付（幂等）", () => {
    const group = GroupBuy.open({ hubId: makeHubId("h1"), filmId: makeFilmId("f1") })
      .join("u1", 2, 100, 5)
      .markDepositPaid("u1")
    expect(group.participantOf("u1")!.depositPaid).toBe(true)
    expect(group.participantOf("u1")!.depositPaid).toBe(true)
  })
})

describe("GroupBuyService 用例", () => {
  it("同一用户重复加入位置点会失败", async () => {
    const program = Effect.gen(function* () {
      const service = yield* GroupBuyService
      yield* service.joinHub("user-a", makeHubId("hub-sh-ja"))
      return yield* service.joinHub("user-a", makeHubId("hub-sh-ja"))
    })
    const failure = await failureOf(program)
    expect(failure._tag).toBe("AlreadyJoinedHub")
  })

  it("未加入位置点就参团会失败", async () => {
    const program = Effect.gen(function* () {
      const service = yield* GroupBuyService
      return yield* service.joinGroupBuy(
        makeHubId("hub-sh-ja"),
        makeFilmId("film-kodak-gold-200-135"),
        "user-a",
        1,
      )
    })
    const failure = await failureOf(program)
    expect(failure._tag).toBe("HubNotJoined")
  })

  it("数量非法（<1）会失败", async () => {
    const program = Effect.gen(function* () {
      const service = yield* GroupBuyService
      yield* service.joinHub("user-a", makeHubId("hub-sh-ja"))
      return yield* service.joinGroupBuy(
        makeHubId("hub-sh-ja"),
        makeFilmId("film-kodak-gold-200-135"),
        "user-a",
        0,
      )
    })
    const failure = await failureOf(program)
    expect(failure._tag).toBe("InvalidQuantity")
  })

  it("加入心愿单（指定数量）后进度：件数/人数/订金正确", async () => {
    const program = Effect.gen(function* () {
      const service = yield* GroupBuyService
      yield* service.joinHub("user-a", makeHubId("hub-sh-ja"))
      return yield* service.joinGroupBuy(
        makeHubId("hub-sh-ja"),
        makeFilmId("film-kodak-gold-200-135"),
        "user-a",
        3,
      )
    }).pipe(Effect.provide(TestLive))

    const progress = await Effect.runPromise(program)
    expect(progress.memberCount).toBe(3)
    expect(progress.participantCount).toBe(1)
    expect(progress.joinedByMe).toBe(true)
    expect(progress.myQuantity).toBe(3)
    expect(progress.unitPriceInCents).toBe(4590)
    expect(progress.totalInCents).toBe(4590 * 3)
    expect(progress.depositInCents).toBe(Math.floor(4590 * 3 * 0.1))
    expect(progress.deliveryMode).toBe("COD")
    expect(progress.depositPaid).toBe(false)
    expect(progress.status).toBe("Open")
  })

  it("重复加入心愿单会失败", async () => {
    const program = Effect.gen(function* () {
      const service = yield* GroupBuyService
      yield* service.joinHub("user-a", makeHubId("hub-sh-ja"))
      yield* service.joinGroupBuy(
        makeHubId("hub-sh-ja"),
        makeFilmId("film-kodak-gold-200-135"),
        "user-a",
        1,
      )
      return yield* service.joinGroupBuy(
        makeHubId("hub-sh-ja"),
        makeFilmId("film-kodak-gold-200-135"),
        "user-a",
        1,
      )
    })
    const failure = await failureOf(program)
    expect(failure._tag).toBe("AlreadyJoinedGroup")
  })

  it("累计件数达到 threshold 即成团", async () => {
    const program = Effect.gen(function* () {
      const service = yield* GroupBuyService
      yield* service.joinHub("user-a", makeHubId("hub-sh-ja"))
      // gold 200 threshold=20，一次加入 20 件即成团
      return yield* service.joinGroupBuy(
        makeHubId("hub-sh-ja"),
        makeFilmId("film-kodak-gold-200-135"),
        "user-a",
        20,
      )
    }).pipe(Effect.provide(TestLive))

    const progress = await Effect.runPromise(program)
    expect(progress.status).toBe("Succeeded")
    expect(progress.remaining).toBe(0)
  })

  it("支付订金后 depositPaid 为 true", async () => {
    const program = Effect.gen(function* () {
      const service = yield* GroupBuyService
      yield* service.joinHub("user-a", makeHubId("hub-sh-ja"))
      yield* service.joinGroupBuy(
        makeHubId("hub-sh-ja"),
        makeFilmId("film-kodak-gold-200-135"),
        "user-a",
        2,
      )
      return yield* service.payDeposit(
        makeHubId("hub-sh-ja"),
        makeFilmId("film-kodak-gold-200-135"),
        "user-a",
      )
    }).pipe(Effect.provide(TestLive))

    const progress = await Effect.runPromise(program)
    expect(progress.depositPaid).toBe(true)
    expect(progress.depositInCents).toBe(Math.floor(4590 * 2 * 0.1))
  })

  it("未加入就支付订金会失败", async () => {
    const program = Effect.gen(function* () {
      const service = yield* GroupBuyService
      return yield* service.payDeposit(
        makeHubId("hub-sh-ja"),
        makeFilmId("film-kodak-gold-200-135"),
        "user-a",
      )
    })
    const failure = await failureOf(program)
    expect(failure._tag).toBe("NotJoinedGroup")
  })

  it("不同用户参团互不影响进度", async () => {
    const program = Effect.gen(function* () {
      const service = yield* GroupBuyService
      yield* service.joinHub("user-a", makeHubId("hub-sh-ja"))
      yield* service.joinHub("user-b", makeHubId("hub-sh-ja"))
      yield* service.joinGroupBuy(
        makeHubId("hub-sh-ja"),
        makeFilmId("film-kodak-gold-200-135"),
        "user-a",
        2,
      )
      return yield* service.getProgress(
        makeHubId("hub-sh-ja"),
        makeFilmId("film-kodak-gold-200-135"),
        "user-b",
      )
    }).pipe(Effect.provide(TestLive))

    const result = await Effect.runPromise(program)
    expect(result.memberCount).toBe(2)
    expect(result.participantCount).toBe(1)
    expect(result.joinedByMe).toBe(false)
    expect(result.myQuantity).toBe(0)
    expect(result.status).toBe("Open")
  })
})

describe("Hub 聚合（领域规则）", () => {
  it("join 会累计成员数", () => {
    const hub = Hub.create({
      id: makeHubId("h1"),
      name: "测试点",
      city: "上海",
      address: "测试地址",
      createdAt: new Date(),
    })
    const joined = hub.join("u1").join("u2")
    expect(joined.memberCount()).toBe(2)
    expect(joined.hasJoined("u1")).toBe(true)
    expect(joined.hasJoined("u9")).toBe(false)
  })
})
