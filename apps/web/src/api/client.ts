import type { ApiErrorDto, HealthDto, UserDto } from "@evergrow/contracts"

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  })
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
}
