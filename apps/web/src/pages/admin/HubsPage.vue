<script setup lang="ts">
import { onMounted, ref } from "vue"
import {
  NButton,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NPopconfirm,
  NSpin,
  NSwitch,
  NTag,
  NText,
  useMessage,
} from "naive-ui"

import { api, ApiClientError } from "@/api/client"
import { useAdminAuthStore } from "@/stores/adminAuth"
import type { AdminHubDto } from "@evergrow/contracts"

/** 位置点管理：增删改与开关（令牌与导航由 AdminLayout 统一处理） */

const auth = useAdminAuthStore()
const message = useMessage()

const loading = ref(true)
const hubs = ref<AdminHubDto[]>([])

// ===== 新增 =====
const showCreate = ref(false)
const creating = ref(false)
const newHub = ref({ name: "", city: "", address: "" })

function openCreate() {
  newHub.value = { name: "", city: "", address: "" }
  showCreate.value = true
}

async function create() {
  if (!newHub.value.name.trim() || !newHub.value.city.trim() || !newHub.value.address.trim()) {
    message.error("请填写名称、城市与详细地址")
    return
  }
  creating.value = true
  try {
    const { data } = await api.createHub(
      {
        name: newHub.value.name.trim(),
        city: newHub.value.city.trim(),
        address: newHub.value.address.trim(),
      },
      auth.token,
    )
    hubs.value.push(data)
    showCreate.value = false
    message.success(`已新增位置点：${data.name}`)
  } catch (e) {
    message.error(e instanceof Error ? e.message : String(e))
  } finally {
    creating.value = false
  }
}

// ===== 编辑 =====
const showEdit = ref(false)
const saving = ref(false)
const editTarget = ref<AdminHubDto | null>(null)
const editDraft = ref({ name: "", city: "", address: "", active: true })

function openEdit(hub: AdminHubDto) {
  editTarget.value = hub
  editDraft.value = {
    name: hub.name,
    city: hub.city,
    address: hub.address,
    active: hub.status === "Active",
  }
  showEdit.value = true
}

async function save() {
  if (!editTarget.value) return
  if (!editDraft.value.name.trim() || !editDraft.value.city.trim() || !editDraft.value.address.trim()) {
    message.error("请填写名称、城市与详细地址")
    return
  }
  saving.value = true
  try {
    const { data } = await api.updateHub(
      editTarget.value.id,
      {
        name: editDraft.value.name.trim(),
        city: editDraft.value.city.trim(),
        address: editDraft.value.address.trim(),
        status: editDraft.value.active ? "Active" : "Closed",
      },
      auth.token,
    )
    const idx = hubs.value.findIndex((h) => h.id === data.id)
    if (idx >= 0) hubs.value[idx] = data
    showEdit.value = false
    message.success("已保存")
  } catch (e) {
    message.error(e instanceof Error ? e.message : String(e))
  } finally {
    saving.value = false
  }
}

// ===== 删除 =====
const deletingId = ref("")

async function remove(hub: AdminHubDto) {
  deletingId.value = hub.id
  try {
    await api.deleteHub(hub.id, auth.token)
    hubs.value = hubs.value.filter((h) => h.id !== hub.id)
    message.success(`已删除位置点：${hub.name}`)
  } catch (e) {
    if (e instanceof ApiClientError && e.status === 409) {
      message.error("该位置点下存在参团记录，无法删除")
    } else {
      message.error(e instanceof Error ? e.message : String(e))
    }
  } finally {
    deletingId.value = ""
  }
}

