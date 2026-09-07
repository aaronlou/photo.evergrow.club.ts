import { FileSystem, HttpServerResponse } from "@effect/platform"
import { Config, Effect, Layer, Logger, Option } from "effect"
import { Clock } from "effect"
import { HttpApiBuilder, HttpApiSwagger } from "@effect/platform"
import { NodeFileSystem, NodeHttpServer, NodePath, NodeRuntime } from "@effect/platform-node"
import { createServer } from "node:http"
import { join, resolve, sep } from "node:path"

import { Api } from "./api.js"
import { toApiError } from "./interface/apiError.js"
import { GroupBuyService } from "./modules/groupbuy/application/groupBuyService.js"
import { makeFilmId } from "./modules/groupbuy/domain/film.js"
import { makeHubId } from "./modules/groupbuy/domain/hub.js"
import {
  FilmRepositoryInMemory,
  GroupBuyRepositoryInMemory,
  HubRepositoryInMemory,
} from "./modules/groupbuy/infrastructure/groupBuyInMemory.js"
import { ImageStorageLocal, uploadsDir } from "./modules/groupbuy/infrastructure/imageStorageLocal.js"
import {
  currentUserId,
  toFilmDetailDto,
  toFilmDto,
  toHubDto,
  toProgressDto,
} from "./modules/groupbuy/interface/groupBuyApi.js"
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

const demoAssetsDir = join(process.cwd(), "assets", "demo")

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

const GroupBuyGroupLive = HttpApiBuilder.group(Api, "groupbuy", (handlers) =>
  Effect.gen(function* () {
    const groupBuy = yield* GroupBuyService
    const fs = yield* FileSystem.FileSystem
    return handlers
      .handle("getHubs", ({ request }) => {
        const uid = currentUserId(request)
        return groupBuy.listHubs(uid).pipe(
          Effect.map((hubs) => ({ data: hubs.map((hub) => toHubDto(hub, uid)) })),
          Effect.mapError(toApiError),
        )
      })
      .handle("joinHub", ({ path, request }) => {
        const uid = currentUserId(request)
        return groupBuy.joinHub(uid, makeHubId(path.id)).pipe(
          Effect.map((hub) => ({ data: toHubDto(hub, uid) })),
          Effect.mapError(toApiError),
        )
      })
      .handle("getFilms", ({ path, request }) => {
        const uid = currentUserId(request)
        return groupBuy.listFilms(makeHubId(path.hubId), uid).pipe(
          Effect.map((items) => ({
            data: items.map(({ film, progress }) => toFilmDto(film, progress)),
          })),
          Effect.mapError(toApiError),
        )
      })
      .handle("getFilm", ({ path, request }) => {
        const uid = currentUserId(request)
        return groupBuy.getFilm(makeHubId(path.hubId), makeFilmId(path.filmId), uid).pipe(
          Effect.map(({ film, progress }) => ({ data: toFilmDetailDto(film, progress) })),
          Effect.mapError(toApiError),
        )
      })
      .handle("joinGroupBuy", ({ path, request }) => {
        const uid = currentUserId(request)
        return groupBuy
          .joinGroupBuy(makeHubId(path.hubId), makeFilmId(path.filmId), uid)
          .pipe(
            Effect.map((progress) => ({ data: toProgressDto(progress) })),
            Effect.mapError(toApiError),
          )
      })
      .handle("getGroupProgress", ({ path, request }) => {
        const uid = currentUserId(request)
        return groupBuy
          .getProgress(makeHubId(path.hubId), makeFilmId(path.filmId), uid)
          .pipe(
            Effect.map((progress) => ({ data: toProgressDto(progress) })),
            Effect.mapError(toApiError),
          )
      })
      .handle("uploadImage", ({ path, request, payload }) => {
        const uid = currentUserId(request)
        return groupBuy
          .uploadSampleImage(makeFilmId(path.filmId), uid, {
            fromPath: payload.file.path,
            name: payload.file.name,
            contentType: payload.file.contentType,
          })
          .pipe(
            Effect.map((image) => ({ data: image })),
            Effect.mapError(toApiError),
          )
      })
      .handle("getImage", ({ path }) =>
        Effect.gen(function* () {
          const key = path.key
          const base = key.startsWith("demo/") ? demoAssetsDir : uploadsDir
          const baseAbs = resolve(base)
          const target = resolve(baseAbs, key)
          // 防目录穿越：目标必须落在允许的目录内
          if (!target.startsWith(baseAbs + sep)) {
            return HttpServerResponse.empty({ status: 404 })
          }
          const exists = yield* fs.exists(target).pipe(Effect.mapError(toApiError))
          if (!exists) {
            return HttpServerResponse.empty({ status: 404 })
          }
          return yield* HttpServerResponse.file(target).pipe(Effect.mapError(toApiError))
        }),
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
  Layer.provide(GroupBuyGroupLive),
  Layer.provide(UserService.Default),
  Layer.provide(PersistenceLive),
  // groupbuy：内存仓储 + 本地磁盘图片存储（SQL/OSS 适配器后续接入）
  Layer.provide(GroupBuyService.Default),
  Layer.provide(HubRepositoryInMemory),
  Layer.provide(FilmRepositoryInMemory),
  Layer.provide(GroupBuyRepositoryInMemory),
  Layer.provide(ImageStorageLocal),
  Layer.provide(NodeFileSystem.layer),
  Layer.provide(NodePath.layer),
  // IdGenerator 最后提供：满足前面所有 Default 层对它的依赖
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
