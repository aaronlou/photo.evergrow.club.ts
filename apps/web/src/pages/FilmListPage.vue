<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { useRouter } from "vue-router"
import { NEmpty, NInput, NSpin, NTag } from "naive-ui"

import { api } from "@/api/client"
import type { FilmCatalogDto } from "@evergrow/contracts"

const router = useRouter()
const films = ref<FilmCatalogDto[]>([])
const loading = ref(true)
const error = ref("")
const activeFormat = ref<"135" | "120">("135")
type SortKey = "default" | "price" | "threshold"
const sortKey = ref<SortKey>("default")
const sortAsc = ref(true)

const sortOptions: { key: SortKey; label: string }[] = [
  { key: "default", label: "默认" },
  { key: "price", label: "成团价" },
  { key: "threshold", label: "成团件数" },
]

function pickSort(key: SortKey) {
  if (sortKey.value === key && key !== "default") {
    // 再点一次同项：切换正/倒序
    sortAsc.value = !sortAsc.value
  } else {
    sortKey.value = key
    sortAsc.value = true
  }
}

async function load() {
  try {
    films.value = (await api.listAllFilms()).data
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

const keyword = ref("")

const filteredFilms = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  const list = films.value.filter((f) => {
    if (f.format !== activeFormat.value) return false
    if (!kw) return true
    // 名称 / 品牌 / 特性 / 适用场景 模糊匹配
    return [f.name, f.brand, ...f.features, ...f.scenarios].some((text) =>
      text.toLowerCase().includes(kw),
    )
  })
  if (sortKey.value === "default") return list
  const field = sortKey.value === "price" ? "groupBuyPriceInCents" : "threshold"
  return [...list].sort((a, b) =>
    sortAsc.value ? a[field] - b[field] : b[field] - a[field],
  )
})

const yuan = (cents: number) => `¥${(cents / 100).toFixed(1)}`

onMounted(load)
</script>

<template>
  <div class="page">
    <div class="activity-head">
      <div>
        <h2 class="page-title">选胶卷</h2>
        <p class="page-sub">先挑心仪的胶卷，再选个位置点参与拼团；位置点选定后会自动复用</p>
      </div>
      <div class="format-switch" role="tablist" aria-label="画幅切换">
        <button
          role="tab"
          :aria-selected="activeFormat === '135'"
          :class="{ active: activeFormat === '135' }"
          @click="activeFormat = '135'"
        >
          135
        </button>
        <button
          role="tab"
          :aria-selected="activeFormat === '120'"
          :class="{ active: activeFormat === '120' }"
          @click="activeFormat = '120'"
        >
          120
        </button>
      </div>
    </div>

    <div class="film-sortbar">
      <n-input
        v-model:value="keyword"
        class="film-search"
        size="small"
        clearable
        placeholder="搜索：人像、夜拍、国货、Kodak…"
      />
      <span class="sortbar-label">排序</span>
      <button
        v-for="opt in sortOptions"
        :key="opt.key"
        class="sortbar-item"
        :class="{ active: sortKey === opt.key }"
        @click="pickSort(opt.key)"
      >
        {{ opt.label }}
        <span v-if="sortKey === opt.key && opt.key !== 'default'" class="sortbar-dir">
          {{ sortAsc ? "↑" : "↓" }}
        </span>
      </button>
    </div>

    <n-spin :show="loading">
      <n-empty
        v-if="!loading && filteredFilms.length === 0"
        :description="keyword ? `没有匹配「${keyword}」的胶卷` : '当前画幅暂无可选胶卷'"
      />
      <div v-else class="film-grid">
        <div
          v-for="film in filteredFilms"
          :key="film.id"
          class="film-card"
          role="button"
          tabindex="0"
          @click="router.push(`/films/${film.id}`)"
          @keydown.enter="router.push(`/films/${film.id}`)"
        >
          <div class="film-cover">
            <img :src="film.coverImageUrl" :alt="film.name" loading="lazy" />
            <span class="cover-format">{{ film.format }}</span>
          </div>
          <div class="film-body">
            <div class="film-head">
              <span class="film-name">{{ film.name }}</span>
              <span class="film-iso">ISO {{ film.iso }}</span>
            </div>
            <p class="film-brand">{{ film.brand }} · {{ film.process }}</p>
            <div v-if="film.features.length" class="film-tags">
              <span v-for="f in film.features.slice(0, 2)" :key="f" class="film-tag">{{ f }}</span>
            </div>
            <p v-if="film.scenarios.length" class="film-scenes" :title="film.scenarios.join(' / ')">
              <span class="scenes-label">适用</span>{{ film.scenarios.slice(0, 4).join(" · ") }}
            </p>
            <p class="film-prices">
              <span class="price-deal">{{ yuan(film.groupBuyPriceInCents) }}</span>
              <span class="price-origin">{{ yuan(film.basePriceInCents) }}</span>
              <span class="price-save">拼团省{{ yuan(film.basePriceInCents - film.groupBuyPriceInCents) }}</span>
            </p>
            <div class="film-progress">
              <n-tag size="small" type="warning" round>满 {{ film.threshold }} 件即成团</n-tag>
            </div>
          </div>
        </div>
      </div>
    </n-spin>

    <p v-if="error" class="error-text">{{ error }}</p>
  </div>
</template>
