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

/** [管理端] 位置点视图：含状态与创建时间（用户侧 HubDto 不暴露这些） */
export interface AdminHubDto {
  id: string
  name: string
  city: string
  address: string
  status: "Active" | "Closed"
  memberCount: number
  /** ISO 8601 日期字符串 */
  createdAt: string
}

/** [管理端] 新增位置点（ID 由服务端生成） */
export interface CreateHubInput {
  name: string
  city: string
  address: string
}

/** [管理端] 注册用户视图：含注册时间与密码设置状态（绝不包含密码密文） */
export interface AdminUserDto {
  id: string
  phone: string
  nickname: string
  status: "Active" | "Disabled"
  hasPassword: boolean
  /** ISO 8601 日期字符串 */
  createdAt: string
}

/** [管理端] 注册用户列表（含统计） */
export interface AdminUsersDto {
  total: number
  items: AdminUserDto[]
}

/** 支持的 LLM 提供商（与后端 shared/llm/model.ts 的 LlmProvider 保持同步） */
export type LlmProviderDto = "openai" | "anthropic" | "deepseek" | "qwen" | "tencent" | "custom"

/** [管理端] LLM 模型配置（不含任何密钥；baseUrl 空 = 使用默认接入点） */
export interface AdminLlmModelDto {
  id: string
  provider: LlmProviderDto
  model: string
  label: string
  /** 自定义接入点（空 = 回落环境变量/厂商默认） */
  baseUrl: string
  temperature: number
  enabled: boolean
  isDefault: boolean
  createdAt: string
}

/** [管理端] LLM 模型列表 + 当前接入点（接入点来自环境变量，用于提示模型兼容性） */
export interface AdminLlmModelsDto {
  items: AdminLlmModelDto[]
  endpoint: {
    provider: string
    baseUrl: string
    fallbackModel: string
  }
}

/** [管理端] 更新位置点（仅传的字段生效） */
export interface UpdateHubInput {
  name?: string
  city?: string
  address?: string
  status?: "Active" | "Closed"
}

/** 胶卷商品（列表项，含拼团进度） */
export interface FilmDto {
  id: string
  name: string
  brand: string
  format: string
  iso: number
  process: string
  coverImageUrl: string
  basePriceInCents: number
  groupBuyPriceInCents: number
  threshold: number
  memberCount: number
  participantCount: number
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
  description: string
  features: string[]
  scenarios: string[]
  sampleImages: SampleImageDto[]
}

/** 商品目录项（不依赖位置点，无拼团进度字段） */
export interface FilmCatalogDto {
  id: string
  name: string
  brand: string
  format: string
  iso: number
  process: string
  coverImageUrl: string
  basePriceInCents: number
  groupBuyPriceInCents: number
  threshold: number
  sampleImageCount: number
  /** 胶卷特性 */
  features: string[]
  /** 适用场景 */
  scenarios: string[]
}

/** 商品目录详情（不依赖位置点） */
export interface FilmCatalogDetailDto extends FilmCatalogDto {
  description: string
  features: string[]
  scenarios: string[]
  sampleImages: SampleImageDto[]
}

/** [管理端] 更新商品文案（仅传的字段生效） */
export interface UpdateFilmInput {
  description?: string
  features?: string[]
  scenarios?: string[]
}

/** 登录请求 */
export interface LoginInput {
  phone: string
  password: string
}

/** 登录成功响应：不透明令牌 + 用户信息 */
export interface LoginSuccessDto {
  token: string
  user: UserDto
}

/** [管理端] 新增商品（ID 由服务端生成；价格单位：分） */
export interface CreateFilmInput {
  name: string
  brand: string
  format: "135" | "120"
  iso: number
  process: string
  basePriceInCents: number
  threshold: number
  groupBuyPriceInCents: number
  coverImageUrl?: string
  description?: string
  features?: string[]
  scenarios?: string[]
}

/** 拼团进度 */
export interface GroupProgressDto {
  hubId: string
  filmId: string
  /** 累计件数（成团判定依据） */
  memberCount: number
  /** 参与人数 */
  participantCount: number
  threshold: number
  status: "Open" | "Succeeded"
  /** 还差多少件成团 */
  remaining: number
  joinedByMe: boolean
  /** 我的购买数量 */
  myQuantity: number
  /** 成交单价（成团价，单位：分） */
  unitPriceInCents: number
  /** 商品总金额（数量 × 单价） */
  totalInCents: number
  /** 订金（总金额 × 10%） */
  depositInCents: number
  depositPaid: boolean
  /** 服务模式：货到付款 */
  deliveryMode: "COD"
}

// ===== activity 上下文（活动与报名） =====

/** 活动状态：NotStarted(未开始报名)/Open(报名中)/Full(已满)/Closed(已截止)/Ended(已结束) */
export type ActivityStatusDto = "NotStarted" | "Open" | "Full" | "Closed" | "Ended"

/** 活动列表项 */
export interface ActivityDto {
  id: string
  name: string
  coverImageUrl: string
  location: string
  startAt: string
  endAt: string
  capacity: number
  participantCount: number
  joinedByMe: boolean
  status: ActivityStatusDto
}

/** 活动详情 */
export interface ActivityDetailDto extends ActivityDto {
  description: string
  signupStartAt: string
  signupEndAt: string
  createdBy: string
}

/** 创建活动请求（日期为 ISO 字符串） */
export interface CreateActivityInput {
  name: string
  description: string
  location: string
  coverImageUrl: string
  startAt: string
  endAt: string
  signupStartAt: string
  signupEndAt: string
  capacity: number
}

/**
 * [AI 对话式创建] 活动草稿：可空字段 = 尚未确定。
 * AI 只负责"填草稿"，最终提交仍走 createActivity（业务规则只校验一次）。
 */
export interface ActivityDraft {
  name?: string
  description?: string
  location?: string
  coverImageUrl?: string
  /** ISO 8601 字符串 */
  startAt?: string
  endAt?: string
  signupStartAt?: string
  signupEndAt?: string
  capacity?: number
}

/** [AI 对话式创建] 单轮对话请求（草稿由前端持有，后端无状态） */
export interface ActivityDraftChatInput {
  message: string
  /** 当前草稿（可为空对象） */
  draft: ActivityDraft
}

/** [AI 对话式创建] 单轮对话响应 */
export interface ActivityDraftChatResult {
  /** 合并后的最新草稿 */
  draft: ActivityDraft
  /** 助手回复（提取结果汇报 / 追问） */
  reply: string
  /** 仍缺失的必填字段（中文标签） */
  missing: string[]
  /** 草稿是否完备（可提交） */
  complete: boolean
}
