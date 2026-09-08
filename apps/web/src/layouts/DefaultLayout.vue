<script setup lang="ts">
import { onMounted } from "vue"
import { RouterLink, RouterView } from "vue-router"

import { useAuthStore } from "@/stores/auth"

const auth = useAuthStore()
onMounted(() => {
  // 启动时校验本地 token 并拉取用户信息（失效会自动清除）
  void auth.fetchMe()
})
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <RouterLink to="/" class="brand">摄影团团圈</RouterLink>
      <nav class="app-nav">
        <RouterLink to="/">首页</RouterLink>
        <RouterLink to="/films">选胶卷</RouterLink>
        <RouterLink to="/activities">活动</RouterLink>
        <RouterLink to="/me/activities">我的报名</RouterLink>
        <RouterLink to="/me">我的</RouterLink>
        <RouterLink v-if="!auth.isLoggedIn" to="/login" class="nav-login">登录 / 注册</RouterLink>
        <span v-else class="nav-user">{{ auth.nickname || "已登录" }}</span>
      </nav>
    </header>
    <main class="app-main">
      <RouterView />
    </main>
    <footer class="app-footer">© 2026 摄影团团圈 · 摄影爱好者的品质团购社区</footer>
  </div>
</template>

<style scoped>
.nav-login {
  color: var(--evergrow-primary, #2f9e63);
  font-weight: 600;
}

.nav-user {
  color: var(--evergrow-primary, #2f9e63);
  font-weight: 600;
}
</style>
