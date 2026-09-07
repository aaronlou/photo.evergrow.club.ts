<script setup lang="ts">
import { dateZhCN, NConfigProvider, zhCN } from "naive-ui"
import type { GlobalThemeOverrides } from "naive-ui"

const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: "#2f9e63",
    primaryColorHover: "#3ab576",
    primaryColorPressed: "#258052",
    primaryColorSuppl: "#2f9e63",
    borderRadius: "8px",
  },
}
</script>

<template>
  <n-config-provider
    :locale="zhCN"
    :date-locale="dateZhCN"
    :theme-overrides="themeOverrides"
  >
    <RouterView />
  </n-config-provider>
</template>
