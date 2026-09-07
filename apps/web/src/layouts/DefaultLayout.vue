<script setup lang="ts">
import { RouterLink, RouterView } from "vue-router"
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <RouterLink to="/" class="brand">
        摄影团团圈<span class="brand-sub">EverGrow</span>
      </RouterLink>
      <nav class="app-nav">
        <RouterLink to="/">首页</RouterLink>
        <RouterLink to="/films">选胶卷</RouterLink>
        <RouterLink to="/activities">活动</RouterLink>
        <RouterLink to="/me/activities">我的报名</RouterLink>
        <RouterLink to="/me">我的</RouterLink>
      </nav>
    </header>
    <main class="app-main">
      <RouterView />
    </main>
    <footer class="app-footer">© 2026 摄影团团圈 · 摄影爱好者的品质团购社区</footer>
  </div>
</template>
