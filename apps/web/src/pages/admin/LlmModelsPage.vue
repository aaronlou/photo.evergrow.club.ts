<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import {
  NAlert,
  NButton,
  NCard,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NModal,
  NPopconfirm,
  NSelect,
  NSpin,
  NSwitch,
  NTag,
  NText,
  useMessage,
} from "naive-ui"

import { api, ApiClientError } from "@/api/client"
import { useAdminAuthStore } from "@/stores/adminAuth"
import type { AdminLlmModelDto, AdminLlmModelsDto, LlmProviderDto } from "@evergrow/contracts"

/**
 * LLM 模型配置管理（令牌与导航由 AdminLayout 统一处理）。
 * 设计要点：让运营一眼看到"当前默认模型"、"接入点是否与环境变量兼容"。
 */

const auth = useAdminAuthStore()
const message = useMessage()

const loading = ref(true)
const data = ref<AdminLlmModelsDto | null>(null)

/** 提供商中文展示名（与后端 providerLabel 对应） */
const providerLabels: Record<LlmProviderDto, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic（Claude）",
  deepseek: "DeepSeek",
  qwen: "通义千问",
  tencent: "腾讯混元",
  custom: "自定义接入点",
}

const providerOptions = (Object.keys(providerLabels) as LlmProviderDto[]).map((p) => ({
  label: providerLabels[p],
  value: p,
}))

/** 按厂商分组（默认置顶，组内按创建时间倒序已由后端保证） */
const grouped = computed(() => {
  const map = new Map<string, AdminLlmModelDto[]>()
  for (const m of data.value?.items ?? []) {
    const list = map.get(m.provider) ?? []
    list.push(m)
    map.set(m.provider, list)
  }
  return [...map.entries()].map(([provider, items]) => ({ provider, items }))
})

const currentDefault = computed(() => data.value?.items.find((m) => m.isDefault))

/** 模型的 provider 是否与环境变量的接入点兼容（不匹配时标黄提醒） */
const isCompatible = (m: AdminLlmModelDto): boolean => {
  const ep = data.value?.endpoint
  if (!ep || ep.provider === "未配置") return true
  // custom 模型用自定义接入点，永远视为"看情况"（不警告）
  if (m.provider === "custom") return true
  return m.provider === ep.provider
}

async function load() {
  loading.value = true
  try {
    data.value = (await api.listLlmModels(auth.token)).data
  } catch (e) {
    message.error(e instanceof Error ? e.message : String(e))
  } finally {
    loading.value = false
  }
}

// ===== 新增 =====
const showCreate = ref(false)
const creating = ref(false)
const newModel = ref({
  provider: "openai" as LlmProviderDto,
  model: "",
  label: "",
  baseUrl: "",
  temperature: 0.3,
})

function openCreate() {
  newModel.value = { provider: "openai", model: "", label: "", baseUrl: "", temperature: 0.3 }
  showCreate.value = true
}

async function create() {
  if (!newModel.value.model.trim()) {
    message.error("请填写模型标识（需与厂商文档一致）")
    return
  }
  creating.value = true
  try {
    await api.createLlmModel(
      {
        provider: newModel.value.provider,
        model: newModel.value.model.trim(),
        label: newModel.value.label.trim() || newModel.value.model.trim(),
        baseUrl: newModel.value.baseUrl.trim() || undefined,
        temperature: newModel.value.temperature,
      },
      auth.token,
    )
    showCreate.value = false
    message.success("已新增模型")
    void load()
  } catch (e) {
    message.error(e instanceof Error ? e.message : String(e))
  } finally {
    creating.value = false
  }
}

// ===== 编辑 =====
const showEdit = ref(false)
const saving = ref(false)
const editTarget = ref<AdminLlmModelDto | null>(null)
const editDraft = ref({ label: "", baseUrl: "", temperature: 0.3, enabled: true })

function openEdit(m: AdminLlmModelDto) {
  editTarget.value = m
  editDraft.value = {
    label: m.label,
    baseUrl: m.baseUrl,
    temperature: m.temperature,
    enabled: m.enabled,
  }
  showEdit.value = true
}

async function saveEdit() {
  if (!editTarget.value) return
  saving.value = true
  try {
    await api.updateLlmModel(
      editTarget.value.id,
      {
        label: editDraft.value.label.trim(),
        baseUrl: editDraft.value.baseUrl.trim(),
        temperature: editDraft.value.temperature,
        enabled: editDraft.value.enabled,
      },
      auth.token,
    )
    showEdit.value = false
    message.success("已保存")
    void load()
  } catch (e) {
    message.error(e instanceof Error ? e.message : String(e))
  } finally {
    saving.value = false
  }
}

