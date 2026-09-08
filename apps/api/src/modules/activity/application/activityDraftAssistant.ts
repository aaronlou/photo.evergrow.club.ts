import { Clock, Effect } from "effect"

import type { ActivityDraft, DraftChatInput } from "../domain/aiExtractor.js"
import { ActivityDraftExtractor } from "../domain/aiExtractor.js"

/** 聊天结果（与 contracts 的 ActivityDraftChatResult 对应，日期为 ISO 字符串） */
export interface DraftChatResult {
  draft: ActivityDraft
  reply: string
  missing: ReadonlyArray<string>
  complete: boolean
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
 * ActivityDraftAssistant 用例层：对话式创建的编排。
 * 职责：调提取端口 → 合并草稿 → 判定完备性（业务规则）。
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

            const { patch, reply } = yield* extractor.extract(chatInput)

            // 浅合并：本轮新识别的字段覆盖旧值（用户改主意时以最新说法为准）
            const merged: ActivityDraft = { ...input.draft, ...patch }

            const missing = REQUIRED.filter(([key]) => {
              const v = merged[key]
              return v === undefined || v === ""
            }).map(([, label]) => label)

            const complete = missing.length === 0
            const finalReply = complete
              ? `${reply} 信息已经齐了，检查一下草稿确认无误就可以发布。`
              : reply

            return { draft: merged, reply: finalReply, missing, complete }
          }),
      }
    }),
  },
) {}
