import { HttpApiSchema } from "@effect/platform"
import { Schema } from "effect"

/**
 * 接口层统一错误 DTO：领域错误在 handler 内被映射为 ApiError，
 * 避免把领域错误细节直接暴露给 HTTP 客户端。
 * 使用 Schema.TaggedError：既是可抛出的领域错误，又自带 Schema（可被 addError/OpenAPI 使用）。
 */
export class ApiError extends Schema.TaggedError<ApiError>("ApiError")("ApiError", {
  code: Schema.String,
  message: Schema.String,
}) {}

/** 管理端鉴权失败（HTTP 401） */
export class UnauthorizedError extends Schema.TaggedError<UnauthorizedError>()(
  "UnauthorizedError",
  { message: Schema.String },
  HttpApiSchema.annotations({ status: 401 }),
) {}

export const toApiError = (error: unknown): ApiError => {
  if (error instanceof Error) {
    const tag = Reflect.get(error, "_tag")
    const code = typeof tag === "string" ? tag : "INTERNAL_ERROR"
    return new ApiError({ code, message: error.message })
  }
  return new ApiError({ code: "INTERNAL_ERROR", message: String(error) })
}
