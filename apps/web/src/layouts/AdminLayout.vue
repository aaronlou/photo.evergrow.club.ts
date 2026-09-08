<script setup lang="ts">
import { RouterLink, RouterView, useRoute } from "vue-router"
import { NButton } from "naive-ui"

import AdminTokenGate from "@/components/AdminTokenGate.vue"
import { useAdminAuthStore } from "@/stores/adminAuth"

/**
 * 管理端骨架：左侧导航 + 右侧内容。
 * 新增管理页 = 加一个导航项 + 一行子路由，页面本身不关心令牌与导航。
 */

const auth = useAdminAuthStore()
const route = useRoute()

const navItems = [
  { to: "/admin/films", label: "商品管理" },
  { to: "/admin/hubs", label: "位置点管理" },
  { to: "/admin/users", label: "用户管理" },
]
</script>

<template>
  <div class="admin-shell">
    <aside class="admin-sidebar">
      <div class="admin-brand">运营后台</div>
      <nav class="admin-nav">
        <router-link
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="admin-nav-item"
          :class="{ active: route.path.startsWith(item.to) }"
        >
          {{ item.label }}
        </router-link>
      </nav>
      <div class="admin-sidebar-foot">
        <template v-if="auth.ready">
          <span class="admin-ok">● 令牌有效</span>
          <n-button size="tiny" quaternary type="error" @click="auth.clear()">退出</n-button>
        </template>
        <router-link v-else to="/" class="admin-back">← 返回前台</router-link>
      </div>
    </aside>

    <main class="admin-content">
      <AdminTokenGate v-if="!auth.ready" />
      <RouterView v-else />
    </main>
  </div>
</template>

<style scoped>
.admin-shell {
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: 24px;
  align-items: start;
}

.admin-sidebar {
  background: #fff;
  border: 1px solid #e8ede9;
  border-radius: 14px;
  padding: 16px 12px;
  position: sticky;
  top: 80px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 320px;
}

.admin-brand {
  font-weight: 700;
  font-size: 15px;
  padding: 0 8px;
  color: var(--evergrow-text, #22302a);
}

.admin-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.admin-nav-item {
  padding: 9px 12px;
  border-radius: 8px;
  font-size: 14px;
  color: var(--evergrow-text-sub, #5d6b63);
  text-decoration: none;
}

.admin-nav-item:hover {
  background: #f2f6f3;
  color: var(--evergrow-text, #22302a);
}

.admin-nav-item.active {
  background: #e7f4ec;
  color: var(--evergrow-primary, #2f9e63);
  font-weight: 600;
}

.admin-sidebar-foot {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 8px;
  font-size: 12px;
}

.admin-ok {
  color: var(--evergrow-primary, #2f9e63);
}

.admin-back {
  color: var(--evergrow-text-sub, #5d6b63);
  text-decoration: none;
}

.admin-content {
  min-width: 0;
}

@media (max-width: 860px) {
  .admin-shell {
    grid-template-columns: 1fr;
  }

  .admin-sidebar {
    position: static;
    min-height: auto;
  }

  .admin-nav {
    flex-direction: row;
    flex-wrap: wrap;
  }
}
</style>
