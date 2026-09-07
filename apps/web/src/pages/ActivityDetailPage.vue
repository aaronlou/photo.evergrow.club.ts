<script setup lang="ts">
import { computed } from "vue"
import { useRoute, useRouter } from "vue-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query"
import { NButton, NEmpty, NProgress, NSpin, NTag, useDialog, useMessage } from "naive-ui"

import {
  activityKeys,
  cancelActivityMutation,
  enrollActivityMutation,
  getActivityQuery,
  optimisticCancelDetail,
  optimisticEnrollDetail,
} from "@/api/queries"

const route = useRoute()
const router = useRouter()
const message = useMessage()
const dialog = useDialog()
const queryClient = useQueryClient()

const activityId = route.params.id as string

const STATUS_META: Record<
  string,
  { label: string; type: "default" | "success" | "warning" | "error" | "info" }
> = {
  NotStarted: { label: "报名未开始", type: "info" },
  Open: { label: "报名中", type: "success" },
  Full: { label: "已满员", type: "warning" },
  Closed: { label: "报名截止", type: "default" },
  Ended: { label: "已结束", type: "default" },
}

const { data, isPending: loading, error } = useQuery(getActivityQuery(activityId))
const activity = computed(() => data.value?.data ?? null)

const syncActivity = (id: string) => {
  void queryClient.invalidateQueries({ queryKey: activityKeys.detail(id) })
  void queryClient.invalidateQueries({ queryKey: activityKeys.all })
  void queryClient.invalidateQueries({ queryKey: activityKeys.mine })
}

const { mutate: enroll, isPending: enrolling } = useMutation({
  mutationFn: (id: string) => enrollActivityMutation(id),
  onMutate: async (id) => {
    await queryClient.cancelQueries({ queryKey: activityKeys.detail(id) })
    const previous = queryClient.getQueryData(activityKeys.detail(id))
    queryClient.setQueryData(activityKeys.detail(id), (old) => optimisticEnrollDetail(old as never, id))
    return { previous }
  },
  onError: (e, id, ctx) => {
    if (ctx?.previous) queryClient.setQueryData(activityKeys.detail(id), ctx.previous)
    message.error(e instanceof Error ? e.message : String(e))
  },
  onSuccess: () => message.success("报名成功，届时见！"),
  onSettled: (_d, _e, id) => syncActivity(id),
})

const { mutate: cancel, isPending: cancelling } = useMutation({
  mutationFn: (id: string) => cancelActivityMutation(id),
  onMutate: async (id) => {
    await queryClient.cancelQueries({ queryKey: activityKeys.detail(id) })
    const previous = queryClient.getQueryData(activityKeys.detail(id))
    queryClient.setQueryData(activityKeys.detail(id), (old) => optimisticCancelDetail(old as never, id))
    return { previous }
  },
  onError: (e, id, ctx) => {
    if (ctx?.previous) queryClient.setQueryData(activityKeys.detail(id), ctx.previous)
    message.error(e instanceof Error ? e.message : String(e))
  },
  onSuccess: () => message.success("已取消报名"),
  onSettled: (_d, _e, id) => syncActivity(id),
})

function confirmCancel(id: string) {
  dialog.warning({
    title: "取消报名",
    content: "确定要取消报名这个活动吗？取消后名额将被释放。",
    positiveText: "确定取消",
    negativeText: "再想想",
    onPositiveClick: () => cancel(id),
  })
}

const errorText = computed(() => (error.value ? (error.value as Error).message : ""))
const fmt = (iso: string) => {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
const percent = computed(() =>
  activity.value
    ? Math.min(100, Math.round((activity.value.participantCount / activity.value.capacity) * 100))
    : 0,
)
const remaining = computed(() =>
  activity.value ? Math.max(0, activity.value.capacity - activity.value.participantCount) : 0,
)
const canEnroll = computed(
  () => activity.value?.status === "Open" && !activity.value?.joinedByMe,
)
const showCancel = computed(
  () => activity.value?.joinedByMe && activity.value.status !== "Ended",
)
const enrollLabel = computed(() => {
  const a = activity.value
  if (!a) return "报名"
  if (a.joinedByMe) return "已报名"
  if (a.status === "Open") return "报名"
  return STATUS_META[a.status].label
})
</script>

<template>
  <div class="page">
    <n-button size="small" text @click="router.push('/activities')">← 返回活动列表</n-button>

    <n-spin :show="loading">
      <div v-if="activity" class="detail-hero">
        <div class="detail-cover">
          <img v-if="activity.coverImageUrl" :src="activity.coverImageUrl" :alt="activity.name" />
          <div v-else class="detail-cover-placeholder">📷</div>
        </div>
        <div class="detail-info">
          <div class="tag-row detail-tags">
            <n-tag round :type="STATUS_META[activity.status].type">
              {{ STATUS_META[activity.status].label }}
            </n-tag>
            <n-tag round type="info">{{ activity.location.split(" · ")[0] }}</n-tag>
          </div>
          <h2 class="detail-name">{{ activity.name }}</h2>
          <p class="activity-loc">📍 {{ activity.location }}</p>

          <div class="detail-times">
            <div class="activity-time-row">
              <span class="activity-time-label">活动时间</span>
              <span>{{ fmt(activity.startAt) }} ~ {{ fmt(activity.endAt) }}</span>
            </div>
            <div class="activity-time-row">
              <span class="activity-time-label">报名窗口</span>
              <span>{{ fmt(activity.signupStartAt) }} ~ {{ fmt(activity.signupEndAt) }}</span>
            </div>
          </div>

          <div class="detail-progress">
            <n-progress type="line" :percentage="percent" :height="10" status="success" />
            <p class="progress-text">
              <template v-if="remaining > 0">
                已有 {{ activity.participantCount }} 人报名，还剩 {{ remaining }} 个名额（共
                {{ activity.capacity }} 个）
              </template>
              <template v-else>已满员，报名已满 {{ activity.capacity }} 人</template>
            </p>
          </div>

          <div class="detail-actions">
            <n-button
              v-if="showCancel"
              size="large"
              :loading="cancelling"
              @click="confirmCancel(activity.id)"
            >
              取消报名
            </n-button>
            <n-button
              v-else
              type="primary"
              size="large"
              :disabled="!canEnroll"
              :loading="enrolling"
              @click="enroll(activity.id)"
            >
              {{ enrollLabel }}
            </n-button>
          </div>
        </div>
      </div>

      <section v-if="activity" class="detail-section">
        <h3>活动介绍</h3>
        <p class="activity-desc">{{ activity.description || "暂无介绍" }}</p>
      </section>

      <n-empty v-if="!loading && !activity" :description="errorText || '未找到该活动'" />
    </n-spin>
  </div>
</template>
