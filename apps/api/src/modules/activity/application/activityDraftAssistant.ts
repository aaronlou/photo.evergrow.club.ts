import { Clock, Effect } from "effect"

import type { ActivityDraft, DraftChatInput } from "../domain/aiExtractor.js"
import { ActivityDraftExtractor } from "../domain/aiExtractor.js"

/** 聊天结果（与 contracts 的 ActivityDraftChatResult 对应，日期为 ISO 字符串） */
export interface DraftChatResult {
  draft: ActivityDraft
  reply: string
  missing: ReadonlyArray<string>
  complete: boolean
  /** 提取来源（可观测性：排查是规则版还是哪个 LLM 模型生成的回复） */
  source: { engine: "llm" | "rule"; model?: string }
}

/** 必填字段清单（业务规则：与表单提交的必填项一致） */
const REQUIRED: ReadonlyArray<[keyof ActivityDraft, string]> = [
  ["name", "活动名称"],
  ["location", "活动地点"],
  ["startAt", "活动开始时间"],
  ["endAt", "活动结束时间"],
  ["signupStartAt", "报名开始时间"],
  ["signupEndAt", "报名截止时间"],
  ["capacity", "名额上限"],
]

/**
 * 针对性追问：结合已有草稿，针对第一个缺失字段给出具体、可操作的引导。
 * 比如缺"活动名称"且已有地点 → 「给活动起个名字吧，比如「徐家汇公园摄影活动」？」
 */
const followUpFor = (missing: ReadonlyArray<string>, draft: ActivityDraft): string | null => {
  const first = missing[0]
  switch (first) {
    case "活动名称": {
      const hint = draft.location ? `，比如「${draft.location}摄影活动」` : "，比如「周末胶片外拍」"
      return `还差活动名称——给活动起个名字吧${hint}？`
    }
    case "活动地点":
      return "活动在哪里办？比如「杭州西湖」或「徐家汇公园」。"
    case "活动开始时间":
      return "活动定在什么时间？比如「本周六下午两点」或「9月20日 14点」。"
    case "名额上限":
      return "名额限制多少人？比如「20人」或「十来个人」。"
    default:
      return first ? `还差：${first}。` : null
  }
}

/**
 * ActivityDraftAssistant 用例层：对话式创建的编排。
 * 职责：调提取端口 → 合并草稿 → 判定完备性（业务规则）→ 生成针对性追问。
 * 无会话状态：草稿由前端持有、随每轮请求携带。
 */
export class ActivityDraftAssistant extends Effect.Service<ActivityDraftAssistant>()(
  "ActivityDraftAssistant",
  {
    effect: Effect.gen(function* () {
      const extractor = yield* ActivityDraftExtractor

      return {
        chat: (input: { message: string; draft: ActivityDraft }): Effect.Effect<DraftChatResult> =>
          Effect.gen(function* () {
            const now = new Date(yield* Clock.currentTimeMillis)
            const chatInput: DraftChatInput = { message: input.message, draft: input.draft, now }

            const { patch, reply, engine, model } = yield* extractor.extract(chatInput)

            // 浅合并：本轮新识别的字段覆盖旧值（用户改主意时以最新说法为准）
            const merged: ActivityDraft = { ...input.draft, ...patch }

            const missing = REQUIRED.filter(([key]) => {
              const v = merged[key]
              return v === undefined || v === ""
            }).map(([, label]) => label)

            const complete = missing.length === 0
            // 未完备时，追加针对第一个缺失字段的具体追问（比泛泛的"没听懂"有效得多）
            const followUp = complete ? null : followUpFor(missing, merged)
            const finalReply = complete
              ? `${reply} 信息已经齐了，检查一下草稿确认无误就可以发布。`
              : followUp
                ? `${reply} ${followUp}`
                : reply

            return { draft: merged, reply: finalReply, missing, complete, source: { engine, model } }
          }),
      }
    }),
  },
) {}
