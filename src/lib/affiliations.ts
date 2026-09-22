// 소속 태그 — 직원 계정(staff-registry.affiliation)과 교육청 로그인 계정(eduoffice-credentials.affiliation)이
// 같은 값을 공유한다. 봇은 제출자 계정의 태그와 글자 그대로 같은 교육청 계정으로 로그인하므로
// (backend eduoffice_router.resolve_affiliation) 자유 입력 대신 고정 목록에서만 고른다.
export const AFFILIATIONS = ['한국산업안전협회', '국민안전기술원'] as const

export function isAffiliation(v: string | undefined | null): boolean {
  return !!v && (AFFILIATIONS as readonly string[]).includes(v.trim())
}
