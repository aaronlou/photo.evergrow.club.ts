import { defineStore } from "pinia"

import { api, ADMIN_TOKEN_KEY, ApiClientError } from "@/api/client"
import { useMessage } from "naive-ui"

/**
 * 管理端令牌状态（全局共享）：
 * - 任一管理页输入的令牌，其它管理页自动可用
 * - 校验方式：用轻量的 admin 只读端点探测（401 → 令牌错误）
 * - ready 为真时，AdminLayout 才渲染子页面
 */
export const useAdminAuthStore = defineStore("adminAuth", {
  state: () => ({
    token: localStorage.getItem(ADMIN_TOKEN_KEY) ?? "",
    tokenDraft: "",
    checking: false,
  }),
  getters: {
    ready: (state) => state.token !== "",
  },
  actions: {
    async saveToken() {
      const t = this.tokenDraft.trim()
      if (!t) return false
      const message = useMessage()
      this.checking = true
      try {
        // 用本模块的只读端点探测：401 → 令牌错误；200 → 令牌正确
        await api.listAdminUsers(t)
        this.token = t
        this.tokenDraft = ""
        localStorage.setItem(ADMIN_TOKEN_KEY, t)
        message.success("令牌已保存")
        return true
      } catch (e) {
        if (e instanceof ApiClientError && e.status === 401) {
          message.error("令牌不正确")
        } else {
          message.error(e instanceof Error ? e.message : String(e))
        }
        return false
      } finally {
        this.checking = false
      }
    },

    clear() {
      this.token = ""
      this.tokenDraft = ""
      localStorage.removeItem(ADMIN_TOKEN_KEY)
    },
  },
})
