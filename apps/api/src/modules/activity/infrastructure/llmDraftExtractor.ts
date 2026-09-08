import { Effect, Either, Layer, Option } from "effect"

import { LlmClient } from "../../../shared/llm/llmClient.js"
import { LlmModelRepository } from "../../../shared/llm/modelRepository.js"
import type { ActivityDraft, DraftChatInput, DraftExtraction } from "../domain/aiExtractor.js"
import { ActivityDraftExtractor } from "../domain/aiExtractor.js"

/**
 * LLM 版草稿提取器：把用户的自然语言翻译成结构化字段补丁。
 *
 * 工程要点（LLM 是概率性系统，代码必须防御）：
 * 1. 系统提示词 = 给 AI 的接口文档：明确字段集合、输出格式、以及"不要编造"
 * 2. 输出要求严格 JSON（含 patch 与 reply），避免解析自由文本
 * 3. 防御式解析：容忍 ```json 围栏、多余解释文字；解析失败不崩溃，降级为"没听懂，请再说一次"
 * 4. 字段白名单过滤：AI 胡乱加的字段（如 id/status）一律丢弃
 */

/** 允许提取的字段（白名单：AI 返回的其它 key 一律丢弃） */
const ALLOWED_FIELDS = [
  "name",
  "description",
  "location",
  "coverImageUrl",
  "startAt",
  "endAt",
  "signupStartAt",
  "signupEndAt",
  "capacity",
] as const satisfies ReadonlyArray<keyof ActivityDraft>

const SYSTEM_PROMPT = `你是一个专业的活动创建助手，为"摄影活动"从用户的自然语言中提取结构化字段。

严格要求：
1. 只输出一个 JSON 对象，不要任何解释文字，不要 Markdown 代码围栏。
2. JSON 结构固定为：{"patch": { ... }, "reply": "..."}
   - patch：本轮识别到的字段；key 只能取自这个集合（识别不到就不要输出该字段）：
     ${ALLOWED_FIELDS.join("、")}
   - reply：给用户的中文回复，30 字以内，确认已记录的内容，或自然地追问一项缺失信息。
3. 时间字段必须是带时区偏移的 ISO 8601 字符串，例如 2026-09-20T14:00:00+08:00。
   相对时间（"下周六下午两点"）请依据"当前时间"换算；只说了日期没说钟点的，活动开始默认 14:00。
   若用户只给了活动开始时间，请顺带给出合理的 endAt（开始 +3 小时）、signupStartAt（现在）、signupEndAt（活动开始前 2 小时）。
4. capacity 必须是整数（名额上限）；"二十来个人" → 20。
5. 【最重要】不要编造信息：用户没提到的字段绝对不要填，也不要根据常识补充地点或名称。
6. 如果用户这句话里没有任何可提取的字段，输出 {"patch": {}, "reply": "抱歉，这句话里我没抓到活动信息，能再具体说说吗？"}`

/** 从 LLM 输出中稳健提取 JSON：容忍代码围栏与前后多余文字 */
const extractJsonObject = (raw: string): Record<string, unknown> | null => {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim()
  // 直接解析
  try {
    return JSON.parse(cleaned) as Record<string, unknown>
  } catch {
    // 退一步：截取第一个 { 到最后一个 } 之间
    const start = cleaned.indexOf("{")
    const end = cleaned.lastIndexOf("}")
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>
      } catch {
        return null
      }
    }
    return null
  }
}

const isNonEmptyString = (v: unknown): v is string => typeof v === "string" && v.trim() !== ""

/** 校验并过滤 AI 返回的字段，只保留白名单内且类型正确的值 */
const sanitizePatch = (raw: unknown): ActivityDraft => {
  const patch: Record<string, string | number> = {}
  if (!raw || typeof raw !== "object") return {}
  const source = raw as Record<string, unknown>

  for (const field of ALLOWED_FIELDS) {
    const value = source[field]
    if (value === undefined || value === null) continue

    if (field === "capacity") {
      // 容忍 "20" 这类字符串数字
      const n = typeof value === "number" ? value : Number(value)
      if (Number.isInteger(n) && n > 0 && n <= 9999) patch[field] = n
      continue
    }
    if (!isNonEmptyString(value)) continue

    // 时间字段：必须是可解析的日期
    if (field.endsWith("At")) {
      const ms = Date.parse(value)
      if (Number.isNaN(ms)) continue
      patch[field] = new Date(ms).toISOString()
      continue
    }
    patch[field] = value
  }
  return patch as ActivityDraft
}

export const LlmDraftExtractor = Layer.effect(
  ActivityDraftExtractor,
  Effect.gen(function* () {
    const llm = yield* LlmClient
    const modelRepo = yield* LlmModelRepository

    return ActivityDraftExtractor.make({
      extract: (input: DraftChatInput): Effect.Effect<DraftExtraction> =>
        Effect.gen(function* () {
          const nowIso = input.now.toISOString()
          const userContent = [
            `当前时间：${nowIso}（用户所在时区按 +08:00 理解）`,
            `已有草稿（JSON，可为空对象）：${JSON.stringify(input.draft)}`,
            `用户本轮说的话：${input.message}`,
          ].join("\n")

          // 读取当前默认模型（管理端 llm_models 表）；无默认时回落环境变量 LLM_MODEL
          const currentModel = yield* modelRepo.findDefault().pipe(
            Effect.catchAll(() => Effect.succeed(Option.none())),
          )
          const override = Option.match(currentModel, {
            onNone: () => ({
              model: undefined as string | undefined,
              baseUrl: undefined as string | undefined,
              temperature: undefined as number | undefined,
            }),
            onSome: (m) => ({
              model: m.model,
              baseUrl: m.baseUrl !== "" ? m.baseUrl : undefined, // 模型记录可自定义接入点
              temperature: m.temperature,
            }),
          })

          // 端口契约是"不失败的提取"：AI 不可用属降级场景而非业务失败——
          // 助手挂了不该让"创建活动"整体不可用，所以这里显式转为降级分支
          const result = yield* llm
            .complete({
              messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: userContent },
              ],
              model: override.model, // 页面改默认模型 → 下次调用自动生效，无需重启
              baseUrl: override.baseUrl, // 模型记录可自定义接入点（官方换地址时运营自助修改）
              temperature: override.temperature ?? 0.2, // 字段提取要稳定、可复现，压低发散度
            })
            .pipe(Effect.either)

          if (Either.isLeft(result)) {
            return {
              patch: {},
              reply: "助手暂时没能响应，请稍后再试；你也可以直接改用表单填写。",
            }
          }
          const text = result.right

          const parsed = extractJsonObject(text)
          if (!parsed) {
            // 降级：AI 没按格式输出，不猜、不崩，直接请用户再说一次
            return {
              patch: {},
              reply: "抱歉，我刚才没理解清楚。你可以换个说法，或者用「地点：徐家汇公园」这样的格式告诉我。",
            }
          }

          const patch = sanitizePatch(parsed["patch"])
          const aiReply = typeof parsed["reply"] === "string" ? parsed["reply"].trim() : ""
          const reply =
            aiReply || (Object.keys(patch).length > 0 ? "好的，已记录。" : "抱歉，这句话里我没抓到活动信息。")

          return { patch, reply }
        }),
    })
  }),
)
