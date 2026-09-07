<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from "vue"
import { useRoute, useRouter } from "vue-router"
import { NButton, NEmpty, NInputNumber, NProgress, NSpin, NTag } from "naive-ui"

import { api } from "@/api/client"
import { useHubStore } from "@/stores/hub"
import type { FilmDto, HubDto } from "@evergrow/contracts"

const route = useRoute()
const router = useRouter()
const hubStore = useHubStore()
const hubId = route.params.hubId as string

const hub = ref<HubDto | null>(null)
const films = ref<FilmDto[]>([])
const quantities = reactive<Record<string, number>>({})
const formatFilter = ref<"all" | "135" | "120">("all")
const loading = ref(true)
const joining = ref<string | null>(null)
const error = ref("")

const FILTERS = [
  { key: "all", label: "全部" },
  { key: "135", label: "135 画幅" },
  { key: "120", label: "120 中画幅" },
] as const

const visibleFilms = computed(() =>
  formatFilter.value === "all"
    ? films.value
    : films.value.filter((f) => f.format === formatFilter.value),
)

/** 进入商品详情：记录当前位置点，便于后续复用 */
function openFilm(film: FilmDto) {
  hubStore.setHub(hubId)
  router.push(`/films/${film.id}`)
}

async function load() {
  try {
    const [hubsRes, filmsRes] = await Promise.all([api.listHubs(), api.listFilms(hubId)])
    hub.value = hubsRes.data.find((h) => h.id === hubId) ?? null
    films.value = filmsRes.data
    for (const f of filmsRes.data) {
      quantities[f.id] = quantities[f.id] ?? 1
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

async function joinGroupBuy(film: FilmDto) {
  const qty = quantities[film.id] ?? 1
  joining.value = film.id
  error.value = ""
  const original = films.value.find((f) => f.id === film.id)

  // 乐观更新：数量、人数、已加入立即反馈（失败则回滚）
  const patch = (memberCount: number, participantCount: number, joinedByMe: boolean) => {
    const i = films.value.findIndex((f) => f.id === film.id)
    if (i >= 0) {
      films.value[i] = { ...films.value[i]!, memberCount, participantCount, joinedByMe }
    }
  }
  if (original) patch(original.memberCount + qty, original.participantCount + 1, true)

  try {
    const { data } = await api.joinGroupBuy(hubId, film.id, qty)
    patch(data.memberCount, data.participantCount, data.joinedByMe)
  } catch (e) {
    if (original) patch(original.memberCount, original.participantCount, original.joinedByMe)
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    joining.value = null
  }
}

const yuan = (cents: number) => `¥${(cents / 100).toFixed(1)}`
const percentOf = (film: FilmDto) =>
  Math.min(100, Math.round((film.memberCount / film.threshold) * 100))

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
    <div class="hub-header">
      <div>
        <h2 class="page-title">{{ hub?.name ?? "位置点" }}</h2>
        <p v-if="hub" class="page-sub">{{ hub.city }} · {{ hub.address }}</p>
      </div>
      <div class="format-filter">
        <button
          v-for="f in FILTERS"
          :key="f.key"
          type="button"
          class="format-chip"
          :class="{ active: formatFilter === f.key }"
          @click="formatFilter = f.key"
        >
          {{ f.label }}
        </button>
      </div>
    </div>

    <n-spin :show="loading">
      <n-empty
        v-if="!loading && visibleFilms.length === 0"
        description="该画幅暂无可团购的胶卷"
      />
      <div v-else class="film-grid">
        <div
          v-for="film in visibleFilms"
          :key="film.id"
          class="film-card"
          role="button"
          tabindex="0"
          @click="openFilm(film)"
          @keydown.enter="openFilm(film)"
        >
          <div class="film-cover">
            <img :src="film.coverImageUrl" :alt="film.name" loading="lazy" />
            <span class="cover-format">{{ film.format }}</span>
            <n-tag v-if="film.joinedByMe" class="cover-joined" type="success" size="small" round>
              已加入心愿单
            </n-tag>
          </div>
          <div class="film-body">
            <div class="film-head">
              <span class="film-name">{{ film.name }}</span>
              <span class="film-iso">ISO {{ film.iso }}</span>
            </div>
            <p class="film-brand">{{ film.brand }} · {{ film.process }}</p>
            <p class="film-prices">
              <span class="price-deal">{{ yuan(film.groupBuyPriceInCents) }}</span>
              <span class="price-origin">{{ yuan(film.basePriceInCents) }}</span>
              <span class="price-save">团购省{{ yuan(film.basePriceInCents - film.groupBuyPriceInCents) }}</span>
            </p>
            <div class="film-progress">
              <n-progress
                type="line"
                :percentage="percentOf(film)"
                :height="6"
                :show-indicator="false"
                status="success"
              />
              <span class="progress-text">
                {{ film.memberCount }}/{{ film.threshold }} 件 ·
                {{ film.participantCount }} 人参与
                <template v-if="film.memberCount >= film.threshold"> · 已成团</template>
                <template v-else> · 还差 {{ film.threshold - film.memberCount }} 件</template>
              </span>
            </div>
            <div class="film-join-row">
              <n-input-number
                v-if="!film.joinedByMe"
                v-model:value="quantities[film.id]"
                :min="1"
                :max="99"
                size="small"
                class="film-qty"
              />
              <n-button
                block
                size="small"
                :type="film.joinedByMe ? 'default' : 'primary'"
                :disabled="film.joinedByMe"
                :loading="joining === film.id"
                @click.stop="joinGroupBuy(film)"
              >
                {{ film.joinedByMe ? "已加入" : `加入心愿单 ×${quantities[film.id] ?? 1}` }}
              </n-button>
            </div>
          </div>
        </div>
      </div>
    </n-spin>

    <p v-if="error" class="error-text">{{ error }}</p>
  </div>
</template>
