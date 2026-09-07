<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue"
import { useRoute, useRouter } from "vue-router"
import {
  NButton,
  NEmpty,
  NImage,
  NImageGroup,
  NProgress,
  NSpin,
  NTag,
  NUpload,
  useMessage,
  type UploadCustomRequestOptions,
} from "naive-ui"

import { api } from "@/api/client"
import type { FilmDetailDto } from "@evergrow/contracts"

const route = useRoute()
const router = useRouter()
const message = useMessage()

const hubId = route.params.hubId as string
const filmId = route.params.filmId as string

const film = ref<FilmDetailDto | null>(null)
const loading = ref(true)
const joining = ref(false)
const uploading = ref(false)
const error = ref("")

async function load() {
  try {
    film.value = (await api.getFilm(hubId, filmId)).data
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

async function refreshProgress() {
  if (!film.value) return
  try {
    const { data } = await api.getGroupProgress(hubId, filmId)
    film.value = { ...film.value, memberCount: data.memberCount, joinedByMe: data.joinedByMe }
  } catch {
    // 轮询失败静默处理，下一次重试
  }
}

async function joinGroupBuy() {
  joining.value = true
  error.value = ""
  try {
    const { data } = await api.joinGroupBuy(hubId, filmId)
    if (film.value) {
      film.value = { ...film.value, memberCount: data.memberCount, joinedByMe: data.joinedByMe }
    }
    message.success("已加入团购心愿单，成团后将通知你")
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
    if (error.value.includes("加入位置点")) {
      message.warning("请先回到位置点页面加入该位置点")
    }
  } finally {
    joining.value = false
  }
}

async function handleUpload({ file, onFinish, onError }: UploadCustomRequestOptions) {
  const raw = file.file
  if (!raw) {
    onError()
    return
  }
  uploading.value = true
  try {
    await api.uploadSampleImage(filmId, raw)
    onFinish()
    message.success("样片上传成功")
    await load()
  } catch (e) {
    onError()
    message.error(e instanceof Error ? e.message : "上传失败")
  } finally {
    uploading.value = false
  }
}

const yuan = (cents: number) => `¥${(cents / 100).toFixed(1)}`
const percent = computed(() =>
  film.value ? Math.min(100, Math.round((film.value.memberCount / film.value.threshold) * 100)) : 0,
)
const remaining = computed(() =>
  film.value ? Math.max(0, film.value.threshold - film.value.memberCount) : 0,
)

// 拼团进度轮询（等待达到成团数量）
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  load()
  timer = setInterval(() => void refreshProgress(), 5000)
})
onUnmounted(() => clearInterval(timer))
</script>

<template>
  <div class="page">
    <n-button size="small" text @click="router.push(`/groups/${hubId}`)">
      ← 返回商品列表
    </n-button>

    <n-spin :show="loading">
      <template v-if="film">
        <div class="detail-head">
          <div>
            <h2 class="page-title">{{ film.name }}</h2>
            <p class="film-brand">
              {{ film.brand }} · {{ film.format }} 画幅 · ISO {{ film.iso }} · {{ film.process }}
            </p>
          </div>
          <div class="detail-price">
            <span class="price-deal big">{{ yuan(film.groupBuyPriceInCents) }}</span>
            <span class="price-origin">{{ yuan(film.basePriceInCents) }}</span>
            <span class="price-save">
              团购省 {{ yuan(film.basePriceInCents - film.groupBuyPriceInCents) }}
            </span>
          </div>
        </div>

        <section class="detail-section">
          <h3>团购进度</h3>
          <n-progress
            type="line"
            :percentage="percent"
            :height="12"
            status="success"
          />
          <p class="progress-text">
            <template v-if="remaining > 0">
              已有 {{ film.memberCount }} 人加入，还差 {{ remaining }} 人成团（需满
              {{ film.threshold }} 人）
            </template>
            <template v-else>已达 {{ film.threshold }} 人，本团已成立 🎉</template>
          </p>
          <n-button
            type="primary"
            size="large"
            :disabled="film.joinedByMe"
            :loading="joining"
            @click="joinGroupBuy"
          >
            {{ film.joinedByMe ? "已加入心愿单" : "加入团购心愿单" }}
          </n-button>
        </section>

        <section class="detail-section">
          <h3>胶卷特性</h3>
          <div class="tag-row">
            <n-tag v-for="(f, i) in film.features" :key="i" type="info" round>
              {{ f }}
            </n-tag>
          </div>
        </section>

        <section class="detail-section">
          <h3>适用场景</h3>
          <div class="tag-row">
            <n-tag v-for="(s, i) in film.scenarios" :key="i" type="warning" round>
              {{ s }}
            </n-tag>
          </div>
        </section>

        <section class="detail-section">
          <div class="section-head">
            <h3>冲洗样片</h3>
            <n-upload
              :custom-request="handleUpload"
              :show-file-list="false"
              accept="image/*"
            >
              <n-button :loading="uploading" size="small" type="primary" ghost>
                上传我的样片
              </n-button>
            </n-upload>
          </div>
          <n-empty
            v-if="film.sampleImages.length === 0"
            description="还没有样片，来传第一张吧"
          />
          <n-image-group v-else>
            <div class="gallery">
              <n-image
                v-for="img in film.sampleImages"
                :key="img.id"
                :src="img.url"
                class="gallery-item"
                object-fit="cover"
              />
            </div>
          </n-image-group>
        </section>
      </template>

      <n-empty v-if="!loading && !film" :description="error || '未找到该商品'" />
    </n-spin>
  </div>
</template>
