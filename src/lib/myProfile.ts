// 로그인 사용자 프로필 — 이름(/auth/me) + 소속 태그·직급/부서(staff-registry).
// 점검표·보고서의 소속명/부서명/작성자 자동 채움에 쓴다(예전엔 협회 이름이 하드코딩돼
// 국민안전기술원 직원이 작성해도 협회로 찍혔음).
import { useEffect, useState } from 'react'
import { api } from './api'
import { isAffiliation } from './affiliations'

export type MyProfile = {
  ready: boolean
  login: string
  name: string
  affiliation: string // 소속 태그(계정 관리에서 지정). 미지정이면 ''
  department: string  // 직급/부서(예: '대리', '팀장 · 안전점검팀'). 없으면 ''
}

const EMPTY: MyProfile = { ready: false, login: '', name: '', affiliation: '', department: '' }

export function useMyProfile(): MyProfile {
  const [p, setP] = useState<MyProfile>(EMPTY)
  useEffect(() => {
    let alive = true
    Promise.all([
      api<{ login_id?: string; name?: string }>('/auth/me').catch(() => null),
      api<{ doc: Record<string, { affiliation?: string; department?: string }> | null }>('/ops/docs/staff-registry')
        .then((r) => r.doc || {}).catch(() => ({} as Record<string, { affiliation?: string; department?: string }>)),
    ]).then(([me, reg]) => {
      if (!alive) return
      const login = me?.login_id || ''
      const si = (login && reg[login]) || {}
      const aff = (si.affiliation || '').trim()
      setP({
        ready: true,
        login,
        name: (me?.name || '').trim(),
        affiliation: isAffiliation(aff) ? aff : '',
        department: (si.department || '').trim(),
      })
    })
    return () => { alive = false }
  }, [])
  return p
}
