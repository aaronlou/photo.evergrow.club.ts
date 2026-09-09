import { Config, Effect, Option, Schema } from "effect"

import type { LlmProvider } from "./model.js"

/**
 * shared/llm —— LLM 防腐层（通用域）。
 *
 * 设计取舍：
 * - 端口只暴露"文本进文本出"的 complete —— 不为 streaming / function calling 预留参数，
 *   等真正需要时（且有第二个真实用例佐证）再扩展抽象。
 * - 用原生 fetch 而非 HttpClient：零额外依赖、行为直观；代价是拿不到框架内置的重试/熔断。
 *   将来需要这些能力时，替换适配器内部实现即可，调用方无感。
 */

export interface LlmMessage {
  readonly role: "system" | "user" | "assistant"
  readonly content: string
}

/** LLM 调用失败：各提供商的 HTTP 错误（限流/鉴权/网络/响应解析）统一映射为此错误 */
export class LlmError extends Schema.TaggedError<LlmError>("LlmError")("LlmError", {
  provider: Schema.String,
  message: Schema.String,
}) {}

export interface LlmCompleteInput {
  readonly messages: ReadonlyArray<LlmMessage>
  readonly temperature?: number
  readonly maxTokens?: number
  /** 覆盖默认模型（来自管理端 llm_models 表的当前默认）；不传则使用启动时装配的 LLM_MODEL */
  readonly model?: string
  /** 覆盖默认接入点（官方 baseUrl 可能变更时，运营在管理页修改）；不传则使用启动时装配的 LLM_BASE_URL */
  readonly baseUrl?: string
}

/**
 * LlmClient 端口：与模型提供商无关的"文本补全"。
 * 实现见 providers/，组合根按 LLM_* 环境变量装配。
 */
export class LlmClient extends Effect.Service<LlmClient>()("LlmClient", {
  effect: Effect.gen(function* () {
    return {
      complete: (_input: LlmCompleteInput): Effect.Effect<string, LlmError> =>
        Effect.gen(function* () {
          return yield* Effect.die("LlmClient 未装配：需提供提供商适配器")
        }),
    }
  }),
}) {}

/** LLM 配置（全部来自环境变量；provider 或 apiKey 缺失 → 视为未启用 LLM） */
export interface LlmSettings {
  provider: LlmProvider
  apiKey: string
  baseUrl: string
  model: string
  temperature: number
}

/**
 * 各提供商的默认接入点与默认模型。
 * 新增提供商时在此补一项（与 model.ts 的 LlmProvider 保持同步）。
 */
export const defaultsFor = (provider: LlmProvider, model?: string, baseUrl?: string) => {
  switch (provider) {
    case "anthropic":
      return { baseUrl: baseUrl ?? "https://api.anthropic.com", model: model ?? "claude-3-5-sonnet-latest" }
    case "deepseek":
      // 官方文档接入点（不带 /v1）；模型 ID 现行为 deepseek-v4-flash / deepseek-v4-pro
      return { baseUrl: baseUrl ?? "https://api.deepseek.com", model: model ?? "deepseek-v4-flash" }
    case "qwen":
      return {
        baseUrl: baseUrl ?? "https://dashscope.aliyuncs.com/compatible-mode/v1",
        model: model ?? "qwen-plus",
      }
    case "tencent":
      return {
        baseUrl: baseUrl ?? "https://api.hunyuan.cloud.tencent.com/v1",
        model: model ?? "hunyuan-turbo",
      }
    case "custom":
      // 自托管 / 兼容 OpenAI 的第三方：必须显式给出 baseUrl 与 model
      return { baseUrl: baseUrl ?? "", model: model ?? "" }
    default:
      return { baseUrl: baseUrl ?? "https://api.openai.com/v1", model: model ?? "gpt-4o-mini" }
  }
}

/**
 * 读取 LLM 配置：LLM_PROVIDER 与 LLM_API_KEY 是启用 LLM 的必要条件。
 * 返回 None 表示未启用 —— 组合根据此回落到零依赖的规则解析适配器。
 */
export const llmSettings: Effect.Effect<Option.Option<LlmSettings>> =
  Effect.all({
    provider: Config.option(Config.string("LLM_PROVIDER")),
    apiKey: Config.option(Config.string("LLM_API_KEY")),
    baseUrl: Config.option(Config.string("LLM_BASE_URL")),
    model: Config.option(Config.string("LLM_MODEL")),
    temperature: Config.option(Config.number("LLM_TEMPERATURE")),
  }).pipe(
    Effect.map((raw) => {
      const provider = Option.getOrUndefined(raw.provider)
      const apiKey = Option.getOrUndefined(raw.apiKey)
      if (!provider || !apiKey) return Option.none()
      // 未知 provider → 视为 openai 兼容（自定义接入点也走该协议）
      const normalized = (
        ["openai", "anthropic", "deepseek", "qwen", "tencent", "custom"] as ReadonlyArray<string>
      ).includes(provider)
        ? (provider as LlmProvider)
        : ("openai" as LlmProvider)
      // ★ 空串 = 未配置（docker compose 用 ${VAR:-} 会给容器注入 ""，
      //   Config 会把它判为"已配置"，从而用空串覆盖 defaultsFor 的默认接入点 → URL 拼接失败）
      const rawModel = Option.getOrUndefined(raw.model)
      const model = rawModel && rawModel.trim() !== "" ? rawModel : undefined
      const rawBase = Option.getOrUndefined(raw.baseUrl)
      const baseUrl = rawBase && rawBase.trim() !== "" ? rawBase : undefined
      const { baseUrl: resolvedBase, model: resolvedModel } = defaultsFor(normalized, model, baseUrl)
      return Option.some({
        provider: normalized,
        apiKey,
        baseUrl: resolvedBase,
        model: resolvedModel,
        temperature: Option.getOrUndefined(raw.temperature) ?? 0.3,
      })
    }),
    Effect.catchAll(() => Effect.succeed(Option.none<LlmSettings>())),
  )

/** 把底层异常统一包装为 LlmError，不向业务层泄漏 fetch/HTTP 细节 */
export const toLlmError = (provider: string) => (e: unknown): LlmError =>
  new LlmError({ provider, message: e instanceof Error ? e.message : String(e) })
