<script setup lang="ts">
import { ref } from "vue"
import { NButton, NCard, NEmpty, NSpace } from "naive-ui"

import { api } from "@/api/client"
import type { UserDto } from "@evergrow/contracts"

const profile = ref<UserDto | null>(null)
const loading = ref(false)
const error = ref("")

async function demoRegister() {
  loading.value = true
  error.value = ""
  try {
    const { data } = await api.register({ phone: "13800138000", nickname: "摄影团团用户" })
    profile.value = data
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="page">
    <h2 class="page-title">我的</h2>
    <n-space vertical :size="16">
      <n-button type="primary" :loading="loading" @click="demoRegister">
        注册演示用户
      </n-button>
      <p v-if="error" class="error-text">{{ error }}</p>
      <n-empty
        v-if="!profile && !error"
        description="还没有用户数据，点击上方按钮体验注册"
      />
      <n-card v-if="profile">
        <p><strong>昵称：</strong>{{ profile.nickname }}</p>
        <p><strong>手机号：</strong>{{ profile.phone }}</p>
        <p><strong>状态：</strong>{{ profile.status }}</p>
        <p><strong>ID：</strong>{{ profile.id }}</p>
      </n-card>
    </n-space>
  </div>
</template>