// ===== 设为默认 =====
async function setDefault(m: AdminLlmModelDto) {
  try {
    await api.setDefaultLlmModel(m.id, auth.token)
    message.success(`已切换默认模型为：${m.label}`)
    void load()
  } catch (e) {
    message.error(e instanceof Error ? e.message : String(e))
  }
}

// ===== 启用/禁用 =====
async function toggleEnabled(m: AdminLlmModelDto) {
  try {
    await api.updateLlmModel(m.id, { enabled: !m.enabled }, auth.token)
    void load()
  } catch (e) {
    message.error(e instanceof Error ? e.message : String(e))
  }
}

// ===== 删除 =====
const deletingId = ref("")
async function remove(m: AdminLlmModelDto) {
  deletingId.value = m.id
  try {
    await api.deleteLlmModel(m.id, auth.token)
    message.success(`已删除：${m.label}`)
    void load()
  } catch (e) {
    message.error(e instanceof Error ? e.message : String(e))
  } finally {
    deletingId.value = ""
  }
}

onMounted(load)
</script>

<template>
  <div class="page">
    <div class="activity-head">
      <div>
        <h2 class="page-title">模型配置</h2>
        <p class="page-sub">管理可选用的 LLM 模型，切换默认模型立即生效（密钥仍走环境变量，不在此处配置）</p>
      </div>
      <n-button type="primary" @click="openCreate">新增模型</n-button>
    </div>

    <!-- 当前状态总览 -->
    <n-card v-if="currentDefault" class="current-banner" :bordered="false">
      <div class="current-row">
        <n-tag type="success" size="medium">当前默认</n-tag>
        <span class="current-label">{{ currentDefault.label }}</span>
        <n-text depth="3" class="current-meta">
          {{ currentDefault.provider }}/{{ currentDefault.model }} · 温度 {{ currentDefault.temperature }}
          <template v-if="currentDefault.baseUrl"> · 自定义接入点</template>
        </n-text>
      </div>
    </n-card>

    <!-- 接入点提示 -->
    <n-alert v-if="data?.endpoint" :type="data.endpoint.provider === '未配置' ? 'warning' : 'info'" class="endpoint-tip" :bordered="false">
      <template v-if="data.endpoint.provider === '未配置'">
        当前未配置 LLM 接入（LLM_PROVIDER / LLM_API_KEY），AI 功能使用规则解析模式。
      </template>
      <template v-else>
        当前接入点：<strong>{{ providerLabels[data.endpoint.provider as LlmProviderDto] ?? data.endpoint.provider }}</strong>
        （{{ data.endpoint.baseUrl }}）。
        密钥通过环境变量配置，不在此处显示；厂商接入点变更时，可为对应模型单独填写自定义接入点。
      </template>
    </n-alert>

    <n-spin :show="loading">
      <n-empty v-if="!loading && grouped.length === 0" description="暂无模型配置" />
      <div v-else class="groups">
        <section v-for="g in grouped" :key="g.provider" class="group">
          <h3 class="group-title">{{ providerLabels[g.provider as LlmProviderDto] ?? g.provider }}</h3>
          <div class="model-list">
            <div
              v-for="m in g.items"
              :key="m.id"
              class="model-card"
              :class="{ default: m.isDefault, disabled: !m.enabled }"
            >
              <div class="model-main">
                <div class="model-title-row">
                  <span class="model-name">{{ m.label }}</span>
                  <n-tag v-if="m.isDefault" type="success" size="small">默认</n-tag>
                  <n-tag :type="m.enabled ? 'info' : 'default'" size="small" :bordered="false">
                    {{ m.enabled ? "启用" : "已禁用" }}
                  </n-tag>
                  <n-tag v-if="m.baseUrl" type="warning" size="small" :bordered="false">
                    自定义接入点
                  </n-tag>
                  <n-tag v-if="!isCompatible(m)" type="error" size="small" :bordered="false">
                    与当前接入点不匹配
                  </n-tag>
                </div>
                <span class="model-id">{{ m.model }}</span>
                <span class="model-meta">
                  温度 {{ m.temperature }}
                  <template v-if="m.baseUrl"> · {{ m.baseUrl }}</template>
                </span>
              </div>
              <div class="model-actions">
                <n-switch :value="m.enabled" size="small" @update:value="toggleEnabled(m)" />
                <n-button
                  v-if="!m.isDefault"
                  size="small"
                  quaternary
                  type="primary"
                  :disabled="!m.enabled"
                  @click="setDefault(m)"
                >
                  设为默认
                </n-button>
                <n-button size="small" quaternary @click="openEdit(m)">编辑</n-button>
                <n-popconfirm @positive-click="remove(m)">
                  <template #trigger>
                    <n-button size="small" quaternary type="error" :loading="deletingId === m.id">
                      删除
                    </n-button>
                  </template>
                  确定删除「{{ m.label }}」？删除默认模型会自动把剩余启用项的第一个补为默认。
                </n-popconfirm>
              </div>
            </div>
          </div>
        </section>
      </div>
    </n-spin>

    <!-- 新增模型弹窗 -->
    <n-modal
      v-model:show="showCreate"
      preset="card"
      title="新增模型"
      style="width: 520px; max-width: 92vw"
      :mask-closable="!creating"
    >
      <n-form label-placement="top">
        <n-form-item label="提供商 *" required>
          <n-select v-model:value="newModel.provider" :options="providerOptions" />
        </n-form-item>
        <n-form-item label="模型标识 *" required>
          <n-input
            v-model:value="newModel.model"
            placeholder="如 gpt-4o-mini / deepseek-v4-flash（需与厂商文档一致，填错会调用失败）"
          />
        </n-form-item>
        <n-form-item label="展示名">
          <n-input v-model:value="newModel.label" placeholder="如「GPT-4o mini（便宜快）」，留空则用模型标识" />
        </n-form-item>
        <n-form-item label="自定义接入点（可选）">
          <n-input
            v-model:value="newModel.baseUrl"
            placeholder="如 https://api.example.com/v1；留空则使用默认接入点"
          />
        </n-form-item>
        <n-form-item :label="`采样温度（当前：${newModel.temperature}）`">
          <n-input-number v-model:value="newModel.temperature" :min="0" :max="2" :step="0.1" />
        </n-form-item>
      </n-form>
      <template #footer>
        <div class="modal-footer">
          <n-button :disabled="creating" @click="showCreate = false">取消</n-button>
          <n-button type="primary" :loading="creating" @click="create">创建</n-button>
        </div>
      </template>
    </n-modal>

    <!-- 编辑模型弹窗 -->
    <n-modal
      v-model:show="showEdit"
      preset="card"
      title="编辑模型"
      style="width: 520px; max-width: 92vw"
      :mask-closable="!saving"
    >
      <n-form label-placement="top">
        <n-form-item label="展示名">
          <n-input v-model:value="editDraft.label" />
        </n-form-item>
        <n-form-item label="自定义接入点">
          <n-input v-model:value="editDraft.baseUrl" placeholder="留空 = 使用默认接入点" />
        </n-form-item>
        <n-form-item :label="`采样温度（当前：${editDraft.temperature}）`">
          <n-input-number v-model:value="editDraft.temperature" :min="0" :max="2" :step="0.1" />
        </n-form-item>
        <n-form-item label="启用状态">
          <div class="status-switch">
            <n-switch v-model:value="editDraft.enabled" />
            <n-text depth="3">{{ editDraft.enabled ? "启用（可被选用）" : "禁用（不可调用）" }}</n-text>
          </div>
        </n-form-item>
      </n-form>
      <template #footer>
        <div class="modal-footer">
          <n-button :disabled="saving" @click="showEdit = false">取消</n-button>
          <n-button type="primary" :loading="saving" @click="saveEdit">保存</n-button>
        </div>
      </template>
    </n-modal>
  </div>
