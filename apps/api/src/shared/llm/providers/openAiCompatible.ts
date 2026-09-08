import { Effect, Layer } from "effect"

import type { LlmCompleteInput, LlmSettings , LlmError} from "../llmClient.js"
import { LlmClient, toLlmError } from "../llmClient.js"

/**
 * OpenAI 兼容适配器：POST {baseUrl}/chat/completions。
 * 一个实现覆盖绝大部分生态——DeepSeek、智谱 GLM、通义（兼容模式）、
 * Moonshot Kimi、Groq、本地 Ollama / vLLM 均支持该协议，
 * 只需用 LLM_BASE_URL / LLM_MODEL 指向目标。
 */

const TIMEOUT_MS = 30_000

const post = (
  settings: LlmSettings,
  input: LlmCompleteInput,
): Effect.Effect<unknown, LlmError> =>
  Effect.tryPromise({
    try: async () => {
      const res = await fetch(`${input.baseUrl ?? settings.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${settings.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          // 调用方可覆盖模型（管理端 llm_models 表热切换默认模型生效）；未传则回落环境变量默认
          model: input.model ?? settings.model,
          messages: input.messages,
          temperature: input.temperature ?? settings.temperature,
          max_tokens: input.maxTokens ?? 1024,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 300)}`)
      }
      return (await res.json()) as unknown
    },
    catch: toLlmError("openai-compatible"),
  })

/** 从响应中取出文本；格式不符时给出明确错误（不同提供商字段偶有差异） */
const pickText = (
  raw: unknown,
): Effect.Effect<string, LlmError> => {
  const choice = (raw as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]
  const text = choice?.message?.content
  return text && text.trim()
    ? Effect.succeed(text.trim())
    : Effect.fail(
        toLlmError("openai-compatible")(
          new Error("LLM 响应中未找到文本（choices[0].message.content 为空）"),
        ),
      )
}

export const openAiCompatibleLive = (settings: LlmSettings) =>
  Layer.succeed(
    LlmClient,
    LlmClient.make({
      complete: (input: LlmCompleteInput) =>
        post(settings, input).pipe(
          Effect.flatMap(pickText),
          Effect.mapError(toLlmError("openai-compatible")),
        ),
    }),
  )
