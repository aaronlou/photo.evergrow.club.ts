<script setup lang="ts">
import { NCard } from "naive-ui"

defineProps<{ title: string; desc: string }>()
</script>

<template>
  <n-card class="feature-card">
    <template #header>{{ title }}</template>
    {{ desc }}
  </n-card>
</template>
