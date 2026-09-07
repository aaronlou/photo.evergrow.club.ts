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
  it("达到成团人数后状态变为 Succeeded", () => {
    const group = GroupBuy.open({ hubId: makeHubId("h1"), filmId: makeFilmId("f1") })
      .join("u1", 3)
      .join("u2", 3)
    expect(group.status).toBe("Open")
    expect(group.memberCount()).toBe(2)

    const succeeded = group.join("u3", 3)
    expect(succeeded.status).toBe("Succeeded")
    expect(succeeded.memberCount()).toBe(3)
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
        makeFilmId("film-kodak-gold-200"),
        "user-a",
      )
    })
    const failure = await failureOf(program)
    expect(failure._tag).toBe("HubNotJoined")
  })

  it("加入心愿单后进度更新，重复加入会失败", async () => {
    const program = Effect.gen(function* () {
      const service = yield* GroupBuyService
      yield* service.joinHub("user-a", makeHubId("hub-sh-ja"))
      const first = yield* service.joinGroupBuy(
        makeHubId("hub-sh-ja"),
        makeFilmId("film-kodak-gold-200"),
        "user-a",
      )
      const again = yield* service.joinGroupBuy(
        makeHubId("hub-sh-ja"),
        makeFilmId("film-kodak-gold-200"),
        "user-a",
      )
      return { first, again }
    })
    const failure = await failureOf(program)
    expect(failure._tag).toBe("AlreadyJoinedGroup")
  })

  it("不同用户参团互不影响进度", async () => {
    const program = Effect.gen(function* () {
      const service = yield* GroupBuyService
      yield* service.joinHub("user-a", makeHubId("hub-sh-ja"))
      yield* service.joinHub("user-b", makeHubId("hub-sh-ja"))
      yield* service.joinGroupBuy(
        makeHubId("hub-sh-ja"),
        makeFilmId("film-kodak-gold-200"),
        "user-a",
      )
      return yield* service.getProgress(
        makeHubId("hub-sh-ja"),
        makeFilmId("film-kodak-gold-200"),
        "user-b",
      )
    }).pipe(Effect.provide(TestLive))

    const result = await Effect.runPromise(program)
    expect(result.memberCount).toBe(1)
    expect(result.joinedByMe).toBe(false)
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
