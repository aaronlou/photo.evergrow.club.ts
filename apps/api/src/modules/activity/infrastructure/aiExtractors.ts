import { Effect, Layer } from "effect"

import type { ActivityDraft, DraftChatInput, DraftExtraction } from "../domain/aiExtractor.js"
import { ActivityDraftExtractor } from "../domain/aiExtractor.js"

/**
 * 规则解析适配器（零外部依赖，默认装配）。
 *
 * 能力边界（诚实声明）：
 * - 识别「字段名：值」格式（如「地点：徐家汇公园」「名额：20」）
 * - 识别「数字+人」→ 名额（如「限 30 人」）
 * - 识别常见中文时间表达（明天/后天/X月X日 + X点[半]）→ 活动开始时间，
 *   并按合理默认补全其余时间（结束 = 开始 + 3 小时，报名窗口 = 现在 ~ 活动开始前 2 小时）
 * - 自由文本的语义理解（如"下周六下午在公园拍人像，大概二十个人"）是 LLM 适配器的职责，
 *   规则版识别不到的字段一律追问，不猜测
 */

/** 把 "X点[半]"、"X:Y" 组合到某个日期上 */
const withTime = (date: Date, hours: number, minutes: number): Date => {
  const d = new Date(date)
  d.setHours(hours, minutes, 0, 0)
  return d
}

/** 解析常见中文时间表达；失败返回 null */
export const parseChineseDateTime = (text: string, now: Date): Date | null => {
  const t = text.replace(/\s+/g, "")
  // ISO / datetime-local
  const iso = Date.parse(t)
  if (!Number.isNaN(iso) && /\d{4}-\d{2}-\d{2}/.test(t)) return new Date(iso)

  // 相对日：今天/明天/后天/大后天 + 可选时间
  const dayOffsetMap: Array<[RegExp, number]> = [
    [/今天|今晚/, 0],
    [/明天/, 1],
    [/后天/, 2],
    [/大后天/, 3],
  ]
  const timeMatch = t.match(/(\d{1,2})[点:：时](半|(\d{1,2})分?)?/)
  const hours = timeMatch ? Number(timeMatch[1]) : null
  const minutes = timeMatch ? (timeMatch[2] === "半" ? 30 : Number(timeMatch[3] ?? 0)) : 0

  for (const [re, offset] of dayOffsetMap) {
    if (re.test(t)) {
      const base = new Date(now)
      base.setDate(base.getDate() + offset)
      return hours !== null ? withTime(base, hours, minutes) : withTime(base, 14, 0)
    }
  }

  // 绝对日：X月X日 + 可选时间（年份取当前或下一年）
  const md = t.match(/(\d{1,2})月(\d{1,2})[日号]/)
  if (md) {
    const month = Number(md[1]) - 1
    const day = Number(md[2])
    const year = new Date(now).getFullYear()
    let base = new Date(year, month, day)
    if (base.getTime() < now.getTime() - 24 * 3600 * 1000) {
      base = new Date(year + 1, month, day) // 已过去 → 下一年
    }
    return hours !== null ? withTime(base, hours, minutes) : withTime(base, 14, 0)
  }

  return null
}

/** 「字段名：值」提取（中英文冒号，字段名模糊匹配） */
const extractLabeledFields = (message: string): ActivityDraft => {
  const patch: Record<string, string> = {}
  const labelMap: Array<[RegExp, keyof ActivityDraft]> = [
    [/活动名(?:称)?|名称|主题/, "name"],
    [/介绍|描述|详情|说明/, "description"],
    [/地点|位置|地址|集合(?:点)?/, "location"],
    [/封面/, "coverImageUrl"],
    [/名额|人数上限|人数/, "capacity"],
    [/活动开始|开始时间|开始/, "startAt"],
    [/活动结束|结束时间|结束/, "endAt"],
    [/报名(?:开始)?/, "signupStartAt"],
    [/报名截止|报名结束/, "signupEndAt"],
  ]
  const re = /([^，。；;\n]{1,8})[：:]\s*([^，。；;\n]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(message)) !== null) {
    const label = m[1]
    const value = m[2].trim()
    for (const [pattern, field] of labelMap) {
      if (pattern.test(label) && value) {
        patch[field] = value
        break
      }
    }
  }
  return patch as ActivityDraft
}

export const RuleBasedDraftExtractor = Layer.succeed(
  ActivityDraftExtractor,
  ActivityDraftExtractor.make({
    extract: (input: DraftChatInput): Effect.Effect<DraftExtraction> =>
      Effect.sync(() => {
        const { message, draft, now } = input
        const found: ActivityDraft = { ...extractLabeledFields(message) }

        // 「数字 + 人」→ 名额
        const cap = message.match(/(\d{1,4})\s*人/)
        if (cap) found.capacity = Number(cap[1])

        // 时间：本轮话语里的第一个可解析时间 → 活动开始；并补全配套时间
        const start = parseChineseDateTime(message, now)
        if (start && !draft.startAt) {
          const end = new Date(start.getTime() + 3 * 60 * 60 * 1000)
          const signupEnd = new Date(start.getTime() - 2 * 60 * 60 * 1000)
          found.startAt = start.toISOString()
          found.endAt = end.toISOString()
          found.signupStartAt = now.toISOString()
          found.signupEndAt = signupEnd.toISOString()
        }

        // 字段名 → 中文标签（回复面向用户，不暴露内部字段名）
        const fieldLabels: Record<string, string> = {
          name: "活动名称",
          description: "活动介绍",
          location: "活动地点",
          coverImageUrl: "封面图",
          startAt: "活动开始时间",
          endAt: "活动结束时间",
          signupStartAt: "报名开始时间",
          signupEndAt: "报名截止时间",
          capacity: "名额上限",
        }
        const extracted = Object.keys(found)
          .filter((k) => k !== "description" || found.description)
          .map((k) => fieldLabels[k] ?? k)
        const reply =
          extracted.length > 0
            ? `好的，我记下了：${extracted.join("、")}。`
            : "这句话里我没有识别到明确的字段信息。你可以用「字段：值」的方式告诉我，比如「地点：徐家汇公园」「名额：20」或「活动时间：9月20日 14点」。"

        return { patch: found, reply }
      }),
  }),
)
