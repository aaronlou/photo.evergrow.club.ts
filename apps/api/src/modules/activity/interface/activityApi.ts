import { Option, Schema } from "effect"
import { Headers, HttpApiEndpoint, HttpApiGroup } from "@effect/platform"
import type { HttpServerRequest } from "@effect/platform"

import { ApiError } from "../../../interface/apiError.js"
import type { ActivityView } from "../application/activityService.js"

/**
 * 当前用户身份（占位实现）：从 x-user-id 请求头读取，未登录默认 demo-user。
 * 后续接入 identity 上下文会话（微信登录）后替换。
 */
export const currentUserId = (request: HttpServerRequest.HttpServerRequest): string =>
  Option.getOrElse(Headers.get(request.headers, "x-user-id"), () => "demo-user")

export const activityStatusSchema = Schema.Literal("NotStarted", "Open", "Full", "Closed", "Ended")
export type activityStatusSchema = Schema.Schema.Type<typeof activityStatusSchema>

// ===== DTO（与 packages/contracts 保持同步） =====

export const ActivityDto = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  coverImageUrl: Schema.String,
  location: Schema.String,
  startAt: Schema.String,
  endAt: Schema.String,
  capacity: Schema.Int,
  participantCount: Schema.Int,
  joinedByMe: Schema.Boolean,
  status: activityStatusSchema,
})
export type ActivityDto = Schema.Schema.Type<typeof ActivityDto>

export const ActivityDetailDto = Schema.Struct({
  ...ActivityDto.fields,
  description: Schema.String,
  signupStartAt: Schema.String,
  signupEndAt: Schema.String,
  createdBy: Schema.String,
})
export type ActivityDetailDto = Schema.Schema.Type<typeof ActivityDetailDto>

/** 创建活动请求体（日期为 ISO 字符串） */
export const ActivityCreatePayload = Schema.Struct({
  name: Schema.String,
  description: Schema.String,
  location: Schema.String,
  coverImageUrl: Schema.String,
  startAt: Schema.String,
  endAt: Schema.String,
  signupStartAt: Schema.String,
  signupEndAt: Schema.String,
  capacity: Schema.Int,
})
export type ActivityCreatePayload = Schema.Schema.Type<typeof ActivityCreatePayload>

// ===== 映射 =====

export const toActivityDto = (view: ActivityView): ActivityDto => ({
  id: view.activity.id,
  name: view.activity.name,
  coverImageUrl: view.activity.coverImageUrl,
  location: view.activity.location,
  startAt: view.activity.startAt.toISOString(),
  endAt: view.activity.endAt.toISOString(),
  capacity: view.activity.capacity,
  participantCount: view.participantCount,
  joinedByMe: view.joinedByMe,
  status: view.status,
})

export const toActivityDetailDto = (view: ActivityView): ActivityDetailDto => ({
  ...toActivityDto(view),
  description: view.activity.description,
  signupStartAt: view.activity.signupStartAt.toISOString(),
  signupEndAt: view.activity.signupEndAt.toISOString(),
  createdBy: view.activity.createdBy,
})

// ===== HTTP API（自动生成 OpenAPI） =====

export const ActivityApi = HttpApiGroup.make("activity")
  .add(
    HttpApiEndpoint.get("listActivities", "/activities")
      .addSuccess(Schema.Struct({ data: Schema.Array(ActivityDto) }))
      .addError(ApiError),
  )
  .add(
    HttpApiEndpoint.get("listMyActivities", "/mine")
      .addSuccess(Schema.Struct({ data: Schema.Array(ActivityDto) }))
      .addError(ApiError),
  )
  .add(
    HttpApiEndpoint.get("getActivity", "/activities/:id")
      .setPath(Schema.Struct({ id: Schema.String }))
      .addSuccess(Schema.Struct({ data: ActivityDetailDto }))
      .addError(ApiError),
  )
  .add(
    HttpApiEndpoint.post("createActivity", "/activities")
      .setPayload(ActivityCreatePayload)
      .addSuccess(Schema.Struct({ data: ActivityDetailDto }))
      .addError(ApiError),
  )
  .add(
    HttpApiEndpoint.post("enrollActivity", "/activities/:id/enroll")
      .setPath(Schema.Struct({ id: Schema.String }))
      .addSuccess(Schema.Struct({ data: ActivityDetailDto }))
      .addError(ApiError),
  )
  .add(
    HttpApiEndpoint.post("cancelActivity", "/activities/:id/cancel")
      .setPath(Schema.Struct({ id: Schema.String }))
      .addSuccess(Schema.Struct({ data: ActivityDetailDto }))
      .addError(ApiError),
  )
