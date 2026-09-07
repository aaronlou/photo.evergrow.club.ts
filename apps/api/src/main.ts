import { FileSystem, Headers, HttpServerRequest, HttpServerResponse } from "@effect/platform"
import { Config, Effect, Either, Layer, Logger, Option } from "effect"
import { Clock } from "effect"
import { HttpApiBuilder, HttpApiSwagger } from "@effect/platform"
import { NodeFileSystem, NodeHttpServer, NodePath, NodeRuntime } from "@effect/platform-node"
import { createServer } from "node:http"
import { dirname, join, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

import { Api } from "./api.js"
import { ApiError, toApiError, UnauthorizedError } from "./interface/apiError.js"
import { SampleImageForbidden, SampleImageNotFound } from "./modules/groupbuy/domain/errors.js"
import { ActivityService } from "./modules/activity/application/activityService.js"
import { makeActivityId } from "./modules/activity/domain/activity.js"
import { ActivityRepositoryInMemory } from "./modules/activity/infrastructure/activityRepositoryInMemory.js"
import { ActivityRepositorySql } from "./modules/activity/infrastructure/activityRepositorySql.js"
import {
  currentUserId as activityCurrentUserId,
  toActivityDetailDto,
  toActivityDto,
} from "./modules/activity/interface/activityApi.js"
import { GroupBuyService } from "./modules/groupbuy/application/groupBuyService.js"
import { makeFilmId } from "./modules/groupbuy/domain/film.js"
import { makeHubId } from "./modules/groupbuy/domain/hub.js"
import {
  FilmRepositoryInMemory,
  GroupBuyRepositoryInMemory,
  HubRepositoryInMemory,
} from "./modules/groupbuy/infrastructure/groupBuyInMemory.js"
import { FilmRepositorySql } from "./modules/groupbuy/infrastructure/filmRepositorySql.js"
import { ImageStorageLocal, uploadsDir } from "./modules/groupbuy/infrastructure/imageStorageLocal.js"
import {
  currentUserId,
  toFilmCatalogDetailDto,
  toFilmCatalogDto,
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

// 资源目录按模块位置解析（不依赖进程 cwd，避免从仓库根启动时找不到文件）：
// dev: apps/api/src/../assets；build: apps/api/dist/../assets
const assetsRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "assets")
const demoAssetsDir = join(assetsRoot, "demo")
const filmAssetsDir = join(assetsRoot, "films")

/** 从指定目录安全地读取图片（防目录穿越），未找到返回 404 */
const serveImage = (key: string, base: string, fs: FileSystem.FileSystem) =>
  Effect.gen(function* () {
    const baseAbs = resolve(base)
    const target = resolve(baseAbs, key)
    if (!target.startsWith(baseAbs + sep)) {
      return HttpServerResponse.empty({ status: 404 })
    }
    const exists = yield* fs.exists(target).pipe(Effect.mapError(toApiError))
    if (!exists) {
      return HttpServerResponse.empty({ status: 404 })
    }
    // 图片 key 均为不可变内容（UUID 上传 key / 固定资源名），可放心长缓存
    const cacheHeaders = { "cache-control": "public, max-age=31536000, immutable" }
    return yield* HttpServerResponse.file(target, { headers: cacheHeaders }).pipe(
      Effect.mapError(toApiError),
    )
  })

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
      .handle("listAllFilms", () =>
        groupBuy.listAllFilms().pipe(
          Effect.map((films) => ({ data: films.map((film) => toFilmCatalogDto(film)) })),
          Effect.mapError(toApiError),
        ),
      )
      .handle("getFilmById", ({ path }) =>
        groupBuy.getFilmById(makeFilmId(path.filmId)).pipe(
          Effect.map((film) => ({ data: toFilmCatalogDetailDto(film) })),
          Effect.mapError(toApiError),
        ),
      )
      .handle("contributeFilmInfo", ({ path, payload }) =>
        groupBuy
          .updateFilm(makeFilmId(path.filmId), {
            features: payload.features,
            scenarios: payload.scenarios,
          })
          .pipe(
            Effect.map((film) => ({ data: toFilmCatalogDetailDto(film) })),
            Effect.mapError(toApiError),
          ),
      )
      .handle("joinGroupBuy", ({ path, request, payload }) => {
        const uid = currentUserId(request)
        return groupBuy
          .joinGroupBuy(makeHubId(path.hubId), makeFilmId(path.filmId), uid, payload.quantity)
          .pipe(
            Effect.map((progress) => ({ data: toProgressDto(progress) })),
            Effect.mapError(toApiError),
          )
      })
      .handle("payDeposit", ({ path, request }) => {
        const uid = currentUserId(request)
        return groupBuy
          .payDeposit(makeHubId(path.hubId), makeFilmId(path.filmId), uid)
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
      .handle("deleteSampleImage", ({ path, request }) => {
        const uid = currentUserId(request)
        return Effect.either(requireAdmin(request)).pipe(
          Effect.flatMap((adminResult) =>
            groupBuy.removeSampleImage(
              makeFilmId(path.filmId),
              path.imageId,
              uid,
              Either.isRight(adminResult),
            ),
          ),
          Effect.map((film) => ({ data: toFilmCatalogDetailDto(film) })),
          // 403/404 保持原始错误类型（带正确状态码），其余归一为 ApiError
          Effect.mapError((e) =>
            e instanceof SampleImageForbidden || e instanceof SampleImageNotFound
              ? e
              : toApiError(e),
          ),
        )
      })
      .handle("getUploadedImage", ({ path }) => serveImage(path.key, uploadsDir, fs))
      .handle("getFilmCover", ({ path }) => serveImage(path.key, filmAssetsDir, fs))
      .handle("getDemoImage", ({ path }) => serveImage(path.key, demoAssetsDir, fs))
  }),
)

