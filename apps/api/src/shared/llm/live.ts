import { Effect, Option } from "effect"
import type { Layer } from "effect"

import type { LlmClient, LlmSettings } from "./llmClient.js"
import { llmSettings } from "./llmClient.js"
import { anthropicLive } from "./providers/anthropic.js"
import { openAiCompatibleLive } from "./providers/openAiCompatible.js"

/**
 * LLM 装配工厂：按配置挑选提供商适配器。
 *
 * 新增一个提供商 = 在 providers/ 下加一个文件 + 这里加一个 case，
 * 上层业务（ActivityDraftExtractor 等）完全无感。
 *
 * 环境变量：
 *   LLM_PROVIDER   openai | anthropic | custom（必填，与 LLM_API_KEY 一起才算启用）
 *   LLM_API_KEY    对应平台的密钥（必填）
 *   LLM_BASE_URL   覆盖默认接入点（custom 必填；本地 Ollama 如 http://localhost:11434/v1）
 *   LLM_MODEL      覆盖默认模型
 *   LLM_TEMPERATURE 采样温度，默认 0.3（草稿提取要稳定，不宜发散）
 */
export const llmLive = (settings: LlmSettings): Layer.Layer<LlmClient> => {
  // 协议映射：只有 Anthropic 用自己的协议，其余（含国内三家与自定义）均为 OpenAI 兼容
  switch (settings.provider) {
    case "anthropic":
      return anthropicLive(settings)
    default:
      return openAiCompatibleLive(settings)
  }
}

/**
 * 组合根用的便捷装配：读取配置 → 有配置给 LLM 层，无配置返回 None。
 * 注意：不在此处硬编码"回落"——"没有 LLM 时怎么办"是各上下文自己的决策
 * （activity 选择回落到规则解析版，其它上下文可能选择直接报错）。
 */
export const llmLiveFromEnv: Effect.Effect<Option.Option<Layer.Layer<LlmClient>>> =
  llmSettings.pipe(Effect.map(Option.map(llmLive)))
