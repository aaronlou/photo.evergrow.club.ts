import type { HttpServerRequest } from "@effect/platform";
import { Headers, HttpApiBuilder } from "@effect/platform"
import { Config, Effect, Option } from "effect"

import { toApiError, UnauthorizedError } from "../apiError.js"
import { Api } from "../../api.js"
import { HubInUse } from "../../modules/groupbuy/domain/errors.js"
import { makeFilmId } from "../../modules/groupbuy/domain/film.js"
import { makeHubId } from "../../modules/groupbuy/domain/hub.js"
import { GroupBuyService } from "../../modules/groupbuy/application/groupBuyService.js"
import {
  toAdminHubDto,
  toFilmCatalogDetailDto,
} from "../../modules/groupbuy/interface/groupBuyApi.js"
import { UserService } from "../../modules/identity/application/userService.js"

/**
 * 管理端鉴权：请求头 x-admin-token 必须等于 ADMIN_TOKEN 配置；
 * 未配置 ADMIN_TOKEN 时管理端点全部拒绝（安全默认）。
 * 导出供"用户端点内嵌管理员权限分支"使用（如删除样片：上传者或管理员）。
 */
export const requireAdmin = (
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

/**
 * [审计日志] 管理操作结构化记录。
 * 当前写入进程日志（可被日志收集器聚合）；将来需要"审计查询"时，
 * 在此替换为落表实现（admin_audit 表），调用方零改动。
 */
const audit = (action: string, outcome: "ok" | "fail", detail: string): Effect.Effect<void> =>
  Effect.logInfo(`[审计] ${action} ${outcome === "ok" ? "✓" : "✗"} ${detail}`)

/**
 * ★ 管理端 handler 的唯一入口：鉴权 + 审计 + 错误收口。
 * 所有 admin 端点必须经由本包装器实现——绕过它的操作不会出现在审计日志中。
 */
const withAdmin = <A, E>(
  request: HttpServerRequest.HttpServerRequest,
  action: string,
  effect: Effect.Effect<A, E>,
): Effect.Effect<A, E | UnauthorizedError> =>
  requireAdmin(request).pipe(
    Effect.andThen(effect),
    Effect.tapBoth({
      onSuccess: () => audit(action, "ok", ""),
      onFailure: (e) =>
        audit(action, "fail", e instanceof Error ? e.message : String(e)),
    }),
  )

/** 管理端错误映射：UnauthorizedError 保持 401，其余归一为 ApiError */
const toAdminError = <E>(error: E): UnauthorizedError | ReturnType<typeof toApiError> =>
  error instanceof UnauthorizedError ? error : toApiError(error)

export const AdminGroupLive = HttpApiBuilder.group(Api, "admin", (handlers) =>
  Effect.gen(function* () {
    const groupBuy = yield* GroupBuyService
    const users = yield* UserService
    return handlers
      // ----- 用户管理 -----
      .handle("listUsers", ({ request }) =>
        withAdmin(request, "用户列表", users.listUsers()).pipe(
          Effect.map((list) => ({
            data: {
              total: list.length,
              items: list.map((user) => ({
                id: user.id,
                phone: user.phone,
                nickname: user.nickname,
                status: user.status,
                hasPassword: user.hasPassword(),
                createdAt: user.createdAt.toISOString(),
              })),
            },
          })),
          Effect.mapError(toAdminError),
        ),
      )
      // ----- 位置点管理 -----
      .handle("listHubs", ({ request }) =>
        withAdmin(request, "位置点列表", groupBuy.listHubs("admin")).pipe(
          Effect.map((hubs) => ({ data: hubs.map((hub) => toAdminHubDto(hub)) })),
          Effect.mapError(toAdminError),
        ),
      )
      .handle("createHub", ({ request, payload }) =>
        withAdmin(request, "新增位置点", groupBuy.createHub(payload)).pipe(
          Effect.map((hub) => ({ data: toAdminHubDto(hub) })),
          Effect.mapError(toAdminError),
        ),
      )
      .handle("updateHub", ({ path, request, payload }) =>
        withAdmin(request, `编辑位置点 ${path.hubId}`, groupBuy.updateHub(makeHubId(path.hubId), payload)).pipe(
          Effect.map((hub) => ({ data: toAdminHubDto(hub) })),
          Effect.mapError(toAdminError),
        ),
      )
      .handle("deleteHub", ({ path, request }) =>
        withAdmin(request, `删除位置点 ${path.hubId}`, groupBuy.deleteHub(makeHubId(path.hubId))).pipe(
          Effect.map(() => ({ data: { deleted: true } })),
          // 409 HubInUse 保持原始错误类型（带正确状态码），其余归一为 ApiError
          Effect.mapError((e) => (e instanceof HubInUse ? e : toAdminError(e))),
        ),
      )
      // ----- 商品管理 -----
      .handle("createFilm", ({ request, payload }) =>
        withAdmin(request, `新增商品 ${payload.name}`, groupBuy.createFilm(payload)).pipe(
          Effect.map((film) => ({ data: toFilmCatalogDetailDto(film) })),
          Effect.mapError(toAdminError),
        ),
      )
      .handle("updateFilm", ({ path, request, payload }) =>
        withAdmin(request, `编辑商品 ${path.filmId}`, groupBuy.updateFilm(makeFilmId(path.filmId), payload)).pipe(
          Effect.map((film) => ({ data: toFilmCatalogDetailDto(film) })),
          Effect.mapError(toAdminError),
        ),
      )
      .handle("setFilmCover", ({ path, request, payload }) =>
        withAdmin(
          request,
          `更换封面 ${path.filmId}`,
          groupBuy.setFilmCover(makeFilmId(path.filmId), {
            fromPath: payload.file.path,
            name: payload.file.name,
            contentType: payload.file.contentType,
          }),
        ).pipe(
          Effect.map((film) => ({ data: toFilmCatalogDetailDto(film) })),
          Effect.mapError(toAdminError),
        ),
      )
  }),
)
