/**
 * 前后端共享的 API 契约类型（仅类型，无运行时代码）。
 *
 * 骨架阶段为手写 DTO；M1 完成后端 HttpApi 的 OpenAPI 导出后，
 * 将改用 codegen（openapi-typescript）自动生成，消除手工同步。
 */

/** GET /api/health 响应 */
export interface HealthDto {
  status: "ok"
  timestamp: string
}

/** 用户 DTO（对应 identity 上下文 /api/identity/users） */
export interface UserDto {
  id: string
  phone: string
  nickname: string
  avatarUrl: string
  status: "Active" | "Disabled"
}

/** 通用接口错误 */
export interface ApiErrorDto {
  code: string
  message: string
}
