// Cliente HTTP compartilhado (web + mobile). Sem dependências externas.
export interface ApiClientOptions {
  baseUrl: string
  token?: string
  tenantId?: string
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function createApiClient(options: ApiClientOptions) {
  const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...(options.tenantId ? { 'x-tenant-id': options.tenantId } : {})
    }
    const res = await fetch(`${options.baseUrl}${path}`, { ...init, headers })
    if (!res.ok) throw new ApiError(res.status, await res.text())
    return res.json() as Promise<T>
  }

  return {
    request,
    get: <T>(path: string) => request<T>(path),
    post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
    patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: <T>(path: string) => request<T>(path, { method: 'DELETE' })
  }
}
