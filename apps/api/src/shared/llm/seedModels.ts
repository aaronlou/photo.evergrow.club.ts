import type { LlmProvider } from "./model.js"

/**
 * LLM 模型目录种子（各厂商公开文档中的主流模型快照）。
 *
 * 重要说明：
 * - 这是**知识快照**，厂商会持续上新品/下线旧型号；管理页可随时增删改，
 *   种子只在"缺失该 id"时补齐，绝不覆盖管理员的编辑。
 * - 只登记 OpenAI 兼容 / Anthropic 协议下可直接使用的模型标识（model id）。
 * - temperature 为推荐值：字段提取类任务偏低（稳定），reasoning 类模型设 0（多数忽略该参数）。
 */

export interface SeedLlmModel {
  provider: LlmProvider
  /** 模型标识，需与厂商文档一致（填错会调用失败） */
  model: string
  /** 管理页展示名（中文，便于运营选择） */
  label: string
  temperature: number
}

/** 初始化时作为默认的那条（在没有任何配置时才生效） */
export const DEFAULT_SEED_MODEL_ID = "openai-gpt-4o-mini"

export const seedLlmModels: ReadonlyArray<SeedLlmModel> = [
  // ===== OpenAI =====
  { provider: "openai", model: "gpt-4o-mini", label: "GPT-4o mini（便宜、快，日常首选）", temperature: 0.2 },
  { provider: "openai", model: "gpt-4o", label: "GPT-4o（综合能力强）", temperature: 0.3 },
  { provider: "openai", model: "gpt-4.1-mini", label: "GPT-4.1 mini（新一代轻量）", temperature: 0.2 },
  { provider: "openai", model: "gpt-4.1", label: "GPT-4.1（新一代旗舰）", temperature: 0.3 },

  // ===== Anthropic（Claude，用 -latest 别名自动指向当前最新版本） =====
  { provider: "anthropic", model: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku（最快最省）", temperature: 0.2 },
  { provider: "anthropic", model: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet（均衡）", temperature: 0.3 },
  { provider: "anthropic", model: "claude-3-7-sonnet-latest", label: "Claude 3.7 Sonnet（推理强）", temperature: 0.3 },

  // ===== DeepSeek（官方文档已更新为 V4 系列，模型 ID 会随版本自动升级） =====
  { provider: "deepseek", model: "deepseek-v4-flash", label: "DeepSeek V4 Flash（快、便宜）", temperature: 0.2 },
  { provider: "deepseek", model: "deepseek-v4-pro", label: "DeepSeek V4 Pro（强）", temperature: 0.3 },
  { provider: "deepseek", model: "deepseek-v4-flash-vision-exp", label: "DeepSeek V4 Flash Vision（实验，支持图片）", temperature: 0.2 },

  // ===== 通义千问（阿里云 DashScope，OpenAI 兼容模式） =====
  { provider: "qwen", model: "qwen-turbo", label: "通义千问 Turbo（快、便宜）", temperature: 0.2 },
  { provider: "qwen", model: "qwen-plus", label: "通义千问 Plus（均衡）", temperature: 0.3 },
  { provider: "qwen", model: "qwen-max", label: "通义千问 Max（旗舰）", temperature: 0.3 },
  { provider: "qwen", model: "qwen-long", label: "通义千问 Long（超长上下文）", temperature: 0.3 },
  { provider: "qwen", model: "qwen-vl-max", label: "通义千问 VL Max（多模态，支持图像）", temperature: 0.2 },

  // ===== 腾讯混元 =====
  { provider: "tencent", model: "hunyuan-turbo", label: "混元 Turbo（旗舰，复杂任务）", temperature: 0.3 },
  { provider: "tencent", model: "hunyuan-large", label: "混元 Large（超大，通用）", temperature: 0.3 },
  { provider: "tencent", model: "hunyuan-pro", label: "混元 Pro（性能成本均衡）", temperature: 0.3 },
  { provider: "tencent", model: "hunyuan-standard", label: "混元 Standard（快、便宜）", temperature: 0.2 },
  { provider: "tencent", model: "hunyuan-standard-256k", label: "混元 Standard 256K（超长上下文）", temperature: 0.3 },
  { provider: "tencent", model: "hunyuan-vision", label: "混元 Vision（多模态，支持图像）", temperature: 0.2 },
]

/** 与 modelService.create 保持一致的 id 规则：provider-slug + model-slug */
export const seedModelId = (s: SeedLlmModel): string =>
  `${s.provider}-${s.model
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}`
