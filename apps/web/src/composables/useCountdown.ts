import { computed, onScopeDispose, ref, watch } from "vue"

/** 拼团倒计时：每秒刷新剩余秒数（M2 拼团列表/详情页使用） */
export function useCountdown(targetTime: () => number) {
  const remaining = ref(Math.max(0, Math.floor((targetTime() - Date.now()) / 1000)))

  const timer = setInterval(() => {
    remaining.value = Math.max(0, Math.floor((targetTime() - Date.now()) / 1000))
  }, 1000)

  watch(
    () => targetTime(),
    () => {
      remaining.value = Math.max(0, Math.floor((targetTime() - Date.now()) / 1000))
    },
  )

  onScopeDispose(() => clearInterval(timer))
  return { remaining: computed(() => remaining.value) }
}
