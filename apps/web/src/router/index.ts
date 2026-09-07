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
        {
          path: "groups/:hubId",
          name: "group-hub",
          component: () => import("@/pages/GroupBuyHubPage.vue"),
        },
        {
          path: "groups/:hubId/films/:filmId",
          name: "film-detail",
          component: () => import("@/pages/FilmDetailPage.vue"),
        },
        { path: "me", name: "me", component: () => import("@/pages/UserProfilePage.vue") },
      ],
    },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
})

export default router
