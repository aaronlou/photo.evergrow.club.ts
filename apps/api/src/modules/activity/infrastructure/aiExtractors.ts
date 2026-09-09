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

/** 中文数字 → 阿拉伯数字（覆盖常见人数表达） */
const CN_NUM_MAP: Record<string, number> = {
  一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
  十: 10, 十一: 11, 十二: 12, 十五: 15, 二十: 20, 三十: 30, 五十: 50, 一百: 100,
}

const parseCnNumber = (raw: string): number | null => {
  const direct = CN_NUM_MAP[raw]
  if (direct !== undefined) return direct
  // 兜底："二十X"（如 "二十几"→ 20+）
  const m = raw.match(/^[一二两三四五六七八九]?十$/)
  if (m && raw.length === 2) return Number(raw[0] === "十" ? 1 : CN_NUM_MAP[raw[0]]) * 10
  return null
}

/** 星期几映射（中文/数字） */
const WEEKDAY_MAP: Record<string, number> = {
  日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6,
}

/** 解析常见中文时间表达；失败返回 null */
export const parseChineseDateTime = (text: string, now: Date): Date | null => {
  const t = text.replace(/\s+/g, "")
  // ISO / datetime-local
  const iso = Date.parse(t)
  if (!Number.isNaN(iso) && /\d{4}-\d{2}-\d{2}/.test(t)) return new Date(iso)

  const timeMatch = t.match(/(\d{1,2})[点:：时](半|(\d{1,2})分?)?/)
  const hours = timeMatch ? Number(timeMatch[1]) : null
  const minutes = timeMatch ? (timeMatch[2] === "半" ? 30 : Number(timeMatch[3] ?? 0)) : 0

  // 本周/下周/这周 周X（如「本周6」「下周六」「这周日下午」）
  const weekMatch = t.match(/(本周|下周|这周)?[周星期]([一二三四五六日天123456])/)
  if (weekMatch) {
    const target = WEEKDAY_MAP[weekMatch[2]]
    const today = now.getDay()
    let offset = (target - today + 7) % 7
    const isNextWeek = weekMatch[1] === "下周"
    if (isNextWeek) offset = offset === 0 ? 7 : offset + 7
    else if (offset === 0) offset = 0 // 本周且就是今天
    const base = new Date(now)
    base.setDate(base.getDate() + offset)
    return hours !== null ? withTime(base, hours, minutes) : withTime(base, 14, 0)
  }

  // 相对日：今天/明天/后天/大后天 + 可选时间
  const dayOffsetMap: Array<[RegExp, number]> = [
    [/今天|今晚/, 0],
    [/明天/, 1],
    [/后天/, 2],
    [/大后天/, 3]
  ]
  
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

/**
 * 从自由文本启发式提取地点：
 * 「在」开头 + 常见地名后缀词（公园/广场/湖/江/山/路/街/区/馆/店/里/园/场/湾/港）为止
 * 如「在滨江公园拍人像」→ 滨江公园；「在杭州西湖」→ 杭州西湖
 */
const LOCATION_SUFFIXES = "公园|广场|湖畔?|江边?|山|路|街|区|馆|店|里|园|场|湾|港|舍|亭|楼|塔|桥|村|镇|城"
const extractLocation = (message: string): string | null => {
  const m = message.match(new RegExp(`在([一-龥A-Za-z]{2,16}?(?:${LOCATION_SUFFIXES}))`))
  return m ? m[1] : null
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

        // 「数字 + 人」→ 名额（阿拉伯数字；「20个人」「20来个人」）
        const cap = message.match(/(\d{1,4})\s*[来多个]*\s*人/)
        if (cap) found.capacity = Number(cap[1])

        // 中文数字人数（「二十来个人」「十来个人」「十五人」）
        if (found.capacity === undefined) {
          const cnCap = message.match(/([一二两三四五六七八九]{1,3}|[一二三四五六七八九]?十)\s*[来多个]*\s*人/)
          if (cnCap) {
            const n = parseCnNumber(cnCap[1])
            if (n !== null) found.capacity = n
          }
        }

        // 启发式地点提取（「在滨江公园」「在杭州西湖」）
        if (found.location === undefined) {
          const loc = extractLocation(message)
          if (loc) found.location = loc
        }

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

        // 活动名称启发式：常见活动类型词（「摄影讨论会」「外拍」「分享会」…）
        // 优先用「进行/举办/组织 X」的 X（排除"本周日在杭州西湖区进行"这类前缀）
        if (found.name === undefined) {
          const types = "讨论会|交流会|分享会|讲座|沙龙|工作坊|外拍|约拍|扫街|徒步|展览"
          const withVerb = message.match(new RegExp(`(?:进行|举办|组织)([一-龥]{2,20}?(?:${types}))`))
          if (withVerb) {
            found.name = withVerb[1]
          } else {
            const typeMatch = message.match(new RegExp(`([一-龥]{2,20}?(?:${types}))`))
            if (typeMatch) found.name = typeMatch[1]
          }
        }

        // 活动介绍启发式：「主题是X」「内容是X」「以X为主」→ 整句作为介绍
        if (found.description === undefined && /主题是|内容是|以.+为主/.test(message)) {
          found.description = message.trim()
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

        // 回复要自然：识别到部分信息就给正面反馈，而不是机械报错
        let reply: string
        if (extracted.length > 0) {
          reply = `好的，我记下了：${extracted.join("、")}。`
        } else {
          reply =
            "我好像抓到了一些线索但还不太确定。你可以再具体说说吗？比如活动叫什么名字、在哪儿办、什么时候、多少人——我会边听边填好。"
        }

        return { patch: found, reply, engine: "rule" }
      }),
  }),
)
