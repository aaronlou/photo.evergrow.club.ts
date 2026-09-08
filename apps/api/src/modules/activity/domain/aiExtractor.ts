import { Effect } from "effect"

/**
 * 活动草稿：对话式创建的中间产物。
 * 可空字段 = 尚未确定；与 packages/contracts 的 ActivityDraft 保持同步。
 */
export interface ActivityDraft {
  name?: string
  description?: string
  location?: string
  coverImageUrl?: string
  startAt?: string
  endAt?: string
  signupStartAt?: string
  signupEndAt?: string
  capacity?: number
}

export interface DraftChatInput {
  /** 用户这一轮说的话 */
  message: string
  /** 当前草稿（前端持有、随请求携带） */
  draft: ActivityDraft
  /** 当前时间：自然语言时间（"下周六下午"）解析的参照系 */
  now: Date
}

export interface DraftExtraction {
  /** 从本轮话语中提取出的字段（仅包含本轮新识别到的） */
  patch: ActivityDraft
  /** 面向用户的回复（汇报提取结果 / 追问） */
  reply: string
  /** 提取引擎标识（可观测性：排查"这次回复是谁给的"——规则版还是哪个 LLM） */
  engine: "llm" | "rule"
  /** 引擎为 llm 时的模型标识（规则版无此字段） */
  model?: string
}

/**
 * ActivityDraftExtractor 端口：把自然语言提取为活动草稿字段。
 * 实现两版：规则解析（无外部依赖，默认）/ LLM（配 API key 后切换），
 * 组合根按环境装配——业务代码对"用哪种 AI"完全无感。
 */
export class ActivityDraftExtractor extends Effect.Service<ActivityDraftExtractor>()(
  "ActivityDraftExtractor",
  {
    effect: Effect.gen(function* () {
      return {
        extract: (_input: DraftChatInput): Effect.Effect<DraftExtraction> =>
          Effect.gen(function* () {
            return yield* Effect.die("ActivityDraftExtractor 未装配：组合根需提供真实实现")
          }),
      }
    }),
  },
) {}
