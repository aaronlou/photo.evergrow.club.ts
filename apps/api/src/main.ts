import type { HttpServerRequest} from "@effect/platform";
import { FileSystem, Headers, HttpServerResponse } from "@effect/platform"
import { Config, Effect, Either, Layer, Logger, Option } from "effect"
import { Clock } from "effect"
import { HttpApiBuilder, HttpApiSwagger } from "@effect/platform"
import { NodeFileSystem, NodeHttpServer, NodePath, NodeRuntime } from "@effect/platform-node"
import { createServer } from "node:http"
import { dirname, join, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

import { Api } from "./api.js"
import type { ApiError} from "./interface/apiError.js";
import { toApiError, UnauthorizedError } from "./interface/apiError.js"
import { currentUserId } from "./interface/auth.js"
import { SampleImageForbidden, SampleImageNotFound } from "./modules/groupbuy/domain/errors.js"
import { HubInUse } from "./modules/groupbuy/domain/errors.js"
import { ActivityService } from "./modules/activity/application/activityService.js"
import { makeActivityId } from "./modules/activity/domain/activity.js"
import { ActivityRepositoryInMemory } from "./modules/activity/infrastructure/activityRepositoryInMemory.js"
import { ActivityRepositorySql } from "./modules/activity/infrastructure/activityRepositorySql.js"
import {
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
import { HubRepositorySql } from "./modules/groupbuy/infrastructure/hubRepositorySql.js"
import {
  toAdminHubDto,
  toFilmCatalogDetailDto,
  toFilmCatalogDto,
  toFilmDetailDto,
  toFilmDto,
  toHubDto,
  toProgressDto,
} from "./modules/groupbuy/interface/groupBuyApi.js"
import { UserService } from "./modules/identity/application/userService.js"
import {
  InvalidCredentials,
  InvalidPassword,
  InvalidPhoneNumber,
  PhoneAlreadyRegistered,
  SessionInvalid,
  UserNotFound,
} from "./modules/identity/domain/errors.js"
import { makeUserId } from "./modules/identity/domain/user.js"
import { PasswordHasherScrypt } from "./modules/identity/infrastructure/passwordHasherScrypt.js"
import { SessionRepositoryInMemory } from "./modules/identity/infrastructure/sessionRepositoryInMemory.js"
import { SessionRepositorySql } from "./modules/identity/infrastructure/sessionRepositorySql.js"
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

/** 从 Authorization 头解析 Bearer 令牌（"Bearer <token>" → "<token>"），格式不符返回 undefined */
const bearerToken = (authorization: string | undefined): string | undefined =>
  authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : undefined

const IdentityGroupLive = HttpApiBuilder.group(Api, "identity", (handlers) =>
  Effect.gen(function* () {
    const users = yield* UserService
    return handlers
      .handle("getUser", ({ path }) =>
        users.getProfile(makeUserId(path.id)).pipe(
          Effect.map(toUserDto),
          Effect.map((data) => ({ data })),
          // UserNotFound 自带 404 注解，保持原错误；其余归一为 ApiError
          Effect.mapError((e) => (e instanceof UserNotFound ? e : toApiError(e))),
        ),
      )
      .handle("register", ({ payload }) =>
        users.register(payload).pipe(
          Effect.map(toUserDto),
          Effect.map((data) => ({ data })),
          // 409/400 语义的领域错误保持原错误，其余归一为 ApiError
          Effect.mapError((e) =>
            e instanceof PhoneAlreadyRegistered ||
            e instanceof InvalidPhoneNumber ||
            e instanceof InvalidPassword
              ? e
              : toApiError(e),
          ),
        ),
      )
      .handle("login", ({ payload }) =>
        users.login(payload).pipe(
          Effect.map(({ user, session }) => ({
            data: { token: session.token, user: toUserDto(user) },
          })),
          // InvalidCredentials 自带 401 注解，保持原错误；其余归一为 ApiError
          Effect.mapError((e) => (e instanceof InvalidCredentials ? e : toApiError(e))),
        ),
      )
      .handle("logout", ({ request }) =>
        users.logout(bearerToken(Option.getOrUndefined(Headers.get(request.headers, "authorization"))) ?? "").pipe(
          Effect.map(() => ({ data: { loggedOut: true } })),
          Effect.mapError(toApiError),
        ),
      )
      .handle("me", ({ request }) =>
        users.currentUser(bearerToken(Option.getOrUndefined(Headers.get(request.headers, "authorization"))) ?? "").pipe(
          Effect.map(toUserDto),
          Effect.map((data) => ({ data })),
          // SessionInvalid 自带 401 注解，保持原错误
          Effect.mapError((e) => (e instanceof SessionInvalid ? e : toApiError(e))),
        ),
      )
  }),
)

const GroupBuyGroupLive = HttpApiBuilder.group(Api, "groupbuy", (handlers) =>
  Effect.gen(function* () {
    const groupBuy = yield* GroupBuyService
    const users = yield* UserService
    const fs = yield* FileSystem.FileSystem
    return handlers
      .handle("getHubs", ({ request }) =>
        currentUserId(request, users).pipe(
          Effect.flatMap((uid) =>
            groupBuy.listHubs(uid).pipe(
              Effect.map((hubs) => ({ data: hubs.map((hub) => toHubDto(hub, uid)) })),
            ),
          ),
          Effect.mapError(toApiError),
        ),
      )
      .handle("joinHub", ({ path, request }) =>
        currentUserId(request, users).pipe(
          Effect.flatMap((uid) =>
            groupBuy.joinHub(uid, makeHubId(path.id)).pipe(
              Effect.map((hub) => ({ data: toHubDto(hub, uid) })),
            ),
          ),
          Effect.mapError(toApiError),
        ),
      )
      .handle("getFilms", ({ path, request }) =>
        currentUserId(request, users).pipe(
          Effect.flatMap((uid) =>
            groupBuy.listFilms(makeHubId(path.hubId), uid).pipe(
              Effect.map((items) => ({
                data: items.map(({ film, progress }) => toFilmDto(film, progress)),
              })),
            ),
          ),
          Effect.mapError(toApiError),
        ),
      )
      .handle("getFilm", ({ path, request }) =>
        currentUserId(request, users).pipe(
          Effect.flatMap((uid) =>
            groupBuy.getFilm(makeHubId(path.hubId), makeFilmId(path.filmId), uid).pipe(
              Effect.map(({ film, progress }) => ({ data: toFilmDetailDto(film, progress) })),
            ),
          ),
          Effect.mapError(toApiError),
        ),
      )
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
      .handle("joinGroupBuy", ({ path, request, payload }) =>
        currentUserId(request, users).pipe(
          Effect.flatMap((uid) =>
            groupBuy
              .joinGroupBuy(makeHubId(path.hubId), makeFilmId(path.filmId), uid, payload.quantity)
              .pipe(Effect.map((progress) => ({ data: toProgressDto(progress) }))),
          ),
          Effect.mapError(toApiError),
        ),
      )
      .handle("payDeposit", ({ path, request }) =>
        currentUserId(request, users).pipe(
          Effect.flatMap((uid) =>
            groupBuy
              .payDeposit(makeHubId(path.hubId), makeFilmId(path.filmId), uid)
              .pipe(Effect.map((progress) => ({ data: toProgressDto(progress) }))),
          ),
          Effect.mapError(toApiError),
        ),
      )
      .handle("getGroupProgress", ({ path, request }) =>
        currentUserId(request, users).pipe(
          Effect.flatMap((uid) =>
            groupBuy
              .getProgress(makeHubId(path.hubId), makeFilmId(path.filmId), uid)
              .pipe(Effect.map((progress) => ({ data: toProgressDto(progress) }))),
          ),
          Effect.mapError(toApiError),
        ),
      )
      .handle("uploadImage", ({ path, request, payload }) =>
        currentUserId(request, users).pipe(
          Effect.flatMap((uid) =>
            groupBuy
              .uploadSampleImage(makeFilmId(path.filmId), uid, {
                fromPath: payload.file.path,
                name: payload.file.name,
                contentType: payload.file.contentType,
              })
              .pipe(Effect.map((image) => ({ data: image }))),
          ),
          Effect.mapError(toApiError),
        ),
      )
      .handle("deleteSampleImage", ({ path, request }) =>
        currentUserId(request, users).pipe(
          Effect.flatMap((uid) =>
            Effect.either(requireAdmin(request)).pipe(
              Effect.flatMap((adminResult) =>
                groupBuy.removeSampleImage(
                  makeFilmId(path.filmId),
                  path.imageId,
                  uid,
                  Either.isRight(adminResult),
                ),
              ),
              Effect.map((film) => ({ data: toFilmCatalogDetailDto(film) })),
            ),
          ),
          // 403/404 保持原始错误类型（带正确状态码），其余归一为 ApiError
          Effect.mapError((e) =>
            e instanceof SampleImageForbidden || e instanceof SampleImageNotFound
              ? e
              : toApiError(e),
          ),
        ),
      )
      .handle("getUploadedImage", ({ path }) => serveImage(path.key, uploadsDir, fs))
      .handle("getFilmCover", ({ path }) => serveImage(path.key, filmAssetsDir, fs))
      .handle("getDemoImage", ({ path }) => serveImage(path.key, demoAssetsDir, fs))
  }),
)

const ActivityGroupLive = HttpApiBuilder.group(Api, "activity", (handlers) =>
  Effect.gen(function* () {
    const activities = yield* ActivityService
    const users = yield* UserService
    return handlers
      .handle("listActivities", ({ request }) =>
        currentUserId(request, users).pipe(
          Effect.flatMap((uid) =>
            activities.listActivities(uid).pipe(
              Effect.map((list) => ({ data: list.map((view) => toActivityDto(view)) })),
            ),
          ),
          Effect.mapError(toApiError),
        ),
      )
      .handle("listMyActivities", ({ request }) =>
        currentUserId(request, users).pipe(
          Effect.flatMap((uid) =>
            activities.listMyActivities(uid).pipe(
              Effect.map((list) => ({ data: list.map((view) => toActivityDto(view)) })),
            ),
          ),
          Effect.mapError(toApiError),
        ),
      )
      .handle("getActivity", ({ path, request }) =>
        currentUserId(request, users).pipe(
          Effect.flatMap((uid) =>
            activities.getActivity(makeActivityId(path.id), uid).pipe(
              Effect.map((view) => ({ data: toActivityDetailDto(view) })),
            ),
          ),
          Effect.mapError(toApiError),
        ),
      )
      .handle("createActivity", ({ payload, request }) =>
        currentUserId(request, users).pipe(
          Effect.flatMap((uid) =>
            activities.create(payload, uid).pipe(
              Effect.map((view) => ({ data: toActivityDetailDto(view) })),
            ),
          ),
          Effect.mapError(toApiError),
        ),
      )
      .handle("enrollActivity", ({ path, request }) =>
        currentUserId(request, users).pipe(
          Effect.flatMap((uid) =>
            activities.enroll(makeActivityId(path.id), uid).pipe(
              Effect.map((view) => ({ data: toActivityDetailDto(view) })),
            ),
          ),
          Effect.mapError(toApiError),
        ),
      )
      .handle("cancelActivity", ({ path, request }) =>
        currentUserId(request, users).pipe(
          Effect.flatMap((uid) =>
            activities.cancelEnrollment(makeActivityId(path.id), uid).pipe(
              Effect.map((view) => ({ data: toActivityDetailDto(view) })),
            ),
          ),
          Effect.mapError(toApiError),
        ),
      )
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
      .handle("listHubs", ({ request }) =>
        requireAdmin(request).pipe(
          Effect.andThen(() => groupBuy.listHubs("admin")),
          Effect.map((hubs) => ({ data: hubs.map((hub) => toAdminHubDto(hub)) })),
          Effect.mapError(toAdminError),
        ),
      )
      .handle("createHub", ({ request, payload }) =>
        requireAdmin(request).pipe(
          Effect.andThen(() => groupBuy.createHub(payload)),
          Effect.map((hub) => ({ data: toAdminHubDto(hub) })),
          Effect.mapError(toAdminError),
        ),
      )
      .handle("updateHub", ({ path, request, payload }) =>
        requireAdmin(request).pipe(
          Effect.andThen(() => groupBuy.updateHub(makeHubId(path.hubId), payload)),
          Effect.map((hub) => ({ data: toAdminHubDto(hub) })),
          Effect.mapError(toAdminError),
        ),
      )
      .handle("deleteHub", ({ path, request }) =>
        requireAdmin(request).pipe(
          Effect.andThen(() => groupBuy.deleteHub(makeHubId(path.hubId))),
          Effect.map(() => ({ data: { deleted: true } })),
          // 409 HubInUse 保持原始错误类型（带正确状态码），其余归一为 ApiError
          Effect.mapError((e) => (e instanceof HubInUse ? e : toAdminError(e))),
        ),
      )
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

/** identity session：仓储按 DATABASE_URL 切换（未配置回落内存，重启即失效） */
const SessionPersistenceLive = Layer.unwrapEffect(
  Config.option(Config.string("DATABASE_URL")).pipe(
    Effect.map((url) =>
      Option.isSome(url) ? SessionRepositorySql.pipe(Layer.provide(DbLive)) : SessionRepositoryInMemory,
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

/** groupbuy hub：仓储按 DATABASE_URL 切换（SQL 版空表自动种子；未配置回落内存） */
const HubPersistenceLive = Layer.unwrapEffect(
  Config.option(Config.string("DATABASE_URL")).pipe(
    Effect.map((url) =>
      Option.isSome(url) ? HubRepositorySql.pipe(Layer.provide(DbLive)) : HubRepositoryInMemory,
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
  // groupbuy：hub/film 仓储按 DATABASE_URL 切换（管理端编辑持久化）；拼团进度暂用内存仓储
  Layer.provide(GroupBuyService.Default),
  Layer.provide(HubPersistenceLive),
  Layer.provide(FilmPersistenceLive),
  Layer.provide(GroupBuyRepositoryInMemory),
  Layer.provide(ImageStorageLocal),
  Layer.provide(NodeFileSystem.layer),
  Layer.provide(NodePath.layer),
  // activity：仓储按 DATABASE_URL 切换（内存 / SQL）
  Layer.provide(ActivityLive),
  // IdGenerator 最后提供：满足前面所有 Default 层对它的依赖
  Layer.provide(IdGenerator.Default),
  // 密码哈希（scrypt）：身份认证的基础设施适配器
  Layer.provide(PasswordHasherScrypt),
  // 登录会话：仓储按 DATABASE_URL 切换
  Layer.provide(SessionPersistenceLive),
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
