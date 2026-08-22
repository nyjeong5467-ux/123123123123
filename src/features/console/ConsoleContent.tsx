// 경영 콘솔 — 홈페이지·콘텐츠 탭: 공지 관리(CRUD) + 홈페이지 정보 관리(KV) + 자료실(임베드).
// 공지는 기존 /notices API(백엔드 완비), 홈페이지 정보는 org_docs 'homepage-content' KV.
import { useEffect, useState } from 'react'
import { Globe, Megaphone, Pencil, Pin, Plus, Save, Trash2, X } from 'lucide-react'
import { api } from '../../lib/api'
import { Modal } from '../../components/Modal'
import { Resources } from '../../pages/Resources'

type Notice = {
  id: string
  title: string
  body: string
  pinned: boolean
  created_at?: string
}

type Homepage = {
  company_intro: string
  contact_phone: string
  contact_email: string
  banner_text: string
}

const HOMEPAGE_DEFAULT: Homepage = {
  company_intro: '(주)한국산업안전협회 — 학교 안전관리 통합 플랫폼',
  contact_phone: '',
  contact_email: '',
  banner_text: '',
}

export default function ConsoleContent() {
  // ── 공지 관리 ──
  const [notices, setNotices] = useState<Notice[]>([])
  const [nLoading, setNLoading] = useState(true)
  const [modal, setModal] = useState<null | { mode: 'create' } | { mode: 'edit'; target: Notice }>(null)
  const [nTitle, setNTitle] = useState('')
  const [nBody, setNBody] = useState('')
  const [nPinned, setNPinned] = useState(false)
  const [nBusy, setNBusy] = useState(false)
  const [nErr, setNErr] = useState('')
  const [delTarget, setDelTarget] = useState<Notice | null>(null)

  function loadNotices() {
    return api<Notice[]>('/notices')
      .then((d) => setNotices(Array.isArray(d) ? d : []))
      .catch(() => setNotices([]))
      .finally(() => setNLoading(false))
  }
  useEffect(() => { void loadNotices() }, [])

  function openCreate() {
    setNTitle(''); setNBody(''); setNPinned(false); setNErr('')
    setModal({ mode: 'create' })
  }
  function openEdit(n: Notice) {
    setNTitle(n.title); setNBody(n.body); setNPinned(n.pinned); setNErr('')
    setModal({ mode: 'edit', target: n })
  }

  async function submitNotice() {
    if (!nTitle.trim()) { setNErr('제목을 입력하세요.'); return }
    setNBusy(true)
    setNErr('')
    try {
      const payload = JSON.stringify({ title: nTitle.trim(), body: nBody.trim(), pinned: nPinned })
      if (modal?.mode === 'edit') {
        await api(`/notices/${modal.target.id}`, { method: 'PUT', body: payload })
      } else {
        await api('/notices', { method: 'POST', body: payload })
      }
      setModal(null)
      await loadNotices()
    } catch (e) {
      setNErr(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setNBusy(false)
    }
  }

  async function deleteNotice() {
    if (!delTarget) return
    try {
      await api(`/notices/${delTarget.id}`, { method: 'DELETE' })
      setDelTarget(null)
      await loadNotices()
    } catch {
      setDelTarget(null)
    }
  }

  // ── 홈페이지 정보 관리 (KV) ──
  const [hp, setHp] = useState<Homepage>(HOMEPAGE_DEFAULT)
  const [hpDraft, setHpDraft] = useState<Homepage>(HOMEPAGE_DEFAULT)
  const [hpEditing, setHpEditing] = useState(false)
  const [hpSaving, setHpSaving] = useState(false)
  const [hpMsg, setHpMsg] = useState('')

  useEffect(() => {
    let alive = true
    api<{ doc: Partial<Homepage> }>('/ops/docs/homepage-content')
      .then((d) => {
        if (!alive) return
        const merged = { ...HOMEPAGE_DEFAULT, ...(d?.doc || {}) }
        setHp(merged)
        setHpDraft(merged)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  async function saveHp() {
    setHpSaving(true)
    setHpMsg('')
    try {
      await api('/ops/docs/homepage-content', { method: 'PUT', body: JSON.stringify({ doc: hpDraft }) })
      setHp(hpDraft)
      setHpEditing(false)
      setHpMsg('저장되었습니다.')
      setTimeout(() => setHpMsg(''), 2000)
    } catch (e) {
      setHpMsg(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setHpSaving(false)
    }
  }

  const sorted = [...notices].sort((a, b) => Number(b.pinned) - Number(a.pinned))

  return (
    <div>
      {/* ── 공지 관리 ── */}
      <div className="ledger" style={{ marginBottom: 24 }}>
        <div className="lh">
          <h2><Megaphone size={18} /> 공지 관리</h2>
          <div className="sp" />
          <span className="pillx na">{notices.length}건</span>
          <button className="btn btn-primary" onClick={openCreate}><Plus size={15} /> 공지 등록</button>
        </div>
        <div className="twrap">
          <table className="tbl">
            <thead><tr><th style={{ width: 70 }} className="c">필독</th><th>제목</th><th>내용</th><th style={{ width: 110 }}>작성일</th><th style={{ width: 120 }} className="c">작업</th></tr></thead>
            <tbody>
              {sorted.map((n) => (
                <tr key={n.id}>
                  <td className="c">{n.pinned ? <span className="pillx warn"><Pin size={11} /> 필독</span> : <span className="pillx na">일반</span>}</td>
                  <td><b>{n.title}</b></td>
                  <td className="muted" style={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.body}</td>
                  <td>{(n.created_at || '').slice(0, 10)}</td>
                  <td className="c">
                    <button className="btn btn-ghost" style={{ height: 30, padding: '0 10px' }} onClick={() => openEdit(n)}><Pencil size={13} /></button>{' '}
                    <button className="btn btn-ghost" style={{ height: 30, padding: '0 10px', color: 'var(--red-ink)' }} onClick={() => setDelTarget(n)}><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
              {!nLoading && sorted.length === 0 && (
                <tr><td colSpan={5}><div className="tstate">등록된 공지가 없습니다 — [공지 등록]으로 시작하세요.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 홈페이지 정보 관리 ── */}
      <div className="ledger" style={{ marginBottom: 24 }}>
        <div className="lh">
          <h2><Globe size={18} /> 홈페이지 정보 관리</h2>
          <div className="sp" />
          {hpMsg && <span className="pillx ok">{hpMsg}</span>}
          {!hpEditing ? (
            <button className="btn btn-ghost" onClick={() => { setHpDraft(hp); setHpEditing(true) }}><Pencil size={14} /> 편집</button>
          ) : (
            <>
              <button className="btn btn-ghost" onClick={() => setHpEditing(false)}><X size={14} /> 취소</button>
              <button className="btn btn-primary" onClick={saveHp} disabled={hpSaving}><Save size={14} /> {hpSaving ? '저장 중…' : '저장'}</button>
            </>
          )}
        </div>
        <div className="card-body" style={{ padding: '20px 26px' }}>
          {!hpEditing ? (
            <div className="kpis" style={{ marginBottom: 0 }}>
              <div className="kpi">
                <div className="l">회사 소개문</div>
                <div className="v" style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.5 }}>{hp.company_intro || '—'}</div>
              </div>
              <div className="kpi">
                <div className="l">대표 연락처</div>
                <div className="v" style={{ fontSize: 15 }}>{hp.contact_phone || '—'}</div>
                <div className="d">{hp.contact_email || '이메일 미등록'}</div>
              </div>
              <div className="kpi">
                <div className="l">배너 문구</div>
                <div className="v" style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.5 }}>{hp.banner_text || <span className="muted">미설정</span>}</div>
              </div>
            </div>
          ) : (
            <>
              <div className="formrow">
                <label className="field" style={{ flex: 1, minWidth: 260 }}>
                  <span>회사 소개문</span>
                  <input className="input" value={hpDraft.company_intro} onChange={(e) => setHpDraft((d) => ({ ...d, company_intro: e.target.value }))} />
                </label>
              </div>
              <div className="formrow" style={{ marginTop: 12 }}>
                <label className="field"><span>대표 전화</span>
                  <input className="input" placeholder="예: 062-000-0000" value={hpDraft.contact_phone} onChange={(e) => setHpDraft((d) => ({ ...d, contact_phone: e.target.value }))} />
                </label>
                <label className="field"><span>대표 이메일</span>
                  <input className="input" placeholder="예: safety@example.com" value={hpDraft.contact_email} onChange={(e) => setHpDraft((d) => ({ ...d, contact_email: e.target.value }))} />
                </label>
                <label className="field" style={{ flex: 1, minWidth: 220 }}><span>배너 문구</span>
                  <input className="input" placeholder="홈페이지 상단 배너에 노출할 문구" value={hpDraft.banner_text} onChange={(e) => setHpDraft((d) => ({ ...d, banner_text: e.target.value }))} />
                </label>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── 자료실 관리(기존 화면 임베드) ── */}
      <Resources embedded />

      {/* ── 공지 등록/수정 모달 ── */}
      {modal && (
        <Modal
          title={modal.mode === 'edit' ? '공지 수정' : '공지 등록'}
          onClose={() => setModal(null)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setModal(null)}>취소</button>
              <button className="btn btn-primary" onClick={submitNotice} disabled={nBusy}>{nBusy ? '저장 중…' : '저장'}</button>
            </>
          }
        >
          <div className="formrow" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
            <label className="field"><span>제목</span>
              <input className="input" value={nTitle} onChange={(e) => setNTitle(e.target.value)} placeholder="공지 제목" />
            </label>
            <label className="field"><span>내용</span>
              <textarea className="input" rows={5} value={nBody} onChange={(e) => setNBody(e.target.value)} placeholder="공지 내용" />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
              <input type="checkbox" checked={nPinned} onChange={(e) => setNPinned(e.target.checked)} /> 필독(상단 고정)
            </label>
            {nErr && <div style={{ color: 'var(--red-ink)', fontSize: 12.5, fontWeight: 600 }}>{nErr}</div>}
          </div>
        </Modal>
      )}

      {/* ── 공지 삭제 확인 ── */}
      {delTarget && (
        <Modal
          title="공지 삭제"
          onClose={() => setDelTarget(null)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setDelTarget(null)}>취소</button>
              <button className="btn btn-danger" onClick={deleteNotice}><Trash2 size={14} /> 삭제</button>
            </>
          }
        >
          <p style={{ margin: 0, fontSize: 14 }}><b>{delTarget.title}</b> 공지를 삭제할까요? 되돌릴 수 없습니다.</p>
        </Modal>
      )}
    </div>
  )
}
