<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { NButton, NCard, NEmpty, NInput, NP, NSpin, NTag, useMessage } from "naive-ui"
import { RouterLink } from "vue-router"

import { api, ADMIN_TOKEN_KEY, ApiClientError } from "@/api/client"
import type { AdminUserDto } from "@evergrow/contracts"

/**
 * 注册用户管理（仅限管理员）：
 * - 访问 /admin/users，首次输入管理员令牌（后端 ADMIN_TOKEN）存入 localStorage
 * - 统计卡片（总数 / 已设密码 / 已禁用）+ 用户明细（支持昵称 / 手机号搜索）
 */

const TOKEN_KEY = ADMIN_TOKEN_KEY
const message = useMessage()

const adminToken = ref(localStorage.getItem(TOKEN_KEY) ?? "")
const tokenDraft = ref("")

const loading = ref(true)
const users = ref<AdminUserDto[]>([])
const keyword = ref("")

const stats = computed(() => ({
  total: users.value.length,
  withPassword: users.value.filter((u) => u.hasPassword).length,
  disabled: users.value.filter((u) => u.status === "Disabled").length,
}))

const filtered = computed(() => {
  const k = keyword.value.trim().toLowerCase()
  if (!k) return users.value
  return users.value.filter(
    (u) => u.nickname.toLowerCase().includes(k) || u.phone.includes(k) || u.id.includes(k),
  )
})

function fmtTime(iso: string): string {
  if (!iso) return "-"
  return new Date(iso).toLocaleString("zh-CN", { hour12: false })
}

async function saveToken() {
  const t = tokenDraft.value.trim()
  if (!t) return
  // 直接调用本页接口校验：401 → 令牌错误；200 → 保存并加载
  try {
    adminToken.value = t
    await api.listAdminUsers(t)
    localStorage.setItem(TOKEN_KEY, t)
    message.success("令牌已保存")
    void load()
  } catch (e) {
    if (e instanceof ApiClientError && e.status === 401) {
      adminToken.value = ""
      message.error("令牌不正确")
    } else {
      message.error(e instanceof Error ? e.message : String(e))
    }
  }
}

async function load() {
  loading.value = true
  try {
    const { data } = await api.listAdminUsers(adminToken.value)
    users.value = data.items
  } catch (e) {
    message.error(e instanceof Error ? e.message : String(e))
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (adminToken.value) void load()
  else loading.value = false
})
</script>

<template>
  <div class="page">
    <div class="activity-head">
      <div>
        <h2 class="page-title">用户管理</h2>
        <p class="page-sub">查看注册用户统计与明细（仅限管理员）</p>
      </div>
      <div class="admin-links">
        <router-link to="/admin/films" class="admin-link">商品管理 →</router-link>
        <router-link to="/admin/hubs" class="admin-link">位置点管理 →</router-link>
      </div>
    </div>

    <!-- 令牌门禁 -->
    <div v-if="!adminToken" class="admin-token-gate">
      <n-p>请输入管理员令牌（服务器 ADMIN_TOKEN 环境变量）</n-p>
      <div class="admin-token-row">
        <n-input
          v-model:value="tokenDraft"
          type="password"
          show-password-on="click"
          placeholder="ADMIN_TOKEN"
          @keydown.enter="saveToken"
        />
        <n-button type="primary" @click="saveToken">进入</n-button>
      </div>
    </div>

    <n-spin v-else :show="loading">
      <!-- 统计卡片 -->
      <div class="stat-cards">
        <n-card class="stat-card">
          <div class="stat-num">{{ stats.total }}</div>
          <div class="stat-label">注册用户</div>
        </n-card>
        <n-card class="stat-card">
          <div class="stat-num">{{ stats.withPassword }}</div>
          <div class="stat-label">已设置密码</div>
        </n-card>
        <n-card class="stat-card">
          <div class="stat-num">{{ stats.disabled }}</div>
          <div class="stat-label">已禁用</div>
        </n-card>
      </div>

      <!-- 搜索 -->
      <n-input
        v-model:value="keyword"
        placeholder="按昵称 / 手机号 / 用户 ID 搜索"
        clearable
        style="max-width: 360px; margin-bottom: 14px"
      />

      <n-empty v-if="!loading && filtered.length === 0" description="没有匹配的用户" />
      <div v-else class="user-list">
        <div v-for="u in filtered" :key="u.id" class="user-card">
          <div class="user-main">
            <div class="user-title-row">
              <span class="user-name">{{ u.nickname }}</span>
              <n-tag :type="u.status === 'Active' ? 'success' : 'error'" size="small">
                {{ u.status === "Active" ? "正常" : "已禁用" }}
              </n-tag>
              <n-tag :type="u.hasPassword ? 'info' : 'default'" size="small" :bordered="false">
                {{ u.hasPassword ? "已设密码" : "未设密码" }}
              </n-tag>
            </div>
            <span class="user-phone">{{ u.phone }}</span>
            <span class="user-meta">注册于 {{ fmtTime(u.createdAt) }} · {{ u.id }}</span>
          </div>
        </div>
      </div>
    </n-spin>
  </div>
</template>

<style scoped>
.admin-token-gate {
  background: #fff;
  border: 1px solid #e8ede9;
  border-radius: 14px;
  padding: 28px;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.admin-token-row {
  display: flex;
  gap: 8px;
}

.admin-links {
  display: flex;
  gap: 14px;
}

.admin-link {
  font-size: 13px;
  color: var(--evergrow-primary, #2f9e63);
  text-decoration: none;
  white-space: nowrap;
}

.stat-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  margin-bottom: 18px;
}

.stat-card {
  text-align: center;
}

.stat-num {
  font-size: 28px;
  font-weight: 700;
  color: var(--evergrow-text, #22302a);
}

.stat-label {
  font-size: 13px;
  color: var(--evergrow-text-sub, #5d6b63);
}

.user-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.user-card {
  background: #fff;
  border: 1px solid #e8ede9;
  border-radius: 12px;
  padding: 14px 18px;
  display: flex;
  align-items: center;
}

.user-main {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.user-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.user-name {
  font-weight: 600;
  font-size: 15px;
  color: var(--evergrow-text, #22302a);
}

.user-phone {
  font-size: 13px;
  color: var(--evergrow-text-sub, #5d6b63);
}

.user-meta {
  font-size: 12px;
  color: #9aa59e;
}

@media (max-width: 640px) {
  .stat-cards {
    grid-template-columns: 1fr;
  }
}
</style>
