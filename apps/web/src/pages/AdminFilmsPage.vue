<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import {
  NButton,
  NDynamicTags,
  NEmpty,
  NInput,
  NInputNumber,
  NModal,
  NP,
  NSelect,
  NSpin,
  useMessage,
} from "naive-ui"

import { api, ADMIN_TOKEN_KEY, ApiClientError } from "@/api/client"
import type { FilmCatalogDetailDto, FilmCatalogDto } from "@evergrow/contracts"

/**
 * 商品后台管理（仅限管理员）：
 * - 访问 /admin/films，首次输入管理员令牌（后端 ADMIN_TOKEN）存入 localStorage
 * - 支持编辑商品描述 / 特性 / 适用场景，上传更换封面图
 */

const TOKEN_KEY = ADMIN_TOKEN_KEY
const message = useMessage()

const adminToken = ref(localStorage.getItem(TOKEN_KEY) ?? "")
const tokenDraft = ref("")

const loading = ref(true)
const saving = ref(false)
const uploadingCover = ref(false)
const films = ref<FilmCatalogDto[]>([])
const details = ref<Record<string, FilmCatalogDetailDto>>({})
const selectedId = ref<string>("")

const selected = computed(() => (selectedId.value ? details.value[selectedIdId()] : null))

function selectedIdId(): string {
  return selectedId.value
}

// 编辑表单（本地草稿，保存时提交）
const draft = ref<{ description: string; features: string[]; scenarios: string[] }>({
  description: "",
  features: [],
  scenarios: [],
})

const filmOptions = computed(() =>
  films.value.map((f) => ({
    label: `${f.name}（${f.format}）`,
    value: f.id,
  })),
)

function selectFilm(id: string) {
  selectedId.value = id
  const d = details.value[id]
  if (d) {
    draft.value = {
      description: d.description,
      features: [...d.features],
      scenarios: [...d.scenarios],
    }
  }
}

async function saveToken() {
  const t = tokenDraft.value.trim()
  if (!t) return
  // 用一个必然 401/非 401 的探测请求校验令牌：
  // - 401 → 令牌错误；其它错误（如商品不存在）说明令牌已通过校验
  try {
    adminToken.value = t
    await api.updateFilm("ping", {}, t)
    localStorage.setItem(TOKEN_KEY, t)
    message.success("令牌已保存")
    void load()
  } catch (e) {
    if (e instanceof ApiClientError && e.status === 401) {
      adminToken.value = ""
      message.error("令牌不正确")
    } else {
      // 令牌有效（探测请求因商品不存在而失败）
      localStorage.setItem(TOKEN_KEY, t)
      message.success("令牌已保存")
      void load()
    }
  }
}

async function load() {
  loading.value = true
  try {
    films.value = (await api.listAllFilms()).data
    const results = await Promise.all(films.value.map((f) => api.getFilmById(f.id)))
    for (const { data } of results) {
      details.value[data.id] = data
    }
    if (films.value.length > 0) selectFilm(films.value[0].id)
  } catch (e) {
    message.error(e instanceof Error ? e.message : String(e))
  } finally {
    loading.value = false
  }
}

// ===== 新增商品 =====
const showCreate = ref(false)
const creating = ref(false)
const newFilm = ref({
  name: "",
  brand: "",
  format: "135" as "135" | "120",
  iso: 200,
  process: "C-41",
  description: "",
  features: [] as string[],
  scenarios: [] as string[],
  basePriceYuan: 50,
  groupBuyPriceYuan: 40,
  threshold: 20,
})

function openCreate() {
  newFilm.value = {
    name: "",
    brand: "",
    format: "135",
    iso: 200,
    process: "C-41",
    description: "",
    features: [],
    scenarios: [],
    basePriceYuan: 50,
    groupBuyPriceYuan: 40,
    threshold: 20,
  }
  showCreate.value = true
}

async function create() {
  if (!newFilm.value.name.trim() || !newFilm.value.brand.trim()) {
    message.error("请填写商品名与品牌")
    return
  }
  creating.value = true
  try {
    const { data } = await api.createFilm(
      {
        name: newFilm.value.name.trim(),
        brand: newFilm.value.brand.trim(),
        format: newFilm.value.format,
        iso: newFilm.value.iso,
        process: newFilm.value.process,
        basePriceInCents: Math.round(newFilm.value.basePriceYuan * 100),
        groupBuyPriceInCents: Math.round(newFilm.value.groupBuyPriceYuan * 100),
        threshold: newFilm.value.threshold,
        description: newFilm.value.description,
        features: newFilm.value.features,
        scenarios: newFilm.value.scenarios,
      },
      adminToken.value,
    )
    details.value[data.id] = data
    showCreate.value = false
    message.success(`已新增：${data.name}（${data.format}）`)
    void load()
  } catch (e) {
    message.error(e instanceof Error ? e.message : String(e))
  } finally {
    creating.value = false
  }
}

