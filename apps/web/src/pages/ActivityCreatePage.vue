<script setup lang="ts">
import { reactive, ref } from "vue"
import { useRouter } from "vue-router"
import { useMutation, useQueryClient } from "@tanstack/vue-query"
import { NButton, NInputNumber, NTabPane, NTabs, useMessage } from "naive-ui"

import ActivityAiChat from "@/components/ActivityAiChat.vue"
import { activityKeys } from "@/api/queries"
import { api } from "@/api/client"
import type { ActivityDraft, CreateActivityInput } from "@evergrow/contracts"

const router = useRouter()
const message = useMessage()
const queryClient = useQueryClient()

const error = ref("")
const mode = ref<"chat" | "form">("chat")

const toLocalInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

const DAY = 24 * 60 * 60 * 1000
const now = new Date()

const form = reactive({
  name: "",
  description: "",
  location: "",
  coverImageUrl: "",
  startAt: toLocalInput(new Date(now.getTime() + 4 * DAY)),
  endAt: toLocalInput(new Date(now.getTime() + 5 * DAY)),
  signupStartAt: toLocalInput(now),
  signupEndAt: toLocalInput(new Date(now.getTime() + 3 * DAY)),
  capacity: 20,
})

/** 对话草稿 → 回填表单并切到表单 Tab（人在回路：用户在表单里最终确认） */
function applyDraft(d: ActivityDraft) {
  if (d.name) form.name = d.name
  if (d.description) form.description = d.description
  if (d.location) form.location = d.location
  if (d.coverImageUrl) form.coverImageUrl = d.coverImageUrl
  if (d.startAt) form.startAt = toLocalInput(new Date(d.startAt))
  if (d.endAt) form.endAt = toLocalInput(new Date(d.endAt))
  if (d.signupStartAt) form.signupStartAt = toLocalInput(new Date(d.signupStartAt))
  if (d.signupEndAt) form.signupEndAt = toLocalInput(new Date(d.signupEndAt))
  if (d.capacity !== undefined) form.capacity = d.capacity
  mode.value = "form"
  message.success("草稿已填入表单，请检查确认后发布")
}

const { mutate: create, isPending: submitting } = useMutation({
  mutationFn: (input: CreateActivityInput) => api.createActivity(input),
  onSuccess: (res) => {
    void queryClient.invalidateQueries({ queryKey: activityKeys.all })
    message.success("活动创建成功")
    router.push(`/activities/${res.data.id}`)
  },
  onError: (e) => {
    error.value = e instanceof Error ? e.message : String(e)
  },
})

function submit() {
  error.value = ""
  if (!form.name.trim()) {
    error.value = "请填写活动名称"
    return
  }
  if (!form.location.trim()) {
    error.value = "请填写活动地点"
    return
  }
  if (!form.startAt || !form.endAt || !form.signupStartAt || !form.signupEndAt) {
    error.value = "请填写完整的时间信息"
    return
  }
  if (!form.capacity || form.capacity < 1) {
    error.value = "名额上限需大于 0"
    return
  }

  create({
    name: form.name.trim(),
    description: form.description.trim(),
    location: form.location.trim(),
    coverImageUrl: form.coverImageUrl.trim(),
    startAt: new Date(form.startAt).toISOString(),
    endAt: new Date(form.endAt).toISOString(),
    signupStartAt: new Date(form.signupStartAt).toISOString(),
    signupEndAt: new Date(form.signupEndAt).toISOString(),
    capacity: form.capacity,
  })
}
</script>

<template>
  <div class="page">
    <n-button size="small" text @click="router.push('/activities')">← 返回活动列表</n-button>
    <h2 class="page-title">创建活动</h2>
    <p class="page-sub">用自然语言对话快速起草，或直接填写表单（两种方式最终都经表单确认后发布）</p>

    <n-tabs v-model:value="mode" type="segment" :animated="true">
      <n-tab-pane name="chat" tab="AI 对话起草">
        <ActivityAiChat @complete="applyDraft" />
      </n-tab-pane>

      <n-tab-pane name="form" tab="表单填写">
        <div class="create-form">
          <div class="form-field">
            <label class="form-label">活动名称 <span class="req">*</span></label>
            <input v-model="form.name" class="form-input" placeholder="例如：周末胶片人像外拍" />
          </div>

          <div class="form-field">
            <label class="form-label">活动介绍</label>
            <textarea
              v-model="form.description"
              class="form-input form-textarea"
              rows="4"
              placeholder="活动内容、适合人群、注意事项…"
            />
          </div>

          <div class="form-field">
            <label class="form-label">活动地点 <span class="req">*</span></label>
            <input v-model="form.location" class="form-input" placeholder="城市 · 具体地址/集合点" />
          </div>

          <div class="form-field">
            <label class="form-label">封面图地址（可选）</label>
            <input
              v-model="form.coverImageUrl"
              class="form-input"
              placeholder="https://…（留空使用默认占位）"
            />
          </div>

          <div class="form-grid">
            <div class="form-field">
              <label class="form-label">报名开始 <span class="req">*</span></label>
              <input v-model="form.signupStartAt" type="datetime-local" class="form-input" />
            </div>
            <div class="form-field">
              <label class="form-label">报名截止 <span class="req">*</span></label>
              <input v-model="form.signupEndAt" type="datetime-local" class="form-input" />
            </div>
            <div class="form-field">
              <label class="form-label">活动开始 <span class="req">*</span></label>
              <input v-model="form.startAt" type="datetime-local" class="form-input" />
            </div>
            <div class="form-field">
              <label class="form-label">活动结束 <span class="req">*</span></label>
              <input v-model="form.endAt" type="datetime-local" class="form-input" />
            </div>
          </div>

          <div class="form-field">
            <label class="form-label">名额上限 <span class="req">*</span></label>
            <n-input-number v-model:value="form.capacity" :min="1" :max="9999" class="form-capacity" />
          </div>

          <p v-if="error" class="error-text">{{ error }}</p>

          <div class="form-actions">
            <n-button :loading="submitting" type="primary" size="large" @click="submit">
              发布活动
            </n-button>
            <n-button size="large" @click="router.push('/activities')">取消</n-button>
          </div>
        </div>
      </n-tab-pane>
    </n-tabs>
  </div>
</template>
