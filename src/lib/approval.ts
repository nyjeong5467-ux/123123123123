// [118] 결재선 공용 규칙 → [123] '확인자'로 용어 통일 + 학교/기관 구분
//  · 확인자 = 학교(기관) 내부 확인 라인 (협회 담당자 제외)
//  · 학교: 담당자 → 행정실장 → 교장   /   기관(교육청·교육지원청·직속기관 등): 담당자 → 팀장 → 과장
//  · 단계 수: 1~3단계 (직책 + 성명)
//  · 학교 상세(대장) [확인자]에서 편집, 인쇄물 결재란(안전점검표·위험성평가·근골격계·이행점검)이 같은 규칙으로 표시
//  · 백엔드 경로·필드명(/approval-line, steps)은 그대로 — 화면 용어만 변경
import { api } from './api'

export type ApprovalStep = { title: string; name: string }
export type OrgKind = 'school' | 'agency'
/** 구분 판정에 쓰는 학교(기관) 정보 — 목록/대장/상세 어떤 응답이든 name만 있으면 판정 가능 */
export type OrgLike = { name?: string | null; org_kind?: string | null; principal?: string | null } | null | undefined

export const APPROVAL_MIN = 1
export const APPROVAL_MAX = 3

/** 기관 판정 — 원본 구분(org_kind)이 '교육청'이거나, 기관명이 '학교'·'유치원'으로 끝나지 않으면 기관.
 *  (특수학교는 '…학교'로 끝나므로 학교, 교육청·교육지원청·연수원·도서관·회관 등은 기관) */
export function orgKindOf(org: OrgLike): OrgKind {
  if (org?.org_kind && /교육청|기관/.test(org.org_kind)) return 'agency'
  const name = (org?.name ?? '').replace(/\(.*?\)/g, '').replace(/\s+/g, '')
  if (!name) return 'school'
  return /(학교|유치원)$/.test(name) ? 'school' : 'agency'
}

export const APPROVAL_TITLES: Record<OrgKind, [string, string, string]> = {
  school: ['담당자', '행정실장', '교장'],
  agency: ['담당자', '팀장', '과장'],
}
export const approvalLabel = (org: OrgLike) => APPROVAL_TITLES[orgKindOf(org)].join('·')

/** 직책 입력 추천값 — 학교/기관 공통 */
export const APPROVAL_TITLE_SUGGEST = ['담당자', '행정실장', '교장', '팀장', '과장', '행정주무관', '교감', '원감', '원장']

/** 기본 확인자 — 학교: 교장 성명은 학교 정보(학교장)로 프리필 / 기관: 성명 공란 */
export function defaultApproval(org?: OrgLike): ApprovalStep[] {
  const kind = orgKindOf(org)
  const [a, b, c] = APPROVAL_TITLES[kind]
  return [
    { title: a, name: '' },
    { title: b, name: '' },
    { title: c, name: kind === 'school' ? (org?.principal ?? '').trim() : '' },
  ]
}

/** 기본(주) 확인자 단계 — '담당'이 들어간 직책(담당자·구 안전담당자), 없으면 1단계 */
export const primaryIdx = (line: { title: string }[]) => Math.max(0, line.findIndex((s) => (s.title || '').includes('담당')))

// 구 기본값(안전담당자·행정실장·교장, 성명은 교장만) 그대로인 기관 확인자 → 기관 기본값으로 교체 판정
const isUntouchedSchoolDefault = (st: ApprovalStep[]) =>
  st.length === 3 &&
  /담당/.test(st[0].title) && !st[0].name &&
  st[1].title === '행정실장' && !st[1].name &&
  st[2].title === '교장'

/** 서버 응답 정리 — 최대 3단계, 구 직책명(안전담당자→담당자) 정리, 비어 있으면 학교/기관 기본값.
 *  기관인데 손대지 않은 학교 기본값이 저장돼 있으면 기관 기본값(담당자·팀장·과장)으로 표시. */
export function normalizeApproval(steps: ApprovalStep[] | null | undefined, org?: OrgLike): ApprovalStep[] {
  const clean = (steps ?? [])
    .map((s) => ({ title: (s?.title ?? '').trim(), name: (s?.name ?? '').trim() }))
    .map((s) => (s.title === '안전담당자' ? { ...s, title: '담당자' } : s))
    .filter((s) => s.title || s.name)
    .slice(0, APPROVAL_MAX)
  if (!clean.length) return defaultApproval(org)
  if (org && orgKindOf(org) === 'agency' && isUntouchedSchoolDefault(clean)) return defaultApproval(org)
  return clean
}

/** 학교(기관) 확인자 조회 (실패 시 기본값). org를 모르면 대장에서 기관명을 받아 학교/기관을 판정 */
export async function fetchApproval(sid: string, org?: OrgLike): Promise<ApprovalStep[]> {
  let o: OrgLike = org
  if (!o?.name) {
    try {
      const led = await api<{ school?: { name?: string } }>(`/schools/${sid}/ledger`)
      o = { ...(org ?? {}), name: led?.school?.name ?? '' }
    } catch { /* 판정 불가 시 학교 기본값 */ }
  }
  try {
    const r = await api<{ steps: ApprovalStep[] }>(`/schools/${sid}/approval-line`)
    return normalizeApproval(r?.steps, o)
  } catch {
    return defaultApproval(o)
  }
}
