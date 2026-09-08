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
          name: "film-detail-hub",
          component: () => import("@/pages/FilmDetailPage.vue"),
        },
        { path: "films", name: "films", component: () => import("@/pages/FilmListPage.vue") },
        {
          path: "films/:filmId",
          name: "film-detail",
          component: () => import("@/pages/FilmDetailPage.vue"),
        },
        { path: "activities", name: "activities", component: () => import("@/pages/ActivityListPage.vue") },
        {
          path: "activities/new",
          name: "activity-create",
          component: () => import("@/pages/ActivityCreatePage.vue"),
        },
        {
          path: "activities/:id",
          name: "activity-detail",
          component: () => import("@/pages/ActivityDetailPage.vue"),
        },
        { path: "me", name: "me", component: () => import("@/pages/UserProfilePage.vue") },
        { path: "login", name: "login", component: () => import("@/pages/LoginPage.vue") },
        {
          path: "me/activities",
          name: "my-activities",
          component: () => import("@/pages/MyActivitiesPage.vue"),
        },
        {
          // 管理端不进导航，直接访问 URL（鉴权靠 ADMIN_TOKEN）
          path: "admin/films",
          name: "admin-films",
          component: () => import("@/pages/AdminFilmsPage.vue"),
        },
        {
          path: "admin/hubs",
          name: "admin-hubs",
          component: () => import("@/pages/AdminHubsPage.vue"),
        },
        {
          path: "admin/users",
          name: "admin-users",
          component: () => import("@/pages/AdminUsersPage.vue"),
        },
      ],
    },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
})

export default router
