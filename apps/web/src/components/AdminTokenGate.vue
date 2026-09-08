<script setup lang="ts">
// 管理端令牌门禁：输入 ADMIN_TOKEN 后才能访问管理功能（逻辑在 stores/adminAuth）
import { NButton, NInput, NP } from "naive-ui"

import { useAdminAuthStore } from "@/stores/adminAuth"

const auth = useAdminAuthStore()
</script>

<template>
  <div class="token-gate">
    <n-p>请输入管理员令牌（服务器 ADMIN_TOKEN 环境变量）</n-p>
    <div class="token-row">
      <n-input
        v-model:value="auth.tokenDraft"
        type="password"
        show-password-on="click"
        placeholder="ADMIN_TOKEN"
        :disabled="auth.checking"
        @keydown.enter="auth.saveToken()"
      />
      <n-button type="primary" :loading="auth.checking" @click="auth.saveToken()">进入</n-button>
    </div>
  </div>
</template>

<style scoped>
.token-gate {
  background: #fff;
  border: 1px solid #e8ede9;
  border-radius: 14px;
  padding: 28px;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.token-row {
  display: flex;
  gap: 8px;
}
</style>