async function save() {
  if (!selected.value || !adminToken.value) return
  saving.value = true
  try {
    const { data } = await api.updateFilm(
      selected.value.id,
      {
        description: draft.value.description,
        features: draft.value.features,
        scenarios: draft.value.scenarios,
      },
      adminToken.value,
    )
    details.value[data.id] = data
    message.success("已保存")
  } catch (e) {
    message.error(e instanceof Error ? e.message : String(e))
  } finally {
    saving.value = false
  }
}

async function uploadCover(file: File) {
  if (!selected.value || !adminToken.value) return
  uploadingCover.value = true
  try {
    const { data } = await api.setFilmCover(selected.value.id, file, adminToken.value)
    details.value[data.id] = data
    message.success("封面已更新")
  } catch (e) {
    message.error(e instanceof Error ? e.message : String(e))
  } finally {
    uploadingCover.value = false
  }
}

function onCoverChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) void uploadCover(file)
  input.value = ""
}

onMounted(() => {
  if (adminToken.value) void load()
  else loading.value = false
})
</script>

<template>
  <div class="page">
    <div class="activity-head">
      <div>
        <h2 class="page-title">商品管理</h2>
        <p class="page-sub">维护胶卷商品的描述、特性、适用场景与封面图（仅限管理员）</p>
      </div>
      <router-link to="/admin/hubs" class="admin-link">位置点管理 →</router-link>
      <router-link to="/admin/users" class="admin-link" style="margin-left: 14px">用户管理 →</router-link>
    </div>

    <!-- 令牌门禁 -->
    <div v-if="!adminToken" class="admin-token-gate">
      <n-p>请输入管理员令牌（服务器 ADMIN_TOKEN 环境变量）</n-p>
      <div class="admin-token-row">
        <n-input
          v-model:value="tokenDraft"
          type="password"
          show-password-on="click"
          placeholder="ADMIN_TOKEN"
          @keydown.enter="saveToken"
        />
        <n-button type="primary" @click="saveToken">进入</n-button>
      </div>
    </div>

    <n-spin v-else :show="loading">
      <n-empty v-if="!loading && films.length === 0" description="暂无商品" />
      <div v-else class="admin-layout">
        <aside class="admin-list">
          <n-select v-model:value="selectedId" :options="filmOptions" @update:value="selectFilm" />
          <n-button type="primary" block style="margin-top: 10px" @click="openCreate">
            新增商品
          </n-button>
        </aside>

        <section v-if="selected" class="admin-editor">
          <!-- 封面 -->
          <div class="admin-cover">
            <img :src="selected.coverImageUrl" :alt="selected.name" />
            <label class="admin-cover-btn">
              <input type="file" accept="image/*" :disabled="uploadingCover" @change="onCoverChange" />
              {{ uploadingCover ? "上传中…" : "更换封面" }}
            </label>
          </div>

          <div class="admin-form">
            <div class="admin-field">
              <span class="admin-label">商品</span>
              <span>{{ selected.name }} · {{ selected.brand }} · ISO {{ selected.iso }} · {{ selected.format }}</span>
            </div>

            <div class="admin-field">
              <span class="admin-label">描述</span>
              <n-input
                v-model:value="draft.description"
                type="textarea"
                :rows="4"
                placeholder="商品长描述，展示在详情页"
              />
            </div>

            <div class="admin-field">
              <span class="admin-label">特性</span>
              <n-dynamic-tags v-model:value="draft.features" />
            </div>

            <div class="admin-field">
              <span class="admin-label">适用场景</span>
              <n-dynamic-tags v-model:value="draft.scenarios" />
            </div>

            <n-button type="primary" :loading="saving" @click="save">保存</n-button>
          </div>
        </section>
      </div>

      <!-- 新增商品弹窗 -->
      <n-modal
        v-model:show="showCreate"
        preset="card"
        title="新增商品"
        style="width: 640px; max-width: 92vw"
        :mask-closable="!creating"
      >
        <div class="admin-create">
          <div class="admin-field">
            <span class="admin-label">商品名 *</span>
            <n-input v-model:value="newFilm.name" placeholder="如：Kodak UltraMax 400" />
          </div>
          <div class="admin-field">
            <span class="admin-label">品牌 *</span>
            <n-input v-model:value="newFilm.brand" placeholder="如：Kodak" />
          </div>
          <div class="admin-field">
            <span class="admin-label">画幅</span>
            <n-select
              v-model:value="newFilm.format"
              :options="[
                { label: '135', value: '135' },
                { label: '120', value: '120' },
              ]"
            />
          </div>
          <div class="admin-field">
            <span class="admin-label">ISO</span>
            <n-input-number v-model:value="newFilm.iso" :min="1" :step="100" />
          </div>
          <div class="admin-field">
            <span class="admin-label">冲洗工艺</span>
            <n-input v-model:value="newFilm.process" placeholder="C-41 / E-6 / 黑白 (D-76)" />
          </div>
          <div class="admin-field">
            <span class="admin-label">描述</span>
            <n-input v-model:value="newFilm.description" type="textarea" :rows="3" />
          </div>
          <div class="admin-field">
            <span class="admin-label">特性</span>
            <n-dynamic-tags v-model:value="newFilm.features" />
          </div>
          <div class="admin-field">
            <span class="admin-label">适用场景</span>
            <n-dynamic-tags v-model:value="newFilm.scenarios" />
          </div>
          <div class="admin-create-row">
            <div class="admin-field">
              <span class="admin-label">日常价（元）</span>
              <n-input-number v-model:value="newFilm.basePriceYuan" :min="0" :step="5" />
            </div>
            <div class="admin-field">
              <span class="admin-label">成团价（元）</span>
              <n-input-number v-model:value="newFilm.groupBuyPriceYuan" :min="0" :step="5" />
            </div>
            <div class="admin-field">
              <span class="admin-label">成团门槛（件）</span>
              <n-input-number v-model:value="newFilm.threshold" :min="1" :step="5" />
            </div>
          </div>
        </div>

        <template #footer>
          <div class="admin-create-footer">
            <n-button :disabled="creating" @click="showCreate = false">取消</n-button>
            <n-button type="primary" :loading="creating" @click="create">创建</n-button>
          </div>
        </template>
      </n-modal>
    </n-spin>
  </div>
