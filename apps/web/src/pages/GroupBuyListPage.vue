<script setup lang="ts">
import { onMounted, ref } from "vue"
import { useRouter } from "vue-router"
import { NButton, NCard, NEmpty, NSpin, NTag } from "naive-ui"

import { api } from "@/api/client"
import type { HubDto } from "@evergrow/contracts"

const router = useRouter()
const hubs = ref<HubDto[]>([])
const loading = ref(true)
const joining = ref<string | null>(null)
const error = ref("")

async function load() {
  try {
    hubs.value = (await api.listHubs()).data
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

async function join(hub: HubDto) {
  joining.value = hub.id
  error.value = ""
  try {
    const { data } = await api.joinHub(hub.id)
    const index = hubs.value.findIndex((h) => h.id === hub.id)
    if (index >= 0) hubs.value[index] = data
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    joining.value = null
  }
}

onMounted(load)
</script>

<template>
  <div class="page">
    <h2 class="page-title">拼团位置点</h2>
    <p class="page-sub">选择你方便取货的位置点，加入后即可参与该点的胶卷团购</p>

    <n-spin :show="loading">
      <n-empty
        v-if="!loading && hubs.length === 0"
        description="暂无可用的团购位置点"
      />
      <div v-else class="hub-grid">
        <n-card v-for="hub in hubs" :key="hub.id" class="hub-card">
          <div class="hub-head">
            <span class="hub-name">{{ hub.name }}</span>
            <n-tag v-if="hub.joinedByMe" type="success" size="small">已加入</n-tag>
          </div>
          <p class="hub-addr">{{ hub.city }} · {{ hub.address }}</p>
          <p class="hub-meta">{{ hub.memberCount }} 人已加入</p>
          <div class="hub-actions">
            <n-button
              v-if="!hub.joinedByMe"
              type="primary"
              size="small"
              :loading="joining === hub.id"
              @click="join(hub)"
            >
              加入位置点
            </n-button>
            <n-button v-else size="small" @click="router.push(`/groups/${hub.id}`)">
              进入商品页 →
            </n-button>
          </div>
        </n-card>
      </div>
    </n-spin>

    <p v-if="error" class="error-text">{{ error }}</p>
  </div>
</template>
