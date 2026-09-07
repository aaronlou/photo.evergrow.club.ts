import { Config, Effect, Layer, Logger, Option } from "effect"
import { Clock } from "effect"
import { HttpApiBuilder, HttpApiSwagger } from "@effect/platform"
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { createServer } from "node:http"

import { Api } from "./api.js"
import { toApiError } from "./interface/apiError.js"
import { UserService } from "./modules/identity/application/userService.js"
import { makeUserId } from "./modules/identity/domain/user.js"
import { UserRepositoryInMemory } from "./modules/identity/infrastructure/userRepositoryInMemory.js"
import { UserRepositorySql } from "./modules/identity/infrastructure/userRepositorySql.js"
import { toUserDto } from "./modules/identity/interface/identityApi.js"
import { DbLive } from "./shared/db.js"
import { IdGenerator } from "./shared/kernel.js"

/**
 * 组合根（Composition Root）：唯一允许跨层装配的地方。
 * 每个 HttpApiGroup 的 handler 在这里绑定到 application 服务。
 */

const HealthGroupLive = HttpApiBuilder.group(Api, "health", (handlers) =>
  handlers.handle("check", () =>
    Clock.currentTimeMillis.pipe(
      Effect.map((ms) => ({ status: "ok" as const, timestamp: new Date(ms).toISOString() })),
    ),
  ),
)

const IdentityGroupLive = HttpApiBuilder.group(Api, "identity", (handlers) =>
  Effect.gen(function* () {
    const users = yield* UserService
    return handlers
      .handle("getUser", ({ path }) =>
        users.getProfile(makeUserId(path.id)).pipe(
          Effect.map(toUserDto),
          Effect.map((data) => ({ data })),
          Effect.mapError(toApiError),
        ),
      )
      .handle("register", ({ payload }) =>
        users.register(payload).pipe(
          Effect.map(toUserDto),
          Effect.map((data) => ({ data })),
          Effect.mapError(toApiError),
        ),
      )
  }),
)

/**
 * 数据接入装配（组合根按环境选择适配器）：
 * - 配置了 DATABASE_URL → PostgreSQL（DbLive + UserRepositorySql）
 * - 未配置 → 内存仓储（本地开发零依赖启动）
 */
const PersistenceLive = Layer.unwrapEffect(
  Config.option(Config.string("DATABASE_URL")).pipe(
    Effect.map((url) =>
      Option.isSome(url) ? UserRepositorySql.pipe(Layer.provide(DbLive)) : UserRepositoryInMemory,
    ),
  ),
)

const ApiLive = HttpApiBuilder.api(Api).pipe(
  Layer.provide(HealthGroupLive),
  Layer.provide(IdentityGroupLive),
  Layer.provide(UserService.Default),
  Layer.provide(PersistenceLive),
  Layer.provide(IdGenerator.Default),
)

const ServerLive = HttpApiBuilder.serve().pipe(
  Layer.provide(HttpApiSwagger.layer()),
  Layer.provide(ApiLive),
  Layer.provide(
    NodeHttpServer.layerConfig(createServer, {
      port: Config.integer("PORT").pipe(Config.withDefault(3000)),
    }),
  ),
  Layer.provide(Logger.pretty),
)

ServerLive.pipe(Layer.launch, NodeRuntime.runMain)
