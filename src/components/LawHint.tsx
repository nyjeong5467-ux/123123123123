// 점검표 비고란 옆 '법령 근거' 힌트 — 문항 코드(+비고 입력)로 관련 조문을 추천받아 비고에 인용 문구를 붙인다.
//  · 서버 /law/suggest: ① 전문가 매핑표 조문(근거) → ② 비고 입력어 검색 → ③ 문항 문구 검색(참고) 순
//  · 자동 삽입은 하지 않는다 — 사람이 칩을 눌러야만 들어간다(교육청 비고란에 그대로 전송되는 문구이므로)
//  · 삽입 형식: 기존 비고 뒤에 ' (「법령명」 제N조 의거)' — 한 줄 입력칸에 맞게 짧게
import { useEffect, useRef, useState } from 'react'
import { Scale } from 'lucide-react'
import { api } from '../lib/api'

export type LawPick = { id: string; law: string; no: string; title: string; kind: string; citation: string; why: string; eff_date: string }
type SuggestRes = { suggestions: LawPick[] }

const WHY: Record<string, string> = { mapped: '근거', query: '입력어', item_text: '참고' }

/** 비고에 인용 문구 붙이기(이미 같은 조문이 있으면 그대로) */
export function appendCitation(remark: string, p: LawPick): string {
  const short = p.kind === 'annex' ? `「${p.law}」 별표 ${p.no}` : `「${p.law}」 제${p.no}조`
  if (remark.includes(short)) return remark
  const base = remark.trim()
  return base ? `${base} (${short} 의거)` : `${short} 의거`
}

export function LawHint({ code, query, onPick }: { code: string; query: string; onPick: (p: LawPick) => void }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<LawPick[] | null>(null)
  const [err, setErr] = useState('')
  const timer = useRef<number | null>(null)

  useEffect(() => {
    if (!open) return
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(async () => {
      try {
        setErr('')
        const q = query.trim() ? `&q=${encodeURIComponent(query.trim())}` : ''
        const r = await api<SuggestRes>(`/law/suggest?item=${encodeURIComponent(code)}${q}&limit=5`)
        setItems(r.suggestions)
      } catch (e) {
        setErr((e as Error).message || '법령 추천을 불러오지 못했습니다')
        setItems([])
      }
    }, 350)
    return () => { if (timer.current) window.clearTimeout(timer.current) }
  }, [open, code, query])

  return (
    <div className="insf-law">
      <button type="button" className={'insf-lawbtn' + (open ? ' on' : '')} title="관련 법령 조문 추천 — 누르면 비고에 인용 문구가 들어갑니다"
        onClick={() => setOpen((v) => !v)}>
        <Scale size={13} /> 법령
      </button>
      {open && (
        <div className="insf-lawpop">
          {items === null && !err && <span className="insf-lawmsg">조문 찾는 중…</span>}
          {err && <span className="insf-lawmsg">{err}</span>}
          {items && items.length === 0 && !err && <span className="insf-lawmsg">추천할 조문이 없습니다</span>}
          {items && items.map((p) => (
            <button key={p.id} type="button" className="insf-lawchip" title={`${p.citation} · 시행 ${p.eff_date}`}
              onClick={() => { onPick(p); setOpen(false) }}>
              <span className={'insf-lawwhy w-' + p.why}>{WHY[p.why] || p.why}</span>
              {p.kind === 'annex' ? `별표 ${p.no}` : `제${p.no}조`}{p.title ? `(${p.title})` : ''}
              <span className="insf-lawlaw">{p.law}</span>
            </button>
          ))}
          {items && items.length > 0 && <span className="insf-lawsrc">출처: 법제처 국가법령정보센터</span>}
        </div>
      )}
    </div>
  )
}
