import { api } from "./client"
import type { ActivityDetailDto, ActivityDto, CreateActivityInput } from "@evergrow/contracts"

/** 活动相关查询 key（@tanstack/vue-query），便于缓存命中与失效 */
export const activityKeys = {
  all: ["activities"] as const,
  mine: ["activities", "mine"] as const,
  detail: (id: string) => ["activities", id] as const,
}

/** 报名 / 取消报名后需要失效的查询集合 */
export const activityListQueries = [activityKeys.all, activityKeys.mine]

export const listActivitiesQuery = () => ({
  queryKey: activityKeys.all,
  queryFn: () => api.listActivities(),
})

export const listMyActivitiesQuery = () => ({
  queryKey: activityKeys.mine,
  queryFn: () => api.listMyActivities(),
})

export const getActivityQuery = (id: string) => ({
  queryKey: activityKeys.detail(id),
  queryFn: () => api.getActivity(id),
})

export const createActivityMutation = (input: CreateActivityInput) => api.createActivity(input)

export const enrollActivityMutation = (id: string) => api.enrollActivity(id)

export const cancelActivityMutation = (id: string): Promise<{ data: ActivityDetailDto }> =>
  api.cancelActivity(id)

// ===== 乐观更新（onMutate 先改缓存，onError 回滚，onSettled 失效兜底） =====

const patchOnEnroll = <T extends ActivityDto>(a: T): T => {
  const count = a.participantCount + 1
  return { ...a, joinedByMe: true, participantCount: count, status: count >= a.capacity ? "Full" : a.status }
}

const patchOnCancel = <T extends ActivityDto>(a: T): T => {
  const count = Math.max(0, a.participantCount - 1)
  return { ...a, joinedByMe: false, participantCount: count, status: a.status === "Full" ? "Open" : a.status }
}

/** 列表乐观报名（{ data: ActivityDto[] }） */
export const optimisticEnrollList = (
  query: { data: ActivityDto[] } | undefined,
  id: string,
): { data: ActivityDto[] } | undefined =>
  query
    ? { data: query.data.map((a) => (a.id === id ? patchOnEnroll(a) : a)) }
    : query

/** 列表乐观取消报名 */
export const optimisticCancelList = (
  query: { data: ActivityDto[] } | undefined,
  id: string,
): { data: ActivityDto[] } | undefined =>
  query
    ? { data: query.data.filter((a) => a.id !== id) }
    : query

/** 详情乐观报名（{ data: ActivityDetailDto }） */
export const optimisticEnrollDetail = (
  query: { data: ActivityDetailDto } | undefined,
  id: string,
): { data: ActivityDetailDto } | undefined =>
  query && query.data.id === id ? { data: patchOnEnroll(query.data) } : query

/** 详情乐观取消报名 */
export const optimisticCancelDetail = (
  query: { data: ActivityDetailDto } | undefined,
  id: string,
): { data: ActivityDetailDto } | undefined =>
  query && query.data.id === id ? { data: patchOnCancel(query.data) } : query
