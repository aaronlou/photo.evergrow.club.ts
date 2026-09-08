import { Schema } from "effect"

/**
 * shared/llm/model.ts —— LLM 模型配置（通用域，跨上下文共享）。
 *
 * 边界说明（重要）：
 * - 这里只存"用哪个模型、用什么温度"等**运营决策**
 * - API Key 与接入点（baseUrl）不入库，仍来自环境变量——密钥属于基础设施，不进数据库泄露面
 * - 因此：本页管理的模型需要与当前 LLM_PROVIDER 指向的接入点兼容（页面会展示当前接入点提示）
 */

/**
 * 支持的模型提供商（单一事实来源：新增提供商只改这里 + defaultsFor + 协议映射）。
 * 除 anthropic 外，其余均为 OpenAI 兼容协议（/chat/completions）。
 */
export const LlmProvider = Schema.Literal(
  "openai",
  "anthropic",
  "deepseek",
  "qwen",
  "tencent",
  "custom",
)
export type LlmProvider = Schema.Schema.Type<typeof LlmProvider>

/** OpenAI 兼容协议的提供商（一个适配器覆盖） */
export const OPENAI_COMPATIBLE_PROVIDERS: ReadonlyArray<LlmProvider> = [
  "openai",
  "deepseek",
  "qwen",
  "tencent",
  "custom",
]

/** 提供商展示名（管理页下拉用） */
export const providerLabel = (p: LlmProvider): string =>
  ({
    openai: "OpenAI",
    anthropic: "Anthropic（Claude）",
    deepseek: "DeepSeek",
    qwen: "通义千问（Qwen）",
    tencent: "腾讯混元",
    custom: "自定义接入点",
  })[p]

export const LlmModelId = Schema.String.pipe(Schema.brand("LlmModelId"))
export type LlmModelId = Schema.Schema.Type<typeof LlmModelId>

export const makeLlmModelId = (raw: string): LlmModelId => Schema.decodeSync(LlmModelId)(raw)

/** 一个可选用的模型配置 */
export class LlmModel extends Schema.Class<LlmModel>("LlmModel")({
  id: LlmModelId,
  provider: LlmProvider,
  /** 模型标识（如 gpt-4o-mini、claude-3-5-sonnet-latest） */
  model: Schema.String,
  /** 展示名（如 "GPT-4o mini（便宜快）"） */
  label: Schema.String,
  /** 自定义接入点（可选；空串 = 回落环境变量/厂商默认） */
  baseUrl: Schema.String,
  temperature: Schema.Number,
  enabled: Schema.Boolean,
  /** 是否为当前默认模型（全局唯一，由仓储的 setDefault 保证） */
  isDefault: Schema.Boolean,
  createdAt: Schema.DateFromSelf,
}) {
  static create(input: {
    id: LlmModelId
    provider: LlmProvider
    model: string
    label: string
    baseUrl?: string
    temperature: number
    createdAt: Date
  }): LlmModel {
    return new LlmModel({
      ...input,
      baseUrl: input.baseUrl ?? "",
      enabled: true,
      isDefault: false,
    })
  }

  renameLabel(label: string): LlmModel {
    return new LlmModel({ ...this, label })
  }

  setBaseUrl(baseUrl: string): LlmModel {
    return new LlmModel({ ...this, baseUrl })
  }

  setTemperature(temperature: number): LlmModel {
    return new LlmModel({ ...this, temperature })
  }

  setEnabled(enabled: boolean): LlmModel {
    return new LlmModel({ ...this, enabled })
  }

  /** 本条成为默认；同时清除默认的行为由仓储统一处理（不变量唯一归属地） */
  markDefault(): LlmModel {
    return new LlmModel({ ...this, isDefault: true })
  }

  clearDefault(): LlmModel {
    return new LlmModel({ ...this, isDefault: false })
  }
}
