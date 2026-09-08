import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, Multipart } from "@effect/platform"
import { Schema } from "effect"

import { ApiError, UnauthorizedError } from "../apiError.js"
import { HubInUse } from "../../modules/groupbuy/domain/errors.js"
import { FilmCatalogDetailDto } from "../../modules/groupbuy/interface/groupBuyApi.js"

/**
 * 运营后台门面（跨上下文）：聚合 groupbuy / identity 各上下文的管理用例。
 * 本目录不属于任何限界上下文——admin 没有自己的聚合与领域规则，
 * 只做"暴露 + 鉴权 + 审计 + 编排"；业务规则仍归属各模块的 application 层。
 *
 * 鉴权约定：所有端点必须经由 adminHandlers.ts 的 withAdmin 包装（统一校验 x-admin-token
 * 并记录审计日志）。绕过 withAdmin 的操作不会出现在审计日志中——以约定 + 审计兜底，
 * 待 Effect 版本提供 HttpApiBuilder.middlewareSecurity 后升级为框架级强制。
 */

// ===== DTO =====

/** [管理端] 位置点视图：含状态与创建时间（用户侧 HubDto 不暴露这些） */
export const AdminHubDto = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  city: Schema.String,
  address: Schema.String,
  status: Schema.Literal("Active", "Closed"),
  memberCount: Schema.Int,
  /** ISO 8601 字符串 */
  createdAt: Schema.String,
})
export type AdminHubDto = Schema.Schema.Type<typeof AdminHubDto>

/** [管理端] 注册用户视图：含注册时间与密码设置状态（绝不包含密码密文） */
export const AdminUserDto = Schema.Struct({
  id: Schema.String,
  phone: Schema.String,
  nickname: Schema.String,
  status: Schema.Literal("Active", "Disabled"),
  hasPassword: Schema.Boolean,
  /** ISO 8601 字符串 */
  createdAt: Schema.String,
})
export type AdminUserDto = Schema.Schema.Type<typeof AdminUserDto>

// ===== [管理端] 商品负载 =====

/** 更新商品文案：仅传的字段生效 */
const AdminUpdateFilmPayload = Schema.Struct({
  description: Schema.optional(Schema.String),
  features: Schema.optional(Schema.Array(Schema.String)),
  scenarios: Schema.optional(Schema.Array(Schema.String)),
})

/** 封面图上传（multipart：file 部分为图片文件） */
const AdminCoverUploadPayload = HttpApiSchema.Multipart(
  Schema.Struct({
    file: Multipart.SingleFileSchema,
  }),
)

/** 新增商品的必填/选填字段（ID 由服务端生成） */
const AdminCreateFilmPayload = Schema.Struct({
  name: Schema.String,
  brand: Schema.String,
  format: Schema.Literal("135", "120"),
  iso: Schema.Int,
  process: Schema.String,
  basePriceInCents: Schema.Int,
  threshold: Schema.Int,
  groupBuyPriceInCents: Schema.Int,
  coverImageUrl: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  features: Schema.optional(Schema.Array(Schema.String)),
  scenarios: Schema.optional(Schema.Array(Schema.String)),
})

/** 运营后台 HTTP API（统一前缀 /admin，自动生成 OpenAPI） */
export const AdminApi = HttpApiGroup.make("admin")
  // ----- 用户管理（identity 上下文） -----
  .add(
    HttpApiEndpoint.get("listUsers", "/identity/users")
      .addSuccess(
        Schema.Struct({
          data: Schema.Struct({
            total: Schema.Int,
            items: Schema.Array(AdminUserDto),
          }),
        }),
      )
      .addError(ApiError)
      .addError(UnauthorizedError),
  )
  // ----- 位置点管理（groupbuy 上下文） -----
  .add(
    HttpApiEndpoint.get("listHubs", "/groupbuy/hubs")
      .addSuccess(Schema.Struct({ data: Schema.Array(AdminHubDto) }))
      .addError(ApiError)
      .addError(UnauthorizedError),
  )
  .add(
    HttpApiEndpoint.post("createHub", "/groupbuy/hubs")
      .setPayload(Schema.Struct({ name: Schema.String, city: Schema.String, address: Schema.String }))
      .addSuccess(Schema.Struct({ data: AdminHubDto }))
      .addError(ApiError)
      .addError(UnauthorizedError),
  )
  .add(
    HttpApiEndpoint.patch("updateHub", "/groupbuy/hubs/:hubId")
      .setPath(Schema.Struct({ hubId: Schema.String }))
      .setPayload(
        Schema.Struct({
          name: Schema.optional(Schema.String),
          city: Schema.optional(Schema.String),
          address: Schema.optional(Schema.String),
          status: Schema.optional(Schema.Literal("Active", "Closed")),
        }),
      )
      .addSuccess(Schema.Struct({ data: AdminHubDto }))
      .addError(ApiError)
      .addError(UnauthorizedError),
  )
  .add(
    HttpApiEndpoint.del("deleteHub", "/groupbuy/hubs/:hubId")
      .setPath(Schema.Struct({ hubId: Schema.String }))
      .addSuccess(Schema.Struct({ data: Schema.Struct({ deleted: Schema.Boolean }) }))
      .addError(ApiError)
      .addError(UnauthorizedError)
      .addError(HubInUse),
  )
  // ----- 商品管理（groupbuy 上下文） -----
  .add(
    HttpApiEndpoint.post("createFilm", "/groupbuy/films")
      .setPayload(AdminCreateFilmPayload)
      .addSuccess(Schema.Struct({ data: FilmCatalogDetailDto }))
      .addError(ApiError)
      .addError(UnauthorizedError),
  )
  .add(
    HttpApiEndpoint.patch("updateFilm", "/groupbuy/films/:filmId")
      .setPath(Schema.Struct({ filmId: Schema.String }))
      .setPayload(AdminUpdateFilmPayload)
      .addSuccess(Schema.Struct({ data: FilmCatalogDetailDto }))
      .addError(ApiError)
      .addError(UnauthorizedError),
  )
  .add(
    HttpApiEndpoint.post("setFilmCover", "/groupbuy/films/:filmId/cover")
      .setPath(Schema.Struct({ filmId: Schema.String }))
      .setPayload(AdminCoverUploadPayload)
      .addSuccess(Schema.Struct({ data: FilmCatalogDetailDto }))
      .addError(ApiError)
      .addError(UnauthorizedError),
  )
