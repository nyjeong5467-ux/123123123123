// 점검표 부가정보(inspection-extras) 공용 모델 + 매칭 로직.
// Inspection.tsx(상세 모달·보기 양식)와 InspectionForm.tsx(작성/수정 화면)가 같은 폴백 매칭을 쓰도록
// 단일 소스로 분리 — 앱 파트별 제출로 ids가 조각나도 어느 화면에서든 사진·서명이 숨지 않게 한다.

export type PhotoSlot = { name: string; dataUrl: string; caption: string }

// 점검표 부가정보 — 기본정보·점검대상·기타의견·사진대지·확인자 (/ops/docs/inspection-extras) [057]
export type InspExtra = {
  ids: string[] // 이 점검표에 포함된 공정별 점검 ID (보기 화면 매칭 키)
  info: { org: string; dept: string; role: string; writer: string; writeDate: string; inspectDate: string; place: string; accType: string }
  targets: string[] // 점검대상 체크(공정 key — 당직 등 점검표 없는 공정 포함)
  etc: string
  photos: Record<string, PhotoSlot[]>
  signer: string
  // 현장앱 다중 결재란 — {직책, 서명자, 서명이미지 저장경로}. 백엔드 _persist_approval_lines(/ops/docs/inspection-extras).
  approval_lines?: { title: string; signer: string; image_ref?: string | null }[]
}

export const EMPTY_INFO: InspExtra['info'] = {
  org: '', dept: '', role: '', writer: '', writeDate: '', inspectDate: '', place: '', accType: '',
}

// [사진대지 매칭 폴백] 현장앱은 공정(파트)별 점검을 개별 제출하고 부가정보(사진 포함)가 첫 파트의
// 점검 id에만 묶여 저장되는 경우가 있다. 이때 웹이 보는 점검표(다른 파트 id 묶음)와 ids가 어긋나
// 사진 있는 항목을 못 찾았다("앱 업로드 사진 안 뜸"). → ① 점검표의 어떤 id든 entry.ids와 겹치면
// 매칭, ② 없으면 같은 점검일(info.inspectDate/writeDate) 항목, ③ 그래도 없으면 이 학교 항목들의
// 사진만 파트라벨 단위로 병합해 표시(사진은 파트라벨 키라 학교 내 병합이 안전 — 학교 간 혼합 없음,
// 같은 라벨은 첫 항목 것만 사용해 중복 없음).
export function resolveExtra(entries: InspExtra[] | undefined, idSet: Set<string>, date: string): InspExtra | undefined {
  const list = (entries ?? []).filter((e): e is InspExtra => !!e && typeof e === 'object')
  const matched = list.filter((e) => Array.isArray(e.ids) && e.ids.some((id) => idSet.has(id)))
  const sameDate = date
    ? list.filter((e) => !matched.includes(e) && (e.info?.inspectDate === date || e.info?.writeDate === date))
    : []
  // 사진 병합 풀 — id 매칭 → 같은 점검일 → 학교의 나머지 항목
  const collect = (pool: InspExtra[]): InspExtra['photos'] => {
    const acc: InspExtra['photos'] = {}
    for (const e of pool) {
      for (const [label, slots] of Object.entries(e.photos ?? {})) {
        const real = (slots ?? []).filter((s) => s && (s.name || s.dataUrl || s.caption))
        if (real.length > 0 && !acc[label]?.length) acc[label] = real
      }
    }
    return acc
  }
  const rest = list.filter((e) => !matched.includes(e) && !sameDate.includes(e))
  let photos = collect(matched.length > 0 ? [...matched, ...sameDate] : [...sameDate, ...rest])
  // 직매칭 항목에 사진이 하나도 없으면(앱이 사진을 다른 파트 entry에만 실은 경우 — 파트별 제출 조각화)
  // 같은 학교 항목으로 확장 병합 — 파트 단위 조회(상세 모달 등)에서도 사진이 숨지 않게.
  if (matched.length > 0 && Object.keys(photos).length === 0) photos = collect([...sameDate, ...rest])
  // 기본정보·확인자 등은 id/점검일이 맞는 항목에서만 — 다른 점검표의 정보가 섞이지 않게.
  const base = matched[0] ?? sameDate[0]
  if (base) return { ...base, photos: Object.keys(photos).length > 0 ? photos : base.photos ?? {} }
  if (Object.keys(photos).length === 0) return undefined
  return { ids: [], info: EMPTY_INFO, targets: [], etc: '', photos, signer: '' }
}
