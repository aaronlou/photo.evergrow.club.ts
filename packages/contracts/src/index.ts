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

// ===== groupbuy 上下文（胶卷团购） =====

/** 团购位置点 */
export interface HubDto {
  id: string
  name: string
  city: string
  address: string
  memberCount: number
  joinedByMe: boolean
}

/** 胶卷商品（列表项，含拼团进度） */
export interface FilmDto {
  id: string
  name: string
  brand: string
  format: string
  iso: number
  process: string
  basePriceInCents: number
  groupBuyPriceInCents: number
  threshold: number
  memberCount: number
  joinedByMe: boolean
  sampleImageCount: number
}

/** 冲洗样片 */
export interface SampleImageDto {
  id: string
  url: string
  uploadedBy: string
}

/** 胶卷商品详情 */
export interface FilmDetailDto extends FilmDto {
  features: string[]
  scenarios: string[]
  sampleImages: SampleImageDto[]
}

/** 拼团进度 */
export interface GroupProgressDto {
  hubId: string
  filmId: string
  memberCount: number
  threshold: number
  status: "Open" | "Succeeded"
  remaining: number
  joinedByMe: boolean
}
