<script setup lang="ts">
import { useRouter } from "vue-router"
import { NButton } from "naive-ui"

import FeatureCard from "@/components/FeatureCard.vue"

const router = useRouter()
</script>

<template>
  <div class="home">
    <section class="hero">
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
