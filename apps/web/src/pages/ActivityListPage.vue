<script setup lang="ts">
import { computed } from "vue"
import { useRouter } from "vue-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query"
import { NButton, NEmpty, NProgress, NSpin, NTag, useMessage } from "naive-ui"

import { activityKeys, enrollActivityMutation, listActivitiesQuery, optimisticEnrollList } from "@/api/queries"
import type { ActivityDto, ActivityStatusDto } from "@evergrow/contracts"

const router = useRouter()
const message = useMessage()
const queryClient = useQueryClient()

const STATUS_META: Record<
  ActivityStatusDto,
  { label: string; type: "default" | "success" | "warning" | "error" | "info" }
> = {
  NotStarted: { label: "报名未开始", type: "info" },
  Open: { label: "报名中", type: "success" },
  Full: { label: "已满员", type: "warning" },
  Closed: { label: "报名截止", type: "default" },
  Ended: { label: "已结束", type: "default" },
}

const { data, isPending: loading, error } = useQuery({
  queryKey: listActivitiesQuery().queryKey,
  queryFn: listActivitiesQuery().queryFn,
})
const activities = computed(() => data.value?.data ?? [])

const {
  mutate: enroll,
  isPending: enrolling,
  variables: enrollingVar,
} = useMutation({
  mutationFn: enrollActivityMutation,
  onMutate: async (id) => {
    await queryClient.cancelQueries({ queryKey: activityKeys.all })
    const previous = queryClient.getQueryData(activityKeys.all)
    queryClient.setQueryData(activityKeys.all, (old) => optimisticEnrollList(old as never, id))
    return { previous }
  },
  onError: (e, _id, ctx) => {
    if (ctx?.previous) queryClient.setQueryData(activityKeys.all, ctx.previous)
    message.error(e instanceof Error ? e.message : String(e))
  },
  onSettled: () => {
    void queryClient.invalidateQueries({ queryKey: activityKeys.all })
    void queryClient.invalidateQueries({ queryKey: activityKeys.mine })
  },
})

const errorText = computed(() => (error.value ? (error.value as Error).message : ""))
const fmt = (iso: string) => {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
const percentOf = (a: ActivityDto) => Math.min(100, Math.round((a.participantCount / a.capacity) * 100))
const canEnroll = (a: ActivityDto) => a.status === "Open" && !a.joinedByMe
const enrollLabel = (a: ActivityDto) => {
  if (a.joinedByMe) return "已报名"
  if (a.status === "Open") return "报名"
  return STATUS_META[a.status].label
}
const enrollingThis = (a: ActivityDto) => enrolling.value && enrollingVar.value === a.id
</script>

<template>
  <div class="page">
    <div class="activity-head">
      <div>
        <h2 class="page-title">活动</h2>
        <p class="page-sub">线下外拍、讲座与同好聚会，名满即止，先报先得</p>
      </div>
      <n-button type="primary" @click="router.push('/activities/new')">创建活动</n-button>
    </div>

    <n-spin :show="loading">
      <n-empty v-if="!loading && activities.length === 0" description="暂无可报名的活动，点击右上角创建第一个吧" />
      <div v-else class="activity-grid">
        <div
          v-for="activity in activities"
          :key="activity.id"
          class="activity-card"
          role="button"
          tabindex="0"
          @click="router.push(`/activities/${activity.id}`)"
          @keydown.enter="router.push(`/activities/${activity.id}`)"
        >
          <div class="activity-card-head">
            <span class="activity-name">{{ activity.name }}</span>
            <n-tag size="small" :type="STATUS_META[activity.status].type" round>
              {{ STATUS_META[activity.status].label }}
            </n-tag>
          </div>
          <p class="activity-loc">📍 {{ activity.location }}</p>
          <div class="activity-times">
            <div class="activity-time-row">
              <span class="activity-time-label">开始</span>
              <span>{{ fmt(activity.startAt) }}</span>
            </div>
            <div class="activity-time-row">
              <span class="activity-time-label">结束</span>
              <span>{{ fmt(activity.endAt) }}</span>
            </div>
          </div>
          <div class="activity-progress">
            <n-progress
              type="line"
              :percentage="percentOf(activity)"
              :height="6"
              :show-indicator="false"
              status="success"
            />
            <span class="progress-text">
              {{ activity.participantCount }}/{{ activity.capacity }} 人
              <template v-if="activity.status === 'Full'"> · 已满员</template>
              <template v-else-if="activity.status === 'Open'">
                · 还剩 {{ activity.capacity - activity.participantCount }} 个名额
              </template>
            </span>
          </div>
          <n-button
            block
            type="primary"
            :disabled="!canEnroll(activity)"
            :loading="enrollingThis(activity)"
            @click.stop="enroll(activity.id)"
          >
            {{ enrollLabel(activity) }}
          </n-button>
        </div>
      </div>
    </n-spin>

    <p v-if="errorText" class="error-text">{{ errorText }}</p>
  </div>
</template>
