<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue"
import { useRoute, useRouter } from "vue-router"
import {
  NButton,
  NDynamicTags,
  NEmpty,
  NImage,
  NImageGroup,
  NInputNumber,
  NModal,
  NProgress,
  NSpin,
  NTag,
  NUpload,
  useMessage,
  type UploadCustomRequestOptions,
} from "naive-ui"

import { api, ADMIN_TOKEN_KEY, ApiClientError, getMyUserId } from "@/api/client"
import { useHubStore } from "@/stores/hub"
import type { FilmCatalogDetailDto, GroupProgressDto, HubDto } from "@evergrow/contracts"

const route = useRoute()
const router = useRouter()
const message = useMessage()
const hubStore = useHubStore()

const filmId = route.params.filmId as string
const routeHubId = typeof route.params.hubId === "string" ? (route.params.hubId as string) : null
const selectedHubId = computed(() => hubStore.selectedHubId ?? routeHubId)

const film = ref<FilmCatalogDetailDto | null>(null)
const progress = ref<GroupProgressDto | null>(null)
const quantity = ref(1)
const loading = ref(true)
const joining = ref(false)
const paying = ref(false)
const uploading = ref(false)
const error = ref("")

// 位置点选择
const showHubPicker = ref(false)
const hubPickerLoading = ref(false)
const hubs = ref<HubDto[]>([])
let pendingJoinAfterPick = false

async function load() {
  try {
    const filmRes = await api.getFilmById(filmId)
    film.value = filmRes.data
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
    loading.value = false
    return
  }
  await refreshProgress()
  loading.value = false
}

async function refreshProgress() {
  const hubId = selectedHubId.value
  if (!hubId) {
    progress.value = null
    return
  }
  try {
    const { data } = await api.getGroupProgress(hubId, filmId)
    progress.value = data
  } catch {
    progress.value = null
  }
}

async function openHubPicker() {
  showHubPicker.value = true
  hubPickerLoading.value = true
  try {
    hubs.value = (await api.listHubs()).data
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    hubPickerLoading.value = false
  }
}

