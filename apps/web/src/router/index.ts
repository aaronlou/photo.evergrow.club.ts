import { createRouter, createWebHistory } from "vue-router"

import DefaultLayout from "@/layouts/DefaultLayout.vue"

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      component: DefaultLayout,
      children: [
        { path: "", name: "home", component: () => import("@/pages/HomePage.vue") },
        { path: "groups", name: "groups", component: () => import("@/pages/GroupBuyListPage.vue") },
        { path: "me", name: "me", component: () => import("@/pages/UserProfilePage.vue") },
      ],
    },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
})

export default router
