<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { NCard, NEmpty, NInput, NSpin, NTag } from "naive-ui"

import { api } from "@/api/client"
import { useAdminAuthStore } from "@/stores/adminAuth"
import type { AdminUserDto } from "@evergrow/contracts"

/** 用户管理：统计 + 明细（令牌与导航由 AdminLayout 统一处理） */

const auth = useAdminAuthStore()
const loading = ref(true)
const users = ref<AdminUserDto[]>([])
const keyword = ref("")
const error = ref("")

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

async function load() {
  loading.value = true
  try {
    const { data } = await api.listAdminUsers(auth.token)
    users.value = data.items
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="page">
    <h2 class="page-title">用户管理</h2>
    <p class="page-sub">查看注册用户统计与明细</p>

    <n-spin :show="loading">
      <p v-if="error" class="error-text">{{ error }}</p>
      <template v-else>
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
      </template>
    </n-spin>
  </div>
</template>

<style scoped>
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

.error-text {
  color: #d03050;
}

@media (max-width: 640px) {
  .stat-cards {
    grid-template-columns: 1fr;
  }
}
</style>