const ActivityGroupLive = HttpApiBuilder.group(Api, "activity", (handlers) =>
  Effect.gen(function* () {
    const activities = yield* ActivityService
    return handlers
      .handle("listActivities", ({ request }) => {
        const uid = activityCurrentUserId(request)
        return activities.listActivities(uid).pipe(
          Effect.map((list) => ({ data: list.map((view) => toActivityDto(view)) })),
          Effect.mapError(toApiError),
        )
      })
      .handle("listMyActivities", ({ request }) => {
        const uid = activityCurrentUserId(request)
        return activities.listMyActivities(uid).pipe(
          Effect.map((list) => ({ data: list.map((view) => toActivityDto(view)) })),
          Effect.mapError(toApiError),
        )
      })
      .handle("getActivity", ({ path, request }) => {
        const uid = activityCurrentUserId(request)
        return activities.getActivity(makeActivityId(path.id), uid).pipe(
          Effect.map((view) => ({ data: toActivityDetailDto(view) })),
          Effect.mapError(toApiError),
        )
      })
      .handle("createActivity", ({ payload, request }) => {
        const uid = activityCurrentUserId(request)
        return activities.create(payload, uid).pipe(
          Effect.map((view) => ({ data: toActivityDetailDto(view) })),
          Effect.mapError(toApiError),
        )
      })
      .handle("enrollActivity", ({ path, request }) => {
        const uid = activityCurrentUserId(request)
        return activities.enroll(makeActivityId(path.id), uid).pipe(
          Effect.map((view) => ({ data: toActivityDetailDto(view) })),
          Effect.mapError(toApiError),
        )
      })
      .handle("cancelActivity", ({ path, request }) => {
        const uid = activityCurrentUserId(request)
        return activities.cancelEnrollment(makeActivityId(path.id), uid).pipe(
          Effect.map((view) => ({ data: toActivityDetailDto(view) })),
          Effect.mapError(toApiError),
        )
      })
  }),
)

/**
 * 管理端鉴权：请求头 x-admin-token 必须等于 ADMIN_TOKEN 配置；
 * 未配置 ADMIN_TOKEN 时管理端点全部拒绝（安全默认）。
 */
