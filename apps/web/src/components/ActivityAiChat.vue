<script setup lang="ts">
import { computed, ref } from "vue"
import { NButton, NInput, NSpin, NTag, useMessage } from "naive-ui"

import { api } from "@/api/client"
import type { ActivityDraft } from "@evergrow/contracts"

/**
 * 对话式创建活动：聊天 + 实时草稿预览。
 * 草稿由本组件持有（后端无状态），完备后 emit('complete', draft) 由父页面回填表单确认。
 */

const emit = defineEmits<{ (e: "complete", draft: ActivityDraft): void }>()
const message = useMessage()

interface ChatMsg {
  role: "user" | "assistant"
  text: string
  /** 提取来源（排查用：规则版 or LLM 模型名） */
  source?: string
}

const msgs = ref<ChatMsg[]>([
  {
    role: "assistant",
    text: "告诉我你想办什么活动吧～比如：「下周六下午在滨江公园拍人像，大概二十个人」。我会边聊边帮你填好活动信息，缺什么我再追问。",
  },
])

const input = ref("")
const sending = ref(false)
const draft = ref<ActivityDraft>({})
const missing = ref<string[]>([])
const complete = ref(false)

/** 草稿预览的字段定义（顺序与表单一致） */
const previewFields = computed(() => [
  { key: "name", label: "活动名称", value: draft.value.name },
  { key: "description", label: "活动介绍", value: draft.value.description },
  { key: "location", label: "活动地点", value: draft.value.location },
  { key: "startAt", label: "活动开始", value: fmtTime(draft.value.startAt) },
  { key: "endAt", label: "活动结束", value: fmtTime(draft.value.endAt) },
  { key: "signupStartAt", label: "报名开始", value: fmtTime(draft.value.signupStartAt) },
  { key: "signupEndAt", label: "报名截止", value: fmtTime(draft.value.signupEndAt) },
  {
    key: "capacity",
    label: "名额上限",
    value: draft.value.capacity !== undefined ? `${draft.value.capacity} 人` : undefined,
  },
])

const filledCount = computed(() => previewFields.value.filter((f) => f.value).length)

function fmtTime(iso?: string): string | undefined {
  if (!iso) return undefined
  return new Date(iso).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

async function send() {
  const text = input.value.trim()
  if (!text || sending.value) return
  msgs.value.push({ role: "user", text })
  input.value = ""
  sending.value = true
  try {
    const { data } = await api.aiDraftChat(text, draft.value)
    draft.value = data.draft
    missing.value = data.missing
    complete.value = data.complete
    msgs.value.push({
      role: "assistant",
      text: data.reply,
      source: data.source.engine === "llm"
        ? `LLM${data.source.model ? ` · ${data.source.model}` : "（环境默认模型）"}`
        : "规则解析（未配 LLM key）",
    })
  } catch (e) {
    msgs.value.push({
      role: "assistant",
      text: "服务暂时没响应，稍后再试；也可以切到表单直接填写。",
    })
    message.error(e instanceof Error ? e.message : String(e))
  } finally {
    sending.value = false
  }
}

function reset() {
  msgs.value = msgs.value.slice(0, 1)
  draft.value = {}
  missing.value = []
  complete.value = false
  message.info("已清空，重新开始")
}

function confirmDraft() {
  emit("complete", draft.value)
}
</script>

<template>
  <div class="chat-layout">
    <!-- 左侧：对话 -->
    <div class="chat-panel">
      <div class="chat-scroll">
        <div
          v-for="(m, i) in msgs"
          :key="i"
          class="bubble-row"
          :class="m.role"
        >
          <div class="bubble" :class="m.role">
            {{ m.text }}
            <div v-if="m.source" class="bubble-source">{{ m.source }}</div>
          </div>
        </div>
        <div v-if="sending" class="bubble-row assistant">
          <div class="bubble assistant">
            <n-spin size="small" />
          </div>
        </div>
      </div>

      <div class="chat-input-row">
        <n-input
          v-model:value="input"
          type="textarea"
          :rows="2"
          placeholder="继续说，比如：「名额改成 30」或「活动地点：徐家汇公园」"
          :disabled="sending"
          @keydown.enter.exact.prevent="send"
        />
        <n-button type="primary" :loading="sending" :disabled="!input.trim()" @click="send">
          发送
        </n-button>
      </div>
    </div>

    <!-- 右侧：草稿预览 -->
    <aside class="draft-panel">
      <div class="draft-head">
        <span class="draft-title">活动草稿</span>
        <n-tag :type="complete ? 'success' : 'default'" size="small">
          {{ filledCount }} / {{ previewFields.length }} 项
        </n-tag>
      </div>

      <div class="draft-fields">
        <div
          v-for="f in previewFields"
          :key="f.key"
          class="draft-field"
          :class="{ filled: !!f.value }"
        >
          <span class="draft-field-label">{{ f.label }}</span>
          <span class="draft-field-value">{{ f.value ?? "待补充" }}</span>
        </div>
      </div>

      <div class="draft-actions">
        <n-button v-if="filledCount > 0" size="small" quaternary @click="reset">清空重来</n-button>
        <n-button
          v-if="complete"
          type="primary"
          block
          @click="confirmDraft"
        >
          信息已齐，去确认发布 →
        </n-button>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.chat-layout {
  display: grid;
  grid-template-columns: 1fr 280px;
  gap: 20px;
  align-items: start;
}

.chat-panel {
  background: #fff;
  border: 1px solid #e8ede9;
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  height: 520px;
}

.chat-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.bubble-row {
  display: flex;
}

.bubble-row.user {
  justify-content: flex-end;
}

.bubble {
  max-width: 82%;
  padding: 10px 14px;
  border-radius: 14px;
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.bubble.assistant {
  background: #f2f6f3;
  color: var(--evergrow-text, #22302a);
  border-bottom-left-radius: 4px;
}

.bubble.user {
  background: var(--evergrow-primary, #2f9e63);
  color: #fff;
  border-bottom-right-radius: 4px;
}

.bubble-source {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed #d8e2da;
  font-size: 11px;
  color: #9aa59e;
}

.chat-input-row {
  display: flex;
  gap: 10px;
  padding: 12px;
  border-top: 1px solid #e8ede9;
  align-items: flex-end;
}

.chat-input-row :deep(.n-input) {
  flex: 1;
}

.draft-panel {
  background: #fff;
  border: 1px solid #e8ede9;
  border-radius: 14px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.draft-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.draft-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--evergrow-text, #22302a);
}

.draft-fields {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.draft-field {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #fafcfa;
  border: 1px dashed transparent;
}

.draft-field.filled {
  background: #f0f9f3;
  border-color: #c9e8d2;
}

.draft-field-label {
  font-size: 12px;
  color: var(--evergrow-text-sub, #5d6b63);
}

.draft-field-value {
  font-size: 13px;
  color: var(--evergrow-text, #22302a);
  word-break: break-all;
}

.draft-field:not(.filled) .draft-field-value {
  color: #b7c2ba;
}

.draft-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: auto;
}

@media (max-width: 860px) {
  .chat-layout {
    grid-template-columns: 1fr;
  }

  .chat-panel {
    height: 420px;
  }
}
</style>
