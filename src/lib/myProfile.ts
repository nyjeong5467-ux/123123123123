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
  department: string  // 부서(직급/부서 칸에서 직급을 뺀 나머지). 없으면 ''
  position: string    // [173] 직책(직급/부서 칸의 '대리'·'부장'·'팀장' 같은 직급). 없으면 ''
}

// [173] 계정·권한의 '직급/부서' 한 칸 → 직책 + 부서로 나눈다.
//   '대리' → 직책 대리 / '팀장 · 안전점검팀' → 직책 팀장, 부서 안전점검팀 / '안전점검팀' → 부서 안전점검팀
const RANK = /^(사원|주임|대리|과장|차장|부장|팀장|실장|본부장|센터장|소장|국장|이사|상무|전무|부사장|사장|대표|대표이사|원장|부원장|연구원|선임|선임연구원|책임|책임연구원|수석|수석연구원|위원|간사|매니저|팀원|기사|기술사|기술원)$/
export function splitDept(raw: string): { position: string; department: string } {
  const parts = (raw || '').split(/\s*[·/,|]\s*|\s+/).map((x) => x.trim()).filter(Boolean)
  const pos = parts.filter((x) => RANK.test(x))
  const rest = parts.filter((x) => !RANK.test(x))
  return { position: pos.join(' '), department: rest.join(' ') }
}
/** 계정 목록·직원 등록정보 — 이름이나 아이디로 그 사람의 소속·부서·직책 찾기(작성자 이름을 바꿀 때 사용) */
export type StaffProfile = { login: string; name: string; affiliation: string; department: string; position: string }

const EMPTY: MyProfile = { ready: false, login: '', name: '', affiliation: '', department: '', position: '' }

export function useMyProfile(): MyProfile {
  const [p, setP] = useState<MyProfile>(EMPTY)
  useEffect(() => {
    let alive = true
    Promise.all([
      api<{ login_id?: string; login?: string; name?: string }>('/auth/me').catch(() => null),
      api<{ doc: Record<string, { affiliation?: string; department?: string }> | null }>('/ops/docs/staff-registry')
        .then((r) => r.doc || {}).catch(() => ({} as Record<string, { affiliation?: string; department?: string }>)),
    ]).then(([me, reg]) => {
      if (!alive) return
      // [173] 서버에 따라 login_id 또는 login 으로 온다 — 둘 다 없으면 로그인할 때 저장한 아이디
      let stored = ''
      try { stored = localStorage.getItem('login_id') || '' } catch { /* 저장소 없음 */ }
      const login = me?.login_id || me?.login || stored
      const si = (login && reg[login]) || {}
      const aff = (si.affiliation || '').trim()
      setP({
        ready: true,
        login,
        name: (me?.name || '').trim(),
        affiliation: isAffiliation(aff) ? aff : '',
        ...splitDept((si.department || '').trim()),
      })
    })
    return () => { alive = false }
  }, [])
  return p
}

/** [173] 전체 직원 프로필(계정 이름 + staff-registry) — 작성자 이름으로 소속·부서·직책 채우기 */
export function useStaffProfiles(): StaffProfile[] {
  const [list, setList] = useState<StaffProfile[]>([])
  useEffect(() => {
    let alive = true
    Promise.all([
      api<{ login_id: string; name?: string }[]>('/users').catch(() => []),
      api<{ doc: Record<string, { affiliation?: string; department?: string }> | null }>('/ops/docs/staff-registry')
        .then((r) => r.doc || {}).catch(() => ({} as Record<string, { affiliation?: string; department?: string }>)),
    ]).then(([users, reg]) => {
      if (!alive) return
      setList((Array.isArray(users) ? users : []).filter((u) => u.login_id).map((u) => {
        const si = reg[u.login_id] || {}
        const aff = (si.affiliation || '').trim()
        return { login: u.login_id, name: (u.name || '').trim(), affiliation: isAffiliation(aff) ? aff : '', ...splitDept((si.department || '').trim()) }
      }))
    })
    return () => { alive = false }
  }, [])
  return list
}
