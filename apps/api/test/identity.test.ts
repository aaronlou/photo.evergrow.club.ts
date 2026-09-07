import { describe, expect, it } from "vitest"
import { Cause, Effect, Exit, Layer, Option } from "effect"

import { IdGenerator } from "../src/shared/kernel.js"
import { makePhoneNumber } from "../src/shared/types.js"
import { UserService } from "../src/modules/identity/application/userService.js"
import { UserRepositoryInMemory } from "../src/modules/identity/infrastructure/userRepositoryInMemory.js"

// 注意：effect 3.22 的 Layer.provide 多依赖扁平写法有缺陷，
// 多个依赖必须逐层嵌套 provide（组合根 main.ts 的 pipe 链同理）
const TestLive = Layer.provide(
  Layer.provide(UserService.Default, UserRepositoryInMemory),
  IdGenerator.Default,
)

describe("PhoneNumber 值对象", () => {
  it("接受合法手机号", () => {
    expect(() => makePhoneNumber("13800138000")).not.toThrow()
    expect(makePhoneNumber("13800138000")).toBe("13800138000")
  })

  it("拒绝非法手机号", () => {
    expect(() => makePhoneNumber("12345")).toThrow()
  })
})

describe("UserService", () => {
  it("注册后可按 ID 查询到用户", async () => {
    const program = Effect.gen(function* () {
      const users = yield* UserService
      const created = yield* users.register({ phone: "13800138000", nickname: "小明" })
      const found = yield* users.getProfile(created.id)
      return { created, found }
    }).pipe(Effect.provide(TestLive))

    const { created, found } = await Effect.runPromise(program)
    expect(found.id).toBe(created.id)
    expect(found.nickname).toBe("小明")
    expect(found.status).toBe("Active")
  })

  it("同一手机号重复注册会失败", async () => {
    const program = Effect.gen(function* () {
      const users = yield* UserService
      yield* users.register({ phone: "13800138000", nickname: "小红" })
      return yield* users.register({ phone: "13800138000", nickname: "小刚" })
    }).pipe(Effect.provide(TestLive))

    const exit = await Effect.runPromiseExit(program)
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause)
      expect(Option.isSome(failure)).toBe(true)
      if (Option.isSome(failure)) {
        expect(failure.value._tag).toBe("PhoneAlreadyRegistered")
      }
    }
  })
})
