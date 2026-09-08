<script setup lang="ts">
import { onMounted } from "vue"
import { useRouter } from "vue-router"
import { NButton, NCard, NDescriptions, NDescriptionsItem, NEmpty, NSpace, useMessage } from "naive-ui"

import { useAuthStore } from "@/stores/auth"

const auth = useAuthStore()
const router = useRouter()
const message = useMessage()

onMounted(() => {
  void auth.fetchMe()
})

async function logout() {
  await auth.logout()
  message.success("已退出登录")
  void router.push("/")
}
</script>

<template>
  <div class="page">
    <h2 class="page-title">我的</h2>
    <n-space vertical :size="16">
      <n-card v-if="auth.isLoggedIn && auth.user">
        <n-descriptions :column="1" label-placement="left">
          <n-descriptions-item label="昵称">{{ auth.user.nickname }}</n-descriptions-item>
          <n-descriptions-item label="手机号">{{ auth.user.phone }}</n-descriptions-item>
          <n-descriptions-item label="状态">
            {{ auth.user.status === "Active" ? "正常" : auth.user.status }}
          </n-descriptions-item>
          <n-descriptions-item label="用户 ID">{{ auth.user.id }}</n-descriptions-item>
        </n-descriptions>
        <n-space style="margin-top: 16px">
          <router-link to="/me/activities"><n-button quaternary>我的报名</n-button></router-link>
          <n-button quaternary type="error" @click="logout">退出登录</n-button>
        </n-space>
      </n-card>

      <div v-else class="login-cta">
        <n-empty description="登录后可参团、付订金、管理报名">
          <template #extra>
            <router-link to="/login?redirect=/me">
              <n-button type="primary">去登录 / 注册</n-button>
            </router-link>
          </template>
        </n-empty>
      </div>
    </n-space>
  </div>
</template>

<style scoped>
.login-cta {
  background: #fff;
  border: 1px solid #e8ede9;
  border-radius: 14px;
  padding: 48px 24px;
}
</style>
