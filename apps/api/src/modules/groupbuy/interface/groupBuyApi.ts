import { Headers, HttpApiEndpoint, HttpApiGroup, HttpApiSchema, Multipart } from "@effect/platform"
import type { HttpServerRequest } from "@effect/platform"
import { Option, Schema } from "effect"

import { ApiError } from "../../../interface/apiError.js"
import type { GroupProgress } from "../application/groupBuyService.js"
import type { Film } from "../domain/film.js"
import type { Hub } from "../domain/hub.js"

/**
 * 当前用户身份（占位实现）：从 x-user-id 请求头读取，未登录默认 demo-user。
 * 后续接入 identity 上下文会话（微信登录）后替换。
 */
export const currentUserId = (request: HttpServerRequest.HttpServerRequest): string =>
  Option.getOrElse(Headers.get(request.headers, "x-user-id"), () => "demo-user")

// ===== DTO（与 packages/contracts 保持同步） =====

export const HubDto = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  city: Schema.String,
  address: Schema.String,
  memberCount: Schema.Int,
  joinedByMe: Schema.Boolean,
})
export type HubDto = Schema.Schema.Type<typeof HubDto>

export const SampleImageDto = Schema.Struct({
  id: Schema.String,
  url: Schema.String,
  uploadedBy: Schema.String,
})
export type SampleImageDto = Schema.Schema.Type<typeof SampleImageDto>

export const FilmDto = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  brand: Schema.String,
  format: Schema.String,
  iso: Schema.Int,
  process: Schema.String,
  coverImageUrl: Schema.String,
  basePriceInCents: Schema.Int,
  groupBuyPriceInCents: Schema.Int,
  threshold: Schema.Int,
  memberCount: Schema.Int,
  participantCount: Schema.Int,
  joinedByMe: Schema.Boolean,
  sampleImageCount: Schema.Int,
})
export type FilmDto = Schema.Schema.Type<typeof FilmDto>

export const FilmDetailDto = Schema.Struct({
  ...FilmDto.fields,
  features: Schema.Array(Schema.String),
  scenarios: Schema.Array(Schema.String),
  sampleImages: Schema.Array(SampleImageDto),
})
export type FilmDetailDto = Schema.Schema.Type<typeof FilmDetailDto>

/** 商品目录项（不依赖位置点，无拼团进度字段） */
export const FilmCatalogDto = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  brand: Schema.String,
  format: Schema.String,
  iso: Schema.Int,
  process: Schema.String,
  coverImageUrl: Schema.String,
  basePriceInCents: Schema.Int,
  groupBuyPriceInCents: Schema.Int,
  threshold: Schema.Int,
  sampleImageCount: Schema.Int,
})
export type FilmCatalogDto = Schema.Schema.Type<typeof FilmCatalogDto>

export const FilmCatalogDetailDto = Schema.Struct({
  ...FilmCatalogDto.fields,
  features: Schema.Array(Schema.String),
  scenarios: Schema.Array(Schema.String),
  sampleImages: Schema.Array(SampleImageDto),
})
export type FilmCatalogDetailDto = Schema.Schema.Type<typeof FilmCatalogDetailDto>

export const GroupProgressDto = Schema.Struct({
  hubId: Schema.String,
  filmId: Schema.String,
  memberCount: Schema.Int,
  participantCount: Schema.Int,
  threshold: Schema.Int,
  status: Schema.String,
  remaining: Schema.Int,
  joinedByMe: Schema.Boolean,
  myQuantity: Schema.Int,
  unitPriceInCents: Schema.Int,
  totalInCents: Schema.Int,
  depositInCents: Schema.Int,
  depositPaid: Schema.Boolean,
  deliveryMode: Schema.Literal("COD"),
})
export type GroupProgressDto = Schema.Schema.Type<typeof GroupProgressDto>

// ===== 映射 =====

export const toHubDto = (hub: Hub, userId: string): HubDto => ({
  id: hub.id,
  name: hub.name,
  city: hub.city,
  address: hub.address,
  memberCount: hub.memberCount(),
  joinedByMe: hub.hasJoined(userId),
})

export const toFilmDto = (film: Film, progress: GroupProgress): FilmDto => ({
  id: film.id,
  name: film.name,
  brand: film.brand,
  format: film.format,
  iso: film.iso,
  process: film.process,
  coverImageUrl: film.coverImageUrl,
  basePriceInCents: film.basePriceInCents,
  groupBuyPriceInCents: film.deal.groupBuyPriceInCents,
  threshold: film.deal.threshold,
  memberCount: progress.memberCount,
  participantCount: progress.participantCount,
  joinedByMe: progress.joinedByMe,
  sampleImageCount: film.sampleImages.length,
})

export const toFilmDetailDto = (film: Film, progress: GroupProgress): FilmDetailDto => ({
  ...toFilmDto(film, progress),
  features: film.features,
  scenarios: film.scenarios,
  sampleImages: film.sampleImages,
})