async function chooseHub(hub: HubDto) {
  try {
    await hubStore.selectHub(hub.id)
    showHubPicker.value = false
    message.success(`已选择位置点：${hub.name}`)
    await refreshProgress()
    if (pendingJoinAfterPick) {
      pendingJoinAfterPick = false
      await joinGroupBuy()
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
    message.error(error.value)
  }
}

async function joinGroupBuy() {
  const hubId = selectedHubId.value
  if (!hubId) {
    pendingJoinAfterPick = true
    await openHubPicker()
    return
  }
  joining.value = true
  error.value = ""
  try {
    const { data } = await api.joinGroupBuy(hubId, filmId, quantity.value)
    progress.value = data
    message.success("已加入拼单，成团后将通知你")
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
    if (e instanceof ApiClientError && e.body?.code === "HubNotJoined") {
      pendingJoinAfterPick = true
      await openHubPicker()
    } else {
      message.error(error.value)
    }
  } finally {
    joining.value = false
  }
}

async function payDeposit() {
  const hubId = selectedHubId.value
  if (!hubId) {
    pendingJoinAfterPick = true
    await openHubPicker()
    return
  }
  paying.value = true
  error.value = ""
  try {
    const { data } = await api.payDeposit(hubId, filmId)
    progress.value = data
    message.success("订金已支付（模拟，货到付款）")
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
    message.error(error.value)
  } finally {
    paying.value = false
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

// 特性 / 适用场景：用户协作编辑
const editingFeatures = ref(false)
const editingScenarios = ref(false)
const featuresDraft = ref<string[]>([])
const scenariosDraft = ref<string[]>([])
const savingInfo = ref(false)

function editFeatures() {
  featuresDraft.value = [...(film.value?.features ?? [])]
  editingFeatures.value = true
}

function editScenarios() {
  scenariosDraft.value = [...(film.value?.scenarios ?? [])]
  editingScenarios.value = true
}

async function saveInfo(part: "features" | "scenarios") {
  if (!film.value) return
  savingInfo.value = true
  try {
    const input =
      part === "features"
        ? { features: featuresDraft.value }
        : { scenarios: scenariosDraft.value }
    const { data } = await api.contributeFilmInfo(film.value.id, input)
    film.value = data
    if (part === "features") editingFeatures.value = false
    else editingScenarios.value = false
    message.success("已更新，感谢共建")
  } catch (e) {
    message.error(e instanceof ApiClientError ? e.message : String(e))
  } finally {
    savingInfo.value = false
  }
}

// 样片删除：上传者本人或管理员（本地存有管理令牌即视为管理员身份，由后端最终校验）
const myUserId = getMyUserId()
const hasAdminToken = !!localStorage.getItem(ADMIN_TOKEN_KEY)

function canDeleteImage(uploadedBy: string): boolean {
  return uploadedBy === myUserId || hasAdminToken
}

async function removeImage(imageId: string) {
  if (!film.value) return
  if (!window.confirm("确定删除这张样片吗？")) return
  try {
    const { data } = await api.deleteSampleImage(film.value.id, imageId)
    film.value = data
    message.success("样片已删除")
  } catch (e) {
    message.error(e instanceof ApiClientError ? e.message : String(e))
  }
}

const yuan = (cents: number) => `¥${(cents / 100).toFixed(1)}`
const memberCount = computed(() => progress.value?.memberCount ?? 0)
const participantCount = computed(() => progress.value?.participantCount ?? 0)
const joinedByMe = computed(() => progress.value?.joinedByMe ?? false)
const threshold = computed(() => film.value?.threshold ?? 0)
const percent = computed(() =>
  threshold.value ? Math.min(100, Math.round((memberCount.value / threshold.value) * 100)) : 0,
)
const remaining = computed(() => Math.max(0, threshold.value - memberCount.value))
const unitPrice = computed(() => film.value?.groupBuyPriceInCents ?? 0)
const previewTotal = computed(() => unitPrice.value * quantity.value)
const previewDeposit = computed(() => Math.floor(previewTotal.value * 0.1))
const orderUnit = computed(() => progress.value?.unitPriceInCents ?? unitPrice.value)
const orderQty = computed(() => progress.value?.myQuantity ?? quantity.value)
const orderTotal = computed(() => progress.value?.totalInCents ?? previewTotal.value)
const orderDeposit = computed(() => progress.value?.depositInCents ?? previewDeposit.value)
const orderPaid = computed(() => progress.value?.depositPaid ?? false)

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
    <n-button size="small" text @click="router.push('/films')">← 返回选胶卷</n-button>

    <n-spin :show="loading">
      <template v-if="film">
        <div class="detail-hero">
          <div class="detail-cover">
            <img :src="film.coverImageUrl" :alt="film.name" />
          </div>
          <div class="detail-info">
            <div class="tag-row detail-tags">
              <n-tag type="success" round>{{ film.format }} 画幅</n-tag>
              <n-tag type="info" round>ISO {{ film.iso }}</n-tag>
              <n-tag type="info" round>{{ film.process }}</n-tag>
            </div>
            <h2 class="detail-name">{{ film.name }}</h2>
            <p class="film-brand">{{ film.brand }}</p>
            <div class="detail-prices">
              <span class="price-deal big">{{ yuan(film.groupBuyPriceInCents) }}</span>
              <span class="price-origin">{{ yuan(film.basePriceInCents) }}</span>
              <span class="price-save">
                拼团省 {{ yuan(film.basePriceInCents - film.groupBuyPriceInCents) }}
              </span>
            </div>

            <!-- 未选位置点：提示选择 -->
            <div v-if="!selectedHubId" class="hub-gate">
              <p class="hub-gate-text">参与拼团前，先选一个位置点（取货/成团点）</p>
              <n-button type="primary" size="large" block @click="openHubPicker">
                选择位置点参与拼团
              </n-button>
            </div>

            <!-- 已选位置点：进度 + 拼单 -->
            <div v-else>
              <div class="hub-current">
                <n-tag type="success" round>位置点已选</n-tag>
                <n-button size="tiny" text @click="openHubPicker">切换位置点</n-button>
              </div>
              <div class="detail-progress">
                <n-progress type="line" :percentage="percent" :height="10" status="success" />
                <p class="progress-text">
                  <template v-if="remaining > 0">
                    已有 {{ memberCount }} 件 · {{ participantCount }} 人参与，还差
                    {{ remaining }} 件成团（需满 {{ threshold }} 件）
                  </template>
                  <template v-else>已达 {{ threshold }} 件，本团已成立 🎉</template>
                </p>
              </div>

              <div v-if="joinedByMe" class="detail-order">
                <p class="order-title">我的拼单（货到付款）</p>
                <div class="order-rows">
                  <div class="order-row"><span>数量</span><span>×{{ orderQty }}</span></div>
                  <div class="order-row"><span>成交单价</span><span>¥{{ (orderUnit / 100).toFixed(2) }}</span></div>
                  <div class="order-row"><span>商品总金额</span><span>¥{{ (orderTotal / 100).toFixed(2) }}</span></div>
                  <div class="order-row"><span>订金（10%）</span><span>¥{{ (orderDeposit / 100).toFixed(2) }}</span></div>
                  <div class="order-row"><span>服务模式</span><span>货到付款</span></div>
                </div>
                <n-button
                  v-if="!orderPaid"
                  type="warning"
                  block
                  :loading="paying"
                  @click="payDeposit"
                >
                  支付订金 ¥{{ (orderDeposit / 100).toFixed(2) }}（模拟）
                </n-button>
                <n-tag v-else type="success" round>订金已付</n-tag>
              </div>

              <div v-else class="detail-join">
                <div class="detail-join-row">
                  <span class="detail-qty-label">数量</span>
                  <n-input-number v-model:value="quantity" :min="1" :max="99" class="detail-qty" />
                </div>
                <p class="detail-total">
                  预估总价 {{ yuan(previewTotal) }} · 订金 {{ yuan(previewDeposit) }}（10%）
                </p>
                <n-button type="primary" size="large" block :loading="joining" @click="joinGroupBuy">
                  加入拼单（数量 ×{{ quantity }}）
                </n-button>
              </div>
            </div>
          </div>
        </div>

        <section class="detail-section">
          <div class="section-head">
            <h3>胶卷特性<span class="section-hint">人人可完善</span></h3>
            <n-button v-if="!editingFeatures" size="tiny" quaternary type="primary" @click="editFeatures">
              编辑
            </n-button>
          </div>
          <div v-if="!editingFeatures" class="tag-row">
            <n-tag v-for="(f, i) in film.features" :key="i" type="info" round>
              {{ f }}
            </n-tag>
          </div>
          <div v-else class="info-edit">
            <n-dynamic-tags v-model:value="featuresDraft" />
            <div class="info-edit-actions">
              <n-button size="tiny" @click="editingFeatures = false">取消</n-button>
              <n-button size="tiny" type="primary" :loading="savingInfo" @click="saveInfo('features')">
                保存
              </n-button>
            </div>
          </div>
        </section>

        <section class="detail-section">
          <div class="section-head">
            <h3>适用场景<span class="section-hint">人人可完善</span></h3>
            <n-button v-if="!editingScenarios" size="tiny" quaternary type="primary" @click="editScenarios">
              编辑
            </n-button>
          </div>
          <div v-if="!editingScenarios" class="tag-row">
            <n-tag v-for="(s, i) in film.scenarios" :key="i" type="warning" round>
              {{ s }}
            </n-tag>
          </div>
          <div v-else class="info-edit">
            <n-dynamic-tags v-model:value="scenariosDraft" />
            <div class="info-edit-actions">
              <n-button size="tiny" @click="editingScenarios = false">取消</n-button>
              <n-button size="tiny" type="primary" :loading="savingInfo" @click="saveInfo('scenarios')">
                保存
              </n-button>
            </div>
          </div>
        </section>

        <section class="detail-section">
          <div class="section-head">
            <h3>冲洗样片<span v-if="film.sampleImages.length" class="section-count">{{ film.sampleImages.length }}</span></h3>
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
              <div v-for="img in film.sampleImages" :key="img.id" class="gallery-cell">
                <n-image :src="img.url" class="gallery-item" />
                <button
                  v-if="canDeleteImage(img.uploadedBy)"
                  class="gallery-del"
                  title="删除样片"
                  @click="removeImage(img.id)"
                >
                  ×
                </button>
              </div>
            </div>
          </n-image-group>
        </section>
      </template>

      <n-empty v-if="!loading && !film" :description="error || '未找到该商品'" />
    </n-spin>

    <!-- 位置点选择弹窗 -->
    <n-modal
      v-model:show="showHubPicker"
      preset="card"
      title="选择位置点"
      :bordered="false"
      style="width: 90%; max-width: 520px"
    >
      <n-spin :show="hubPickerLoading">
        <div class="hub-picker-list">
          <button
            v-for="hub in hubs"
            :key="hub.id"
            type="button"
            class="hub-picker-item"
            @click="chooseHub(hub)"
          >
            <div class="hub-picker-head">
              <span class="hub-name">{{ hub.name }}</span>
              <n-tag v-if="hub.joinedByMe" type="success" size="small" round>已加入</n-tag>
            </div>
            <p class="hub-addr">{{ hub.city }} · {{ hub.address }}</p>
            <p class="hub-meta">{{ hub.memberCount }} 人已加入</p>
          </button>
          <n-empty v-if="!hubPickerLoading && hubs.length === 0" description="暂无可选位置点" />
        </div>
      </n-spin>
    </n-modal>
  </div>
</template>
