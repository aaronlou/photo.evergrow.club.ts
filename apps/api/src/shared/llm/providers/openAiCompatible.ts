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
  Effect.gen(function* () {
    const baseUrl = input.baseUrl ?? settings.baseUrl
    if (!baseUrl || baseUrl.trim() === "") {
      // 防御：baseUrl 为空会拼出 "/chat/completions" 这种解析不了的 URL（谜之报错）
      return yield* Effect.fail(
        toLlmError("openai-compatible")(
          new Error("接入点 baseUrl 为空：请配置 LLM_BASE_URL 或在模型配置中填写自定义接入点"),
        ),
      )
    }
    return yield* Effect.tryPromise({
      try: async () => {
        const res = await fetch(`${baseUrl}/chat/completions`, {
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
          // 4096：思考型模型（DeepSeek V4 / o 系列）的 reasoning 会消耗 token 预算，
          // 1024 容易被 thinking 吃光导致 content 为空（curl 无限制则正常——实测根因）
          max_tokens: input.maxTokens ?? 4096,
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
  })

/** 从响应中取出文本；格式不符时给出明确错误（不同提供商字段偶有差异） */
const pickText = (
  raw: unknown,
): Effect.Effect<string, LlmError> => {
  const choice = (raw as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]
  const text = choice?.message?.content
  if (text && text.trim()) return Effect.succeed(text.trim())
  // ★ 报错自带响应结构预览（可观测性）：下次在 [LLM] 日志直接看到真实结构，不用猜/另测
  const preview = JSON.stringify(raw).slice(0, 400)
  return Effect.fail(
    toLlmError("openai-compatible")(
      new Error(`LLM 响应中未找到文本（choices[0].message.content 为空）。响应结构: ${preview}`),
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
