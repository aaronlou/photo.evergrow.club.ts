import type {
  ActivityDetailDto,
  ActivityDto,
  ApiErrorDto,
  CreateActivityInput,
  CreateFilmInput,
  FilmCatalogDetailDto,
  FilmCatalogDto,
  FilmDetailDto,
  FilmDto,
  GroupProgressDto,
  HealthDto,
  HubDto,
  SampleImageDto,
  UpdateFilmInput,
  UserDto,
} from "@evergrow/contracts"

/** API 请求错误：携带 HTTP 状态码与后端 ApiErrorDto */
export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorDto | null,
  ) {
    super(body?.message ?? `请求失败（HTTP ${status}）`)
    this.name = "ApiClientError"
  }
}

/**
 * 当前用户身份（占位实现）：localStorage 生成稳定的匿名用户 ID，
 * 通过 x-user-id 请求头传给后端。接入微信登录后替换。
 */
const STORAGE_KEY = "evergrow-user-id"

function currentUserId(): string {
  let id = localStorage.getItem(STORAGE_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(STORAGE_KEY, id)
  }
  return id
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "x-user-id": currentUserId(),
    // 允许调用方附加请求头（如管理端 x-admin-token）
    ...((init?.headers as Record<string, string>) ?? {}),
  }
  if (!(init?.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json"
  }
  const res = await fetch(`/api${path}`, { ...init, headers })
  const body: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    throw new ApiClientError(res.status, body as ApiErrorDto | null)
  }
  return body as T
}

/** 类型化 API 客户端：路径与 packages/contracts 中的契约一一对应 */
export const api = {
  health: () => request<HealthDto>("/health/"),
  getUser: (id: string) => request<{ data: UserDto }>(`/identity/users/${encodeURIComponent(id)}`),
  register: (input: { phone: string; nickname: string }) =>
    request<{ data: UserDto }>("/identity/users", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  // ===== groupbuy（胶卷团购） =====
  listHubs: () => request<{ data: HubDto[] }>("/groupbuy/hubs"),
  joinHub: (id: string) =>
    request<{ data: HubDto }>(`/groupbuy/hubs/${encodeURIComponent(id)}/join`, {
      method: "POST",
    }),
  // 全局商品（不依赖位置点）
  listAllFilms: () => request<{ data: FilmCatalogDto[] }>("/groupbuy/films"),
  getFilmById: (id: string) =>
    request<{ data: FilmCatalogDetailDto }>(`/groupbuy/films/${encodeURIComponent(id)}`),
  // 用户协作共建：完善商品特性 / 适用场景
  contributeFilmInfo: (id: string, input: { features?: string[]; scenarios?: string[] }) =>
    request<{ data: FilmCatalogDetailDto }>(`/groupbuy/films/${encodeURIComponent(id)}/info`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  // 位置点下的商品与进度
  listFilms: (hubId: string) =>
    request<{ data: FilmDto[] }>(`/groupbuy/hubs/${encodeURIComponent(hubId)}/films`),
  getFilm: (hubId: string, filmId: string) =>
    request<{ data: FilmDetailDto }>(
      `/groupbuy/hubs/${encodeURIComponent(hubId)}/films/${encodeURIComponent(filmId)}`,
    ),
  joinGroupBuy: (hubId: string, filmId: string, quantity: number) =>
    request<{ data: GroupProgressDto }>(
      `/groupbuy/hubs/${encodeURIComponent(hubId)}/films/${encodeURIComponent(filmId)}/join`,
      { method: "POST", body: JSON.stringify({ quantity }) },
    ),
  payDeposit: (hubId: string, filmId: string) =>
    request<{ data: GroupProgressDto }>(
      `/groupbuy/hubs/${encodeURIComponent(hubId)}/films/${encodeURIComponent(filmId)}/pay-deposit`,
      { method: "POST" },
    ),
  getGroupProgress: (hubId: string, filmId: string) =>
    request<{ data: GroupProgressDto }>(
      `/groupbuy/hubs/${encodeURIComponent(hubId)}/films/${encodeURIComponent(filmId)}/progress`,
    ),
  uploadSampleImage: (filmId: string, file: File) => {
    const form = new FormData()
    form.append("file", file)
    return request<{ data: SampleImageDto }>(
      `/groupbuy/films/${encodeURIComponent(filmId)}/images`,
      { method: "POST", body: form },
    )
  },

  // ===== admin（商品后台管理，需 x-admin-token） =====
  createFilm: (input: CreateFilmInput, adminToken: string) =>
    request<{ data: FilmCatalogDetailDto }>("/admin/groupbuy/films", {
      method: "POST",
      headers: { "x-admin-token": adminToken },
      body: JSON.stringify(input),
    }),
  updateFilm: (id: string, input: UpdateFilmInput, adminToken: string) =>
    request<{ data: FilmCatalogDetailDto }>(`/admin/groupbuy/films/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "x-admin-token": adminToken },
      body: JSON.stringify(input),
    }),
  setFilmCover: (id: string, file: File, adminToken: string) => {
    const form = new FormData()
    form.append("file", file)
    return request<{ data: FilmCatalogDetailDto }>(
      `/admin/groupbuy/films/${encodeURIComponent(id)}/cover`,
      { method: "POST", headers: { "x-admin-token": adminToken }, body: form },
    )
  },

  // ===== activity（活动与报名） =====
  listActivities: () => request<{ data: ActivityDto[] }>("/activity/activities"),
  listMyActivities: () => request<{ data: ActivityDto[] }>("/activity/mine"),
  getActivity: (id: string) =>
    request<{ data: ActivityDetailDto }>(`/activity/activities/${encodeURIComponent(id)}`),
  createActivity: (input: CreateActivityInput) =>
    request<{ data: ActivityDetailDto }>("/activity/activities", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  enrollActivity: (id: string) =>
    request<{ data: ActivityDetailDto }>(
      `/activity/activities/${encodeURIComponent(id)}/enroll`,
      { method: "POST" },
    ),
  cancelActivity: (id: string) =>
    request<{ data: ActivityDetailDto }>(
      `/activity/activities/${encodeURIComponent(id)}/cancel`,
      { method: "POST" },
    ),
}
