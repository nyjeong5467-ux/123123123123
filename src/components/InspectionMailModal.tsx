// [062] 점검표 학교 메일 전송 모달 — 작성한 종사자 안전·보건 점검표를 PDF로 자동 첨부하고,
// 학교 이메일이 미리 입력된 상태에서 본문을 다듬어 바로 전송한다.
// PDF는 양식 본문(InspectionSheetBody)을 화면 밖에 렌더 → html2canvas + jsPDF(cdnjs)로 생성.
// 전송은 POST /mail/send — 목서버는 성공 응답, 실서버는 백엔드 구현 필요(수정이력 [062] 참고).
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FileText, Mail, Send, X } from 'lucide-react'
import { api } from '../lib/api'
import { InspectionSheetBody, type SheetData } from './InspectionSheetView'

declare global {
  interface Window {
    html2canvas?: (el: HTMLElement, opts?: Record<string, unknown>) => Promise<HTMLCanvasElement>
    jspdf?: { jsPDF: new (opts?: Record<string, unknown>) => JsPdfDoc }
  }
}
type JsPdfDoc = {
  addPage: () => void
  addImage: (data: string, fmt: string, x: number, y: number, w: number, h: number) => void
  output: (type: string) => string | Blob
}

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return }
    const s = document.createElement('script')
    s.src = src
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('PDF 라이브러리 로드 실패: ' + src))
    document.head.appendChild(s)
  })
}

export function InspectionMailModal(p: {
  sheet: SheetData
  to: string
  subject: string
  body: string
  onClose: () => void
}) {
  const [to, setTo] = useState(p.to)
  const [subject, setSubject] = useState(p.subject)
  const [body, setBody] = useState(p.body)
  const [pdf, setPdf] = useState<{ name: string; base64: string; blobUrl: string; pages: number } | null>(null)
  const [pdfErr, setPdfErr] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState('')
  const [err, setErr] = useState('')
  const paperRef = useRef<HTMLDivElement>(null)

  const fileName = `종사자안전보건점검표_${p.sheet.schoolName}_${p.sheet.date || '작성중'}.pdf`

  /* 양식 → PDF 생성 (모달 열릴 때 1회) */
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        // 동봉 라이브러리(public/vendor) — 오프라인에서도 동작
        await loadScript('/vendor/html2canvas.min.js')
        await loadScript('/vendor/jspdf.umd.min.js')
        // 렌더 완료 대기(사진 dataUrl 등)
        await new Promise((r) => setTimeout(r, 250))
        const el = paperRef.current?.querySelector('.inss-page') as HTMLElement | null
        if (!el || !window.html2canvas || !window.jspdf) throw new Error('양식 렌더에 실패했습니다.')
        const canvas = await window.html2canvas(el, { scale: 2, backgroundColor: '#ffffff', logging: false })
        const { jsPDF } = window.jspdf
        const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
        const pageW = 210
        const pageH = 297
        const imgH = (canvas.height * pageW) / canvas.width
        const pages = Math.max(1, Math.ceil(imgH / pageH))
        const img = canvas.toDataURL('image/jpeg', 0.92)
        for (let i = 0; i < pages; i++) {
          if (i > 0) doc.addPage()
          doc.addImage(img, 'JPEG', 0, -i * pageH, pageW, imgH)
        }
        const dataUri = doc.output('datauristring') as string
        const base64 = dataUri.split(',')[1] || ''
        const blobUrl = URL.createObjectURL(doc.output('blob') as Blob)
        if (alive) setPdf({ name: fileName, base64, blobUrl, pages })
      } catch (e) {
        if (alive) setPdfErr(e instanceof Error ? e.message : 'PDF 생성에 실패했습니다.')
      }
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function send() {
    if (!to.trim()) { setErr('받는 사람 이메일을 입력하세요.'); return }
    if (!pdf) { setErr('점검표 PDF가 아직 준비되지 않았습니다. 잠시 후 다시 시도하세요.'); return }
    setSending(true)
    setErr('')
    try {
      await api('/mail/send', {
        method: 'POST',
        body: JSON.stringify({
          to: to.trim(),
          subject: subject.trim(),
          body,
          attachments: [{ name: pdf.name, content_base64: pdf.base64 }],
        }),
      })
      setSent(`전송 완료 — ${to.trim()} (첨부 ${pdf.name})`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '전송에 실패했습니다.')
    } finally {
      setSending(false)
    }
  }

  return createPortal(
    <div className="insm-overlay" role="dialog" aria-label="학교 메일 전송">
      <div className="insm-modal">
        <div className="insm-head">
          <Mail size={17} />
          <b>학교 메일 전송</b>
          <span className="s">종사자 안전·보건 점검표 송부</span>
          <div className="sp" />
          <button className="btn btn-ghost" onClick={p.onClose}><X size={14} /> 닫기</button>
        </div>

        <label className="insm-field">
          <span>받는 사람</span>
          <input className="input" value={to} onChange={(e) => setTo(e.target.value)} placeholder="school@example.kr" />
        </label>
        <label className="insm-field">
          <span>제목</span>
          <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </label>

        <div className="insm-field">
          <span>첨부</span>
          <div className="insm-attach">
            {pdf ? (
              <>
                <span className="chip"><FileText size={13} /> {pdf.name} · {pdf.pages}쪽</span>
                <a className="pv" href={pdf.blobUrl} target="_blank" rel="noreferrer">미리보기</a>
              </>
            ) : pdfErr ? (
              <span className="err">{pdfErr}</span>
            ) : (
              <span className="making">점검표 PDF 생성 중…</span>
            )}
          </div>
        </div>

        <label className="insm-field grow">
          <span>본문</span>
          <textarea className="input insm-body" value={body} onChange={(e) => setBody(e.target.value)} />
        </label>

        <div className="insm-foot">
          {sent && <span className="ok">{sent}</span>}
          {err && !sent && <span className="err">{err}</span>}
          <div className="sp" />
          <button className="btn btn-ghost" onClick={p.onClose}>{sent ? '완료' : '취소'}</button>
          <button className="btn btn-primary" disabled={sending || !!sent || !pdf} onClick={() => { void send() }}>
            <Send size={14} /> {sending ? '전송 중…' : '보내기'}
          </button>
        </div>
      </div>

      {/* 화면 밖 양식 렌더 — PDF 캡처용 (사용자에게 보이지 않음) */}
      <div ref={paperRef} style={{ position: 'fixed', left: -20000, top: 0, width: 940, background: '#fff' }} aria-hidden>
        <InspectionSheetBody sheet={p.sheet} />
      </div>
    </div>,
    document.body,
  )
}