</template>

<style scoped>
.admin-link {
  font-size: 13px;
  color: var(--evergrow-primary, #2f9e63);
  text-decoration: none;
  white-space: nowrap;
}

.admin-token-gate {
  background: #fff;
  border: 1px solid #e8ede9;
  border-radius: 14px;
  padding: 28px;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.admin-token-row {
  display: flex;
  gap: 8px;
}

.admin-layout {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 20px;
  align-items: start;
}

.admin-list {
  background: #fff;
  border: 1px solid #e8ede9;
  border-radius: 14px;
  padding: 12px;
}

.admin-editor {
  background: #fff;
  border: 1px solid #e8ede9;
  border-radius: 14px;
  padding: 20px;
  display: flex;
  gap: 24px;
}

.admin-cover {
  flex: 0 0 220px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.admin-cover img {
  width: 220px;
  height: 165px;
  object-fit: cover;
  border-radius: 10px;
  background: #f0f3f0;
}

.admin-cover-btn {
  text-align: center;
  font-size: 13px;
  padding: 8px;
  border: 1px dashed #c6d2c8;
  border-radius: 8px;
  cursor: pointer;
  color: var(--evergrow-text-sub, #5d6b63);
}

.admin-cover-btn:hover {
  border-color: var(--evergrow-primary, #2f9e63);
  color: var(--evergrow-primary, #2f9e63);
}

.admin-cover-btn input {
  display: none;
}

.admin-form {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 新增商品弹窗 */
.admin-create {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.admin-create-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.admin-create-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

@media (max-width: 640px) {
  .admin-create-row {
    grid-template-columns: 1fr;
  }
}

.admin-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.admin-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--evergrow-text, #22302a);
}

@media (max-width: 860px) {
  .admin-layout {
    grid-template-columns: 1fr;
  }

  .admin-editor {
    flex-direction: column;
  }

  .admin-cover {
    flex: none;
  }
}
</style>