const requireAdmin = (
  request: HttpServerRequest.HttpServerRequest,
): Effect.Effect<void, UnauthorizedError> =>
  Effect.gen(function* () {
    // Option<Option<string>>：外层为配置读取失败，内层为未配置 ADMIN_TOKEN
    const configured = Option.flatten(
      yield* Config.option(Config.string("ADMIN_TOKEN")).pipe(Effect.option),
    )
    const provided = Headers.get(request.headers, "x-admin-token")
    if (Option.isNone(configured) || Option.getOrUndefined(provided) !== configured.value) {
      return yield* Effect.fail(
        new UnauthorizedError({ message: "管理员令牌缺失或不正确" }),
      )
    }
  })

/** 管理端错误映射：UnauthorizedError 保持 401，其余归一为 ApiError */
const toAdminError = <E>(error: E): ApiError | UnauthorizedError =>
  error instanceof UnauthorizedError ? error : toApiError(error)

const AdminGroupLive = HttpApiBuilder.group(Api, "admin", (handlers) =>
  Effect.gen(function* () {
    const groupBuy = yield* GroupBuyService
    return handlers
      .handle("createFilm", ({ request, payload }) =>
        requireAdmin(request).pipe(
          Effect.andThen(() => groupBuy.createFilm(payload)),
          Effect.map((film) => ({ data: toFilmCatalogDetailDto(film) })),
          Effect.mapError(toAdminError),
        ),
      )
      .handle("updateFilm", ({ path, request, payload }) =>
        requireAdmin(request).pipe(
          Effect.andThen(() => groupBuy.updateFilm(makeFilmId(path.filmId), payload)),
          Effect.map((film) => ({ data: toFilmCatalogDetailDto(film) })),
          Effect.mapError(toAdminError),
        ),
      )
      .handle("setFilmCover", ({ path, request, payload }) =>
        requireAdmin(request).pipe(
          Effect.andThen(() =>
            groupBuy.setFilmCover(makeFilmId(path.filmId), {
              fromPath: payload.file.path,
              name: payload.file.name,
              contentType: payload.file.contentType,
            }),
          ),
          Effect.map((film) => ({ data: toFilmCatalogDetailDto(film) })),
          Effect.mapError(toAdminError),
        ),
      )
  }),
)

/** activity：仓储按 DATABASE_URL 切换（未配置回落到内存仓储，含种子数据） */
const ActivityPersistenceLive = Layer.unwrapEffect(
  Config.option(Config.string("DATABASE_URL")).pipe(
    Effect.map((url) =>
      Option.isSome(url) ? ActivityRepositorySql.pipe(Layer.provide(DbLive)) : ActivityRepositoryInMemory,
    ),
  ),
)

const ActivityLive = ActivityService.Default.pipe(
  Layer.provide(ActivityPersistenceLive),
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

/** groupbuy film：仓储按 DATABASE_URL 切换（SQL 版空表自动种子；未配置回落内存） */
const FilmPersistenceLive = Layer.unwrapEffect(
  Config.option(Config.string("DATABASE_URL")).pipe(
    Effect.map((url) =>
      Option.isSome(url) ? FilmRepositorySql.pipe(Layer.provide(DbLive)) : FilmRepositoryInMemory,
    ),
  ),
)

const ApiLive = HttpApiBuilder.api(Api).pipe(
  Layer.provide(HealthGroupLive),
  Layer.provide(IdentityGroupLive),
  Layer.provide(GroupBuyGroupLive),
  Layer.provide(ActivityGroupLive),
  Layer.provide(AdminGroupLive),
  Layer.provide(UserService.Default),
  Layer.provide(PersistenceLive),
  // groupbuy：hub/拼团进度用内存仓储；film 仓储按 DATABASE_URL 切换（管理端编辑持久化）
  Layer.provide(GroupBuyService.Default),
  Layer.provide(HubRepositoryInMemory),
  Layer.provide(FilmPersistenceLive),
  Layer.provide(GroupBuyRepositoryInMemory),
  Layer.provide(ImageStorageLocal),
  Layer.provide(NodeFileSystem.layer),
  Layer.provide(NodePath.layer),
  // activity：仓储按 DATABASE_URL 切换（内存 / SQL）
  Layer.provide(ActivityLive),
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
