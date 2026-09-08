import { defineStore } from "pinia"

import { api, AUTH_TOKEN_KEY, ApiClientError } from "@/api/client"
import type { UserDto } from "@evergrow/contracts"

/**
 * 认证会话态：登录令牌 + 当前用户。
 * - token 持久化在 localStorage，刷新页面不丢
 * - 登录/注册成功后立即 fetchMe 拉取用户信息
 * - token 失效（401）自动清除，静默降级为匿名
 */
export const useAuthStore = defineStore("auth", {
  state: () => ({
    token: localStorage.getItem(AUTH_TOKEN_KEY) ?? "",
    user: null as UserDto | null,
  }),
  getters: {
    isLoggedIn: (state) => state.token !== "",
    nickname: (state) => state.user?.nickname ?? "",
  },
  actions: {
    /** 注册成功后自动登录（后端注册接口不发令牌，走一次 login 换取） */
    async register(input: { phone: string; nickname: string; password: string }) {
      await api.register(input)
      await this.login({ phone: input.phone, password: input.password })
    },

    async login(input: { phone: string; password: string }) {
      const { data } = await api.login(input)
      this.token = data.token
      this.user = data.user
      localStorage.setItem(AUTH_TOKEN_KEY, data.token)
    },

    /** 拉取当前用户信息；令牌失效时清除（静默降级为匿名） */
    async fetchMe() {
      if (!this.token) return
      try {
        this.user = (await api.me()).data
      } catch (e) {
        if (e instanceof ApiClientError && e.status === 401) {
          this.clearSession()
        }
      }
    },

    async logout() {
      try {
        if (this.token) await api.logout()
      } finally {
        this.clearSession()
      }
    },

    clearSession() {
      this.token = ""
      this.user = null
      localStorage.removeItem(AUTH_TOKEN_KEY)
    },
  },
})
