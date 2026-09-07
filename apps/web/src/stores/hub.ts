import { defineStore } from "pinia"

import { api, ApiClientError } from "@/api/client"

/** 位置点选择状态：localStorage 持久化，选中即自动加入该位置点，便于后续参团 */
const STORAGE_KEY = "evergrow-selected-hub-id"

export const useHubStore = defineStore("hub", {
  state: () => ({
    selectedHubId: localStorage.getItem(STORAGE_KEY) as string | null,
  }),
  getters: {
    hasSelection: (s) => !!s.selectedHubId,
  },
  actions: {
    /** 选择位置点 = 加入位置点（已加入时忽略 AlreadyJoinedHub），并持久化 */
    async selectHub(id: string) {
      try {
        await api.joinHub(id)
      } catch (e) {
        if (!(e instanceof ApiClientError) || e.body?.code !== "AlreadyJoinedHub") {
          throw e
        }
      }
      this.selectedHubId = id
      localStorage.setItem(STORAGE_KEY, id)
    },
    setHub(id: string) {
      this.selectedHubId = id
      localStorage.setItem(STORAGE_KEY, id)
    },
    clear() {
      this.selectedHubId = null
      localStorage.removeItem(STORAGE_KEY)
    },
  },
})
