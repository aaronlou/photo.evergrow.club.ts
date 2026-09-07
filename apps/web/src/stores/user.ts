import { defineStore } from "pinia"

import { api } from "@/api/client"
import type { UserDto } from "@evergrow/contracts"

/** 客户端会话态：登录用户信息（服务端数据后续引入 @tanstack/vue-query 管理） */
export const useUserStore = defineStore("user", {
  state: () => ({
    profile: null as UserDto | null,
    loading: false,
  }),
  actions: {
    async fetchProfile(id: string) {
      this.loading = true
      try {
        this.profile = (await api.getUser(id)).data
      } finally {
        this.loading = false
      }
    },
  },
})
