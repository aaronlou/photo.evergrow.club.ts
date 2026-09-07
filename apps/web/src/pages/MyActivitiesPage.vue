<script setup lang="ts">
import { computed } from "vue"
import { useRouter } from "vue-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query"
import { NButton, NEmpty, NProgress, NSpin, NTag, useDialog, useMessage } from "naive-ui"

import {
  activityKeys,
  cancelActivityMutation,
  listMyActivitiesQuery,
  optimisticCancelList,
} from "@/api/queries"
import type { ActivityDto, ActivityStatusDto } from "@evergrow/contracts"

const router = useRouter()
const message = useMessage()
const dialog = useDialog()
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
  queryKey: listMyActivitiesQuery().queryKey,
  queryFn: listMyActivitiesQuery().queryFn,
})
const activities = computed(() => data.value?.data ?? [])

const {
  mutate: cancel,
  isPending: cancelling,
  variables: cancellingVar,
} = useMutation({
  mutationFn: cancelActivityMutation,
  onMutate: async (id) => {
    await queryClient.cancelQueries({ queryKey: activityKeys.mine })
    const previous = queryClient.getQueryData(activityKeys.mine)
    queryClient.setQueryData(activityKeys.mine, (old) => optimisticCancelList(old as never, id))
    return { previous }
  },
  onError: (e, _id, ctx) => {
    if (ctx?.previous) queryClient.setQueryData(activityKeys.mine, ctx.previous)
    message.error(e instanceof Error ? e.message : String(e))
  },
  onSuccess: () => message.success("已取消报名"),
  onSettled: () => {
    void queryClient.invalidateQueries({ queryKey: activityKeys.all })
    void queryClient.invalidateQueries({ queryKey: activityKeys.mine })
  },
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
const percentOf = (a: ActivityDto) => Math.min(100, Math.round((a.participantCount / a.capacity) * 100))
const canCancel = (a: ActivityDto) => a.status !== "Ended"
const cancellingThis = (a: ActivityDto) => cancelling.value && cancellingVar.value === a.id
</script>

<template>
  <div class="page">
    <div class="activity-head">
      <div>
        <h2 class="page-title">我的报名</h2>
        <p class="page-sub">你参加过的活动都在这里</p>
      </div>
      <n-button type="primary" @click="router.push('/activities')">去逛逛活动</n-button>
    </div>

    <n-spin :show="loading">
      <n-empty
        v-if="!loading && activities.length === 0"
        description="你还没有报名任何活动"
      >
        <template #extra>
          <n-button type="primary" @click="router.push('/activities')">去逛逛活动</n-button>
        </template>
      </n-empty>
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
            <div class="activity-time-row">
              <span class="activity-time-label">已报</span>
              <span>{{ activity.participantCount }}/{{ activity.capacity }} 人</span>
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
          </div>
          <n-button
            v-if="canCancel(activity)"
            block
            type="default"
            :loading="cancellingThis(activity)"
            @click.stop="confirmCancel(activity.id)"
          >
            取消报名
          </n-button>
        </div>
      </div>
    </n-spin>

    <p v-if="errorText" class="error-text">{{ errorText }}</p>
  </div>
</template>
