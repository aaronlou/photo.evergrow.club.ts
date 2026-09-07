<script setup lang="ts">
import { onMounted, ref } from "vue"
import { useRouter } from "vue-router"
import { NButton, NTag } from "naive-ui"

import { api } from "@/api/client"
import FeatureCard from "@/components/FeatureCard.vue"

const router = useRouter()
const apiStatus = ref<"checking" | "ok" | "error">("checking")

onMounted(async () => {
  try {
    await api.health()
    apiStatus.value = "ok"
  } catch {
    apiStatus.value = "error"
  }
})
</script>

<template>
  <div class="home">
    <section class="hero">
      <n-tag v-if="apiStatus === 'ok'" type="success" size="small">后端已连接</n-tag>
      <n-tag v-else-if="apiStatus === 'error'" type="error" size="small">
        后端未连接（请先启动 apps/api）
      </n-tag>
      <n-tag v-else size="small">连接中…</n-tag>
      <h1 class="hero-title">摄影团团圈</h1>
      <p class="hero-sub">摄影爱好者的团购圈子 —— 拼团买专业摄影服务，人越多越划算</p>
      <div class="hero-actions">
        <n-button type="primary" size="large" @click="router.push('/films')">去选胶卷</n-button>
        <n-button size="large" @click="router.push('/activities')">参加活动</n-button>
        <n-button size="large" @click="router.push('/me')">注册体验</n-button>
      </div>
    </section>

    <section class="features">
      <FeatureCard title="拼团更省" desc="和同好一起拼专业摄影服务，人越多价越低" />
      <FeatureCard title="品质保证" desc="商家资质审核，平台担保交易与售后" />
      <FeatureCard title="同好社区" desc="作品分享、晒单评价，找到摄影同路人" />
    </section>
  </div>
</template>
