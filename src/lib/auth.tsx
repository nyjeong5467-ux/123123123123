import { createContext, useContext, useState, type ReactNode } from 'react'
import { api, getToken, setRefreshToken, setToken } from './api'

type User = { tenant: string; login: string }
type AuthCtx = {
  authed: boolean
  user: User | null
  login: (tenant: string, loginId: string, password: string) => Promise<void>
  logout: () => void
}

const Ctx = createContext<AuthCtx>({
  authed: false,
  user: null,
  login: async () => {},
  logout: () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(!!getToken())
  // 새로고침 후에도 로그인 사용자 유지(토큰과 함께 저장).
  const [user, setUser] = useState<User | null>(() => {
    const login = localStorage.getItem('login_id')
    const tenant = localStorage.getItem('tenant_id')
    return login && tenant ? { tenant, login } : null
  })

  async function login(tenant: string, loginId: string, password: string) {
    const r = await api<{ access_token: string; refresh_token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ tenant_id: tenant, login_id: loginId, password }),
    })
    setToken(r.access_token)
    setRefreshToken(r.refresh_token)
    localStorage.setItem('login_id', loginId)
    localStorage.setItem('tenant_id', tenant)
    setAuthed(true)
    setUser({ tenant, login: loginId })
  }

  function logout() {
    setToken(null)
    setRefreshToken(null)
    localStorage.removeItem('login_id')
    localStorage.removeItem('tenant_id')
    setAuthed(false)
    setUser(null)
  }

  return <Ctx.Provider value={{ authed, user, login, logout }}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)
