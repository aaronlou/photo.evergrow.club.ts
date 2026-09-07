<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue"
import { useRoute, useRouter } from "vue-router"
import { NButton, NEmpty, NProgress, NSpin, NTag } from "naive-ui"

import { api } from "@/api/client"
import type { FilmDto, HubDto } from "@evergrow/contracts"

const route = useRoute()
const router = useRouter()
const hubId = route.params.hubId as string

const hub = ref<HubDto | null>(null)
const films = ref<FilmDto[]>([])
const loading = ref(true)
const joining = ref<string | null>(null)
const error = ref("")

async function load() {
  try {
    const [hubsRes, filmsRes] = await Promise.all([api.listHubs(), api.listFilms(hubId)])
    hub.value = hubsRes.data.find((h) => h.id === hubId) ?? null
    films.value = filmsRes.data
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

async function joinGroupBuy(film: FilmDto) {
  joining.value = film.id
  error.value = ""
  try {
    const { data } = await api.joinGroupBuy(hubId, film.id)
    const index = films.value.findIndex((f) => f.id === film.id)
    if (index >= 0) {
      films.value[index] = {
        ...films.value[index]!,
        memberCount: data.memberCount,
        joinedByMe: data.joinedByMe,
      }
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    joining.value = null
  }
}

const yuan = (cents: number) => `¥${(cents / 100).toFixed(1)}`
const percent = computed(() => (film: FilmDto) =>
  Math.min(100, Math.round((film.memberCount / film.threshold) * 100)),
)

// 拼团进度轮询（等待达到成团数量）
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  load()
  timer = setInterval(() => void load(), 5000)
})
onUnmounted(() => clearInterval(timer))
</script>

<template>
  <div class="page">
    <n-button size="small" text @click="router.push('/groups')">← 返回位置点</n-button>
    <h2 class="page-title">{{ hub?.name ?? "位置点" }}</h2>
    <p v-if="hub" class="page-sub">{{ hub.city }} · {{ hub.address }}</p>

    <n-spin :show="loading">
      <n-empty v-if="!loading && films.length === 0" description="该位置点暂无可团购的胶卷" />
      <div v-else class="film-grid">
        <div
          v-for="film in films"
          :key="film.id"
          class="film-card"
          role="button"
          tabindex="0"
          @click="router.push(`/groups/${hubId}/films/${film.id}`)"
          @keydown.enter="router.push(`/groups/${hubId}/films/${film.id}`)"
        >
          <div class="film-head">
            <span class="film-name">{{ film.name }}</span>
            <n-tag v-if="film.joinedByMe" type="success" size="small">已加入心愿单</n-tag>
          </div>
          <p class="film-brand">{{ film.brand }} · {{ film.format }} · ISO {{ film.iso }}</p>
          <p class="film-prices">
            <span class="price-deal">{{ yuan(film.groupBuyPriceInCents) }}</span>
            <span class="price-origin">{{ yuan(film.basePriceInCents) }}</span>
            <span class="price-save">
              省 {{ yuan(film.basePriceInCents - film.groupBuyPriceInCents) }}
            </span>
          </p>
          <div class="film-progress">
            <n-progress
              type="line"
              :percentage="percent(film)"
              :height="8"
              :show-indicator="false"
              status="success"
            />
            <span class="progress-text">
              {{ film.memberCount }}/{{ film.threshold }} 人
              {{ film.memberCount >= film.threshold ? "· 已成团" : "· 还差 " + (film.threshold - film.memberCount) + " 人" }}
            </span>
          </div>
          <n-button
            size="small"
            :type="film.joinedByMe ? 'default' : 'primary'"
            :disabled="film.joinedByMe"
            :loading="joining === film.id"
            @click.stop="joinGroupBuy(film)"
          >
            {{ film.joinedByMe ? "已加入" : "加入心愿单" }}
          </n-button>
        </div>
      </div>
    </n-spin>

    <p v-if="error" class="error-text">{{ error }}</p>
  </div>
</template>
