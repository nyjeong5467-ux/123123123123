// [118] 결재선 공용 규칙 — 결재선은 학교 내부 결재자만으로 구성 (협회 담당자 제외)
//  · 기본값: 안전담당자(행정실) → 행정실장 → 교장
//  · 단계 수: 1~3단계 (직책 + 성명)
//  · 학교 상세(대장)에서 편집, 인쇄물 결재란(안전점검표·위험성평가·근골격계·이행점검)이 같은 규칙으로 표시
import { api } from './api'

export type ApprovalStep = { title: string; name: string }

export const APPROVAL_MIN = 1
export const APPROVAL_MAX = 3

/** 직책 입력 추천값 (학교 내부 직책) */
export const APPROVAL_TITLE_SUGGEST = ['안전담당자', '행정주무관', '행정실장', '교감', '교장', '원감', '원장']

/** 기본 결재선 — 교장 성명은 학교 정보(학교장)로 프리필 */
export function defaultApproval(principal = ''): ApprovalStep[] {
  return [
    { title: '안전담당자', name: '' },
    { title: '행정실장', name: '' },
    { title: '교장', name: principal },
  ]
}

/** 서버 응답 정리 — 최대 3단계로 자르고, 비어 있으면 기본값 */
export function normalizeApproval(steps: ApprovalStep[] | null | undefined, principal = ''): ApprovalStep[] {
  const clean = (steps ?? [])
    .map((s) => ({ title: (s?.title ?? '').trim(), name: (s?.name ?? '').trim() }))
    .filter((s) => s.title || s.name)
    .slice(0, APPROVAL_MAX)
  return clean.length ? clean : defaultApproval(principal)
}

/** 학교 결재선 조회 (실패 시 기본값) */
export async function fetchApproval(sid: string, principal = ''): Promise<ApprovalStep[]> {
  try {
    const r = await api<{ steps: ApprovalStep[] }>(`/schools/${sid}/approval-line`)
    return normalizeApproval(r?.steps, principal)
  } catch {
    return defaultApproval(principal)
  }
}