</template>

<style scoped>
.current-banner {
  background: #f0f9f3;
  border: 1px solid #c9e8d2;
  border-radius: 12px;
  margin-bottom: 12px;
}

.current-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.current-label {
  font-weight: 600;
  font-size: 15px;
  color: var(--evergrow-text, #22302a);
}

.current-meta {
  font-size: 13px;
}

.endpoint-tip {
  margin-bottom: 16px;
}

.groups {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.group-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--evergrow-text-sub, #5d6b63);
  margin-bottom: 10px;
  text-transform: none;
}

.model-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.model-card {
  background: #fff;
  border: 1px solid #e8ede9;
  border-radius: 12px;
  padding: 14px 18px;
  display: flex;
  align-items: center;
  gap: 14px;
}

.model-card.default {
  border-color: #2f9e63;
  box-shadow: 0 0 0 1px rgba(47, 158, 99, 0.15);
}

.model-card.disabled {
  opacity: 0.6;
}

.model-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.model-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.model-name {
  font-weight: 600;
  font-size: 15px;
  color: var(--evergrow-text, #22302a);
}

.model-id {
  font-size: 13px;
  color: var(--evergrow-text-sub, #5d6b63);
  font-family: ui-monospace, monospace;
}

.model-meta {
  font-size: 12px;
  color: #9aa59e;
}

.model-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.status-switch {
  display: flex;
  align-items: center;
  gap: 10px;
}

@media (max-width: 640px) {
  .model-card {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
