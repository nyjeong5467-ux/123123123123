// 백엔드 API 클라이언트 — /api/v1 (vite dev proxy → :8000). JWT Bearer 자동 첨부.
// 액세스 토큰(1h) 만료 시 리프레시 토큰으로 1회 자동 갱신 후 재시도 — 갱신 실패면 로그인으로.
const BASE = '/api/v1'

let token: string | null = localStorage.getItem('access_token')
let refreshToken: string | null = localStorage.getItem('refresh_token')

export function setToken(t: string | null) {
  token = t
  if (t) localStorage.setItem('access_token', t)
  else localStorage.removeItem('access_token')
}
export function setRefreshToken(t: string | null) {
  refreshToken = t
  if (t) localStorage.setItem('refresh_token', t)
  else localStorage.removeItem('refresh_token')
}
export function getToken() {
  return token
}

function baseHeaders(opts: RequestInit): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    // ngrok 무료 도메인 경고 인터스티셜 우회(터널 데모 시 XHR가 HTML 경고에 걸리지 않게).
    'ngrok-skip-browser-warning': 'true',
    ...((opts.headers as Record<string, string>) || {}),
  }
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

async function toError(res: Response): Promise<Error> {
  let msg = `${res.status} ${res.statusText}`
  try {
    const body = await res.json()
    msg = body?.error?.message || body?.detail || msg
  } catch {
    /* non-json */
  }
  return new Error(msg)
}

// 동시 401 다발 시 갱신은 1회만(single-flight). 회전된 리프레시 토큰도 저장.
let refreshing: Promise<boolean> | null = null
function tryRefresh(): Promise<boolean> {
  if (!refreshToken) return Promise.resolve(false)
  refreshing ??= (async () => {
    try {
      const res = await fetch(BASE + '/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      })
      if (!res.ok) return false
      const d = (await res.json()) as { access_token: string; refresh_token: string }
      setToken(d.access_token)
      setRefreshToken(d.refresh_token)
      return true
    } catch {
      return false
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

function forceLogin(): void {
  setToken(null)
  setRefreshToken(null)
  if (!location.pathname.startsWith('/login')) location.assign('/login')
}

export async function api<T = unknown>(path: string, opts: RequestInit = {}): Promise<T> {
  let res = await fetch(BASE + path, { ...opts, headers: baseHeaders(opts) })

  // 토큰 만료 → 자동 갱신 후 원요청 1회 재시도(인증 자체 경로는 제외)
  if (res.status === 401 && !path.startsWith('/auth/') && refreshToken) {
    if (await tryRefresh()) {
      res = await fetch(BASE + path, { ...opts, headers: baseHeaders(opts) })
    } else {
      forceLogin()
      throw new Error('세션이 만료되었습니다. 다시 로그인해 주세요.')
    }
  }

  if (!res.ok) throw await toError(res)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}
