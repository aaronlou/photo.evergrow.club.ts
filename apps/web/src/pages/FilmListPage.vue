<script setup lang="ts">
import { onMounted, ref } from "vue"
import { useRouter } from "vue-router"
import { NEmpty, NSpin, NTag } from "naive-ui"

import { api } from "@/api/client"
import type { FilmCatalogDto } from "@evergrow/contracts"

const router = useRouter()
const films = ref<FilmCatalogDto[]>([])
const loading = ref(true)
const error = ref("")

async function load() {
  try {
    films.value = (await api.listAllFilms()).data
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

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
    </div>

    <n-spin :show="loading">
      <n-empty v-if="!loading && films.length === 0" description="暂无可选胶卷" />
      <div v-else class="film-grid">
        <div
          v-for="film in films"
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
