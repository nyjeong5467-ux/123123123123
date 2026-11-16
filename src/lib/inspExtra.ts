// 점검표 부가정보(inspection-extras) 공용 모델 + 매칭 로직.
// Inspection.tsx(상세 모달·보기 양식)와 InspectionForm.tsx(작성/수정 화면)가 같은 폴백 매칭을 쓰도록
// 단일 소스로 분리 — 앱 파트별 제출로 ids가 조각나도 어느 화면에서든 사진·서명이 숨지 않게 한다.
import { fetchImageDataUrl } from './media'

// 사진 슬롯 — 전환기 호환 모델.
//   dataUrl: 구서버/이관 전 base64 본문(있으면 그대로 표시) · 새 슬롯 업로드 시에도 dataUrl 로 전송(업로드 형식 불변)
//   path·thumb: 신계약(2026-11) 저장 경로 — 바이너리는 GET /files/img?p=<path>[&w=320] 로 인증 헤더 실어 받음
//   둘 다 없으면 "사진 없음" 자리표시(이름·설명만 있는 슬롯).
export type PhotoSlot = { name: string; dataUrl?: string; caption: string; path?: string; thumb?: string }

/** 슬롯에 표시할 이미지가 있는가(dataUrl 또는 path). */
export const slotHasImage = (s: PhotoSlot | null | undefined): boolean => !!(s && (s.dataUrl || s.path))
/** 슬롯이 비어 있지 않은가(이미지·이름·설명 중 하나라도). */
export const slotHasAny = (s: PhotoSlot | null | undefined): boolean => !!(s && (s.dataUrl || s.path || s.name || s.caption))

// 점검표 부가정보 — 기본정보·점검대상·기타의견·사진대지·확인자 (/ops/docs/inspection-extras) [057]
export type InspExtra = {
  ids: string[] // 이 점검표에 포함된 공정별 점검 ID (보기 화면 매칭 키)
  info: { org: string; dept: string; role: string; writer: string; writeDate: string; inspectDate: string; place: string; accType: string }
  targets: string[] // 점검대상 체크(공정 key — 당직 등 점검표 없는 공정 포함)
  etc: string
  photos: Record<string, PhotoSlot[]>
  signer: string
  // 현장앱 다중 결재란 — {직책, 서명자, 서명이미지 저장경로}. 백엔드 _persist_approval_lines(/ops/docs/inspection-extras).
  // image_data: 웹에서 추가한 확인자(행정실장·교장 등)의 서명패드 PNG(dataURL) — 저장경로(image_ref)가 없는 웹 서명용 [119]
  approval_lines?: { title: string; signer: string; image_ref?: string | null; image_data?: string | null }[]
  // 서명 원본 스트로크 JSON 저장 참조(sign_<iid>.strokes.json) — 교육청 봇이 획 재생. 앱/웹 서명패드 공통 [G-6]
  sign_strokes_ref?: string
}

/**
 * [사진 분리] PDF 캡처·메일 첨부 어댑터 — path 만 있는 슬롯의 원본을 GET /files/img 로 받아 dataUrl 로 채운다.
 * 기존 dataUrl 기반 렌더(InspectionSheetBody → html2canvas)를 그대로 쓰기 위한 변환. 실패한 슬롯은 자리표시로 남긴다.
 */
export async function resolvePhotoDataUrls(photos: Record<string, PhotoSlot[]> | undefined): Promise<Record<string, PhotoSlot[]>> {
  const out: Record<string, PhotoSlot[]> = {}
  const jobs: Promise<void>[] = []
  for (const [label, slots] of Object.entries(photos ?? {})) {
    const arr = (slots ?? []).map((s) => ({ ...s }))
    out[label] = arr
    arr.forEach((s, i) => {
      if (s.dataUrl || !s.path) return
      jobs.push(fetchImageDataUrl(s.path).then((d) => { arr[i] = { ...s, dataUrl: d } }).catch(() => { /* 자리표시 유지 */ }))
    })
  }
  await Promise.all(jobs)
  return out
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
        const real = (slots ?? []).filter((s) => slotHasAny(s))
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