export const toFilmCatalogDto = (film: Film): FilmCatalogDto => ({
  id: film.id,
  name: film.name,
  brand: film.brand,
  format: film.format,
  iso: film.iso,
  process: film.process,
  coverImageUrl: film.coverImageUrl,
  basePriceInCents: film.basePriceInCents,
  groupBuyPriceInCents: film.deal.groupBuyPriceInCents,
  threshold: film.deal.threshold,
  sampleImageCount: film.sampleImages.length,
})

export const toFilmCatalogDetailDto = (film: Film): FilmCatalogDetailDto => ({
  ...toFilmCatalogDto(film),
  features: film.features,
  scenarios: film.scenarios,
  sampleImages: film.sampleImages,
})

export const toProgressDto = (progress: GroupProgress): GroupProgressDto => ({
  hubId: progress.hubId,
  filmId: progress.filmId,
  memberCount: progress.memberCount,
  participantCount: progress.participantCount,
  threshold: progress.threshold,
  status: progress.status,
  remaining: progress.remaining,
  joinedByMe: progress.joinedByMe,
  myQuantity: progress.myQuantity,
  unitPriceInCents: progress.unitPriceInCents,
  totalInCents: progress.totalInCents,
  depositInCents: progress.depositInCents,
  depositPaid: progress.depositPaid,
  deliveryMode: progress.deliveryMode,
})

// ===== HTTP API =====

/** 样片上传（multipart：file 部分为图片文件） */
const UploadPayload = HttpApiSchema.Multipart(
  Schema.Struct({
    file: Multipart.SingleFileSchema,
  }),
)

/** groupbuy 上下文 HTTP API（自动生成 OpenAPI） */
export const GroupBuyApi = HttpApiGroup.make("groupbuy")
  .add(
    HttpApiEndpoint.get("getHubs", "/hubs")
      .addSuccess(Schema.Struct({ data: Schema.Array(HubDto) }))
      .addError(ApiError),
  )
  .add(
    HttpApiEndpoint.post("joinHub", "/hubs/:id/join")
      .setPath(Schema.Struct({ id: Schema.String }))
      .addSuccess(Schema.Struct({ data: HubDto }))
      .addError(ApiError),
  )
  .add(
    HttpApiEndpoint.get("getFilms", "/hubs/:hubId/films")
      .setPath(Schema.Struct({ hubId: Schema.String }))
      .addSuccess(Schema.Struct({ data: Schema.Array(FilmDto) }))
      .addError(ApiError),
  )
  .add(
    HttpApiEndpoint.get("getFilm", "/hubs/:hubId/films/:filmId")
      .setPath(Schema.Struct({ hubId: Schema.String, filmId: Schema.String }))
      .addSuccess(Schema.Struct({ data: FilmDetailDto }))
      .addError(ApiError),
  )
  .add(
    HttpApiEndpoint.get("listAllFilms", "/films")
      .addSuccess(Schema.Struct({ data: Schema.Array(FilmCatalogDto) }))
      .addError(ApiError),
  )
  .add(
    HttpApiEndpoint.get("getFilmById", "/films/:filmId")
      .setPath(Schema.Struct({ filmId: Schema.String }))
      .addSuccess(Schema.Struct({ data: FilmCatalogDetailDto }))
      .addError(ApiError),
  )
  .add(
    HttpApiEndpoint.post("joinGroupBuy", "/hubs/:hubId/films/:filmId/join")
      .setPath(Schema.Struct({ hubId: Schema.String, filmId: Schema.String }))
      .setPayload(Schema.Struct({ quantity: Schema.Int }))
      .addSuccess(Schema.Struct({ data: GroupProgressDto }))
      .addError(ApiError),
  )
  .add(
    HttpApiEndpoint.post("payDeposit", "/hubs/:hubId/films/:filmId/pay-deposit")
      .setPath(Schema.Struct({ hubId: Schema.String, filmId: Schema.String }))
      .addSuccess(Schema.Struct({ data: GroupProgressDto }))
      .addError(ApiError),
  )
  .add(
    HttpApiEndpoint.get("getGroupProgress", "/hubs/:hubId/films/:filmId/progress")
      .setPath(Schema.Struct({ hubId: Schema.String, filmId: Schema.String }))
      .addSuccess(Schema.Struct({ data: GroupProgressDto }))
      .addError(ApiError),
  )
  .add(
    HttpApiEndpoint.post("uploadImage", "/films/:filmId/images")
      .setPath(Schema.Struct({ filmId: Schema.String }))
      .setPayload(UploadPayload)
      .addSuccess(Schema.Struct({ data: SampleImageDto }))
      .addError(ApiError),
  )
  .add(
    HttpApiEndpoint.get("getUploadedImage", "/images/:key")
      .setPath(Schema.Struct({ key: Schema.String }))
      .addError(ApiError),
  )
  .add(
    HttpApiEndpoint.get("getFilmCover", "/images/films/:key")
      .setPath(Schema.Struct({ key: Schema.String }))
      .addError(ApiError),
  )
  .add(
    HttpApiEndpoint.get("getDemoImage", "/images/demo/:key")
      .setPath(Schema.Struct({ key: Schema.String }))
      .addError(ApiError),
  )
