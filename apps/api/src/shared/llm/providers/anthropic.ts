import { Effect, Layer } from "effect"

import type { LlmCompleteInput, LlmSettings , LlmError} from "../llmClient.js"
import { LlmClient, toLlmError } from "../llmClient.js"

/**
 * Anthropic（Claude）适配器：POST {baseUrl}/v1/messages。
 * 与 OpenAI 协议的差异全部封装在这里：
 * - 鉴权头是 x-api-key，且必须带 anthropic-version
 * - system 提示是独立字段，不能混进 messages
 * - 响应文本在 content[] 的 text 块里
 */

const TIMEOUT_MS = 30_000
const ANTHROPIC_VERSION = "2023-06-01"

const post = (
  settings: LlmSettings,
  input: LlmCompleteInput,
): Effect.Effect<unknown, LlmError> =>
  Effect.tryPromise({
    try: async () => {
      const system = input.messages
        .filter((m) => m.role === "system")
        .map((m) => m.content)
        .join("\n\n")
      const messages = input.messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role, content: m.content }))

      const res = await fetch(`${input.baseUrl ?? settings.baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "x-api-key": settings.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: input.model ?? settings.model,
          max_tokens: input.maxTokens ?? 1024,
          temperature: input.temperature ?? settings.temperature,
          ...(system ? { system } : {}),
          messages,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 300)}`)
      }
      return (await res.json()) as unknown
    },
    catch: toLlmError("anthropic"),
  })

const pickText = (
  raw: unknown,
): Effect.Effect<string, LlmError> => {
  const blocks = (raw as { content?: Array<{ type?: string; text?: string }> })?.content
  const text = blocks?.filter((b) => b.type === "text").map((b) => b.text ?? "").join("")
  return text && text.trim()
    ? Effect.succeed(text.trim())
    : Effect.fail(
        toLlmError("anthropic")(new Error("LLM 响应中未找到文本（content[].text 为空）")),
      )
}

export const anthropicLive = (settings: LlmSettings) =>
  Layer.succeed(
    LlmClient,
    LlmClient.make({
      complete: (input: LlmCompleteInput) =>
        post(settings, input).pipe(
          Effect.flatMap(pickText),
          Effect.mapError(toLlmError("anthropic")),
        ),
    }),
  )