onMounted(async () => {
  loading.value = true
  try {
    const { data } = await api.listAdminHubs(auth.token)
    hubs.value = data
  } catch (e) {
    message.error(e instanceof Error ? e.message : String(e))
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="page">
    <div class="activity-head">
      <div>
        <h2 class="page-title">位置点管理</h2>
        <p class="page-sub">维护团购取货 / 成团点（增删改与开关）</p>
      </div>
      <n-button type="primary" @click="openCreate">新增位置点</n-button>
    </div>

    <n-spin :show="loading">
      <n-empty v-if="!loading && hubs.length === 0" description="暂无位置点" />
      <div v-else class="hub-list">
        <div v-for="hub in hubs" :key="hub.id" class="hub-card" :class="{ closed: hub.status === 'Closed' }">
          <div class="hub-main">
            <div class="hub-title-row">
              <span class="hub-name">{{ hub.name }}</span>
              <n-tag :type="hub.status === 'Active' ? 'success' : 'default'" size="small">
                {{ hub.status === "Active" ? "营业中" : "已关闭" }}
              </n-tag>
              <n-tag type="info" size="small" :bordered="false">{{ hub.city }}</n-tag>
            </div>
            <n-text depth="3" class="hub-address">{{ hub.address }}</n-text>
            <n-text depth="3" class="hub-meta">{{ hub.memberCount }} 人已加入 · {{ hub.id }}</n-text>
          </div>
          <div class="hub-actions">
            <n-button size="small" quaternary @click="openEdit(hub)">编辑</n-button>
            <n-popconfirm @positive-click="remove(hub)">
              <template #trigger>
                <n-button size="small" quaternary type="error" :loading="deletingId === hub.id">
                  删除
                </n-button>
              </template>
              确定删除「{{ hub.name }}」？该点存在参团记录时将无法删除。
            </n-popconfirm>
          </div>
        </div>
      </div>
    </n-spin>

    <!-- 新增位置点弹窗 -->
    <n-modal
      v-model:show="showCreate"
      preset="card"
      title="新增位置点"
      style="width: 520px; max-width: 92vw"
      :mask-closable="!creating"
    >
      <n-form label-placement="top">
        <n-form-item label="名称 *" required>
          <n-input v-model:value="newHub.name" placeholder="如：上海·静安寺点" />
        </n-form-item>
        <n-form-item label="城市 *" required>
          <n-input v-model:value="newHub.city" placeholder="如：上海" />
        </n-form-item>
        <n-form-item label="详细地址 *" required>
          <n-input v-model:value="newHub.address" placeholder="如：静安区胶州路 158 号 · 光影空间" />
        </n-form-item>
      </n-form>
      <template #footer>
        <div class="modal-footer">
          <n-button :disabled="creating" @click="showCreate = false">取消</n-button>
          <n-button type="primary" :loading="creating" @click="create">创建</n-button>
        </div>
      </template>
    </n-modal>

    <!-- 编辑位置点弹窗 -->
    <n-modal
      v-model:show="showEdit"
      preset="card"
      title="编辑位置点"
      style="width: 520px; max-width: 92vw"
      :mask-closable="!saving"
    >
      <n-form label-placement="top">
        <n-form-item label="名称 *" required>
          <n-input v-model:value="editDraft.name" />
        </n-form-item>
        <n-form-item label="城市 *" required>
          <n-input v-model:value="editDraft.city" />
        </n-form-item>
        <n-form-item label="详细地址 *" required>
          <n-input v-model:value="editDraft.address" />
        </n-form-item>
        <n-form-item label="营业状态">
          <div class="status-switch">
            <n-switch v-model:value="editDraft.active" />
            <n-text depth="3">{{ editDraft.active ? "营业中（可加入 / 可参团）" : "已关闭（不可加入）" }}</n-text>
          </div>
        </n-form-item>
      </n-form>
      <template #footer>
        <div class="modal-footer">
          <n-button :disabled="saving" @click="showEdit = false">取消</n-button>
          <n-button type="primary" :loading="saving" @click="save">保存</n-button>
        </div>
      </template>
    </n-modal>
  </div>
</template>

<style scoped>
.hub-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.hub-card {
  background: #fff;
  border: 1px solid #e8ede9;
  border-radius: 14px;
  padding: 16px 20px;
  display: flex;
  align-items: center;
  gap: 16px;
}

.hub-card.closed {
  opacity: 0.7;
}

.hub-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.hub-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.hub-name {
  font-weight: 600;
  font-size: 15px;
  color: var(--evergrow-text, #22302a);
}

.hub-address {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hub-meta {
  font-size: 12px;
}

.hub-actions {
  display: flex;
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
  .hub-card {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
