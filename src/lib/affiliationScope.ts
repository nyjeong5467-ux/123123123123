// 소속(기관) 기반 화면 격리 — 로그인 사용자의 소속 학교만 보이게(프론트 필터).
// 규칙(사용자 확정 2026-09-30):
//  - 'admin'(관리자) 계정만 슈퍼: 전 소속·전 직원 데이터 열람(격리 없음).
//  - 그 외 전원(박정우 이사=hq_admin 포함)은 자기 소속 학교만.
//  - 소속 판정: 로그인 사용자의 담당 학교(schools.manager==내이름)들의 최빈 inspection_agency.
//    (staff-registry 태그는 누락·오타가 있어 담당학교 기반이 더 정확.)
import { useCallback, useEffect, useState } from 'react'
import { api } from './api'

const SUPER_LOGIN = 'admin'

// 소속명 정규화 — 과거 '한국산업협회' 오타를 표준명으로.
function normAffil(a?: string | null): string {
  const s = (a || '').trim()
  return s === '한국산업협회' ? '한국산업안전협회' : s
}

type ScopeState = {
  ready: boolean
  isSuper: boolean
  myAffil: string
  affilById: Record<string, string>
  affilByName: Record<string, string>
}

export type AffiliationScope = ScopeState & {
  // 학교(id 또는 name)가 로그인 사용자에게 보여야 하는지. 슈퍼·미확정 시 true(격리 안 함).
  visible: (school?: { id?: string; name?: string } | null) => boolean
}

export function useAffiliationScope(): AffiliationScope {
  const [state, setState] = useState<ScopeState>({
    ready: false, isSuper: false, myAffil: '', affilById: {}, affilByName: {},
  })

  useEffect(() => {
    let alive = true
    Promise.all([
      api<{ login?: string; name?: string; role?: string }>('/auth/me').catch(() => null),
      api<{ id: string; name: string; manager?: string; inspection_agency?: string }[]>('/schools')
        .catch(() => [] as { id: string; name: string; manager?: string; inspection_agency?: string }[]),
    ]).then(([me, schools]) => {
      if (!alive) return
      const affilById: Record<string, string> = {}
      const affilByName: Record<string, string> = {}
      const cnt: Record<string, number> = {}
      const list = Array.isArray(schools) ? schools : []
      for (const s of list) {
        const a = normAffil(s.inspection_agency)
        if (s.id) affilById[s.id] = a
        if (s.name) affilByName[s.name] = a
        if (me?.name && s.manager === me.name && a) cnt[a] = (cnt[a] || 0) + 1
      }
      let myAffil = ''; let bc = 0
      for (const [k, v] of Object.entries(cnt)) if (v > bc) { myAffil = k; bc = v }
      setState({
        ready: true,
        isSuper: (me?.login || '') === SUPER_LOGIN,
        myAffil, affilById, affilByName,
      })
    })
    return () => { alive = false }
  }, [])

  const visible = useCallback(
    (school?: { id?: string; name?: string } | null) => {
      // 미확정(로딩 전)·슈퍼·소속 판정불가 → 격리하지 않음(기존 표시 유지).
      if (!state.ready || state.isSuper || !state.myAffil) return true
      const a =
        (school?.id && state.affilById[school.id]) ||
        (school?.name && state.affilByName[normNameKey(school.name)]) ||
        (school?.name && state.affilByName[school.name]) ||
        ''
      return a === state.myAffil
    },
    [state],
  )

  return { ...state, visible }
}

// 일정 등 학교명이 단축/변형일 수 있어, 정확 매칭 실패 시 접두 매칭 보조용 키(현재는 그대로).
function normNameKey(n: string): string {
  return n.trim()
}
