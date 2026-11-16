// 경영 콘솔 — 팝업 공지 탭: 홈 진입 팝업 등록·수정·켜기/끄기·기간·미리보기·삭제.
// 저장은 org_docs 'home-popups'(PUT 은 hq_admin·executive 만 — 백엔드 게이트).
// 저장 직전 최신 문서를 다시 읽어 그 위에 변경을 적용한다(관리자 동시 편집 덮어쓰기 방지).
import { useEffect, useState } from 'react'
import { BellRing, Eye, ImagePlus, Pencil, Plus, Power, Trash2, X } from 'lucide-react'
import { api } from '../../lib/api'
import { Modal } from '../../components/Modal'
import { HomePopup } from '../../components/HomePopup'
import {
  POPUP_DOC_KEY, normalizeDoc, popupStatus, safeImage, shrinkImage, todayStr,
  type HomePopupDoc, type HomePopupItem,
} from '../../lib/homePopups'

type Draft = {
  title: string
  body: string
  image: string
  link_url: string
  link_label: string
  start: string
  end: string
  active: boolean
  renotify: boolean
}

const EMPTY: Draft = {
  title: '', body: '', image: '', link_url: '', link_label: '',
  start: '', end: '', active: true, renotify: true,
}

const STATUS_PILL: Record<ReturnType<typeof popupStatus>, [string, string]> = {
  on: ['ok', '노출 중'],
  off: ['na', '꺼짐'],
  scheduled: ['warn', '예약'],
  ended: ['na', '기간 종료'],
}

export default function ConsolePopup() {
  const [items, setItems] = useState<HomePopupItem[]>([])
  const [loading, setLoading] = useState(true)
  const [me, setMe] = useState('')
  const [modal, setModal] = useState<null | { id: string | null }>(null)
  const [d, setD] = useState<Draft>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [preview, setPreview] = useState<HomePopupItem[] | null>(null)
  const [delTarget, setDelTarget] = useState<HomePopupItem | null>(null)

  async function fetchDoc(): Promise<HomePopupDoc> {
    const r = await api<{ doc: unknown }>(`/ops/docs/${POPUP_DOC_KEY}`)
    return normalizeDoc(r?.doc)
  }

  function load() {
    return fetchDoc()
      .then((doc) => setItems(doc.items))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    void load()
    api<{ name?: string; login_id?: string }>('/auth/me')
      .then((u) => setMe(u?.name || u?.login_id || ''))
      .catch(() => {})
  }, [])

  /** 최신 문서에 변경 적용 후 저장 */
  async function mutate(fn: (list: HomePopupItem[]) => HomePopupItem[], okMsg: string) {
    const latest = await fetchDoc()
    const next = fn(latest.items)
    await api(`/ops/docs/${POPUP_DOC_KEY}`, { method: 'PUT', body: JSON.stringify({ doc: { items: next } }) })
    setItems(next)
    setMsg(okMsg)
    setTimeout(() => setMsg(''), 2200)
  }

  const stamp = () => ({ updated_at: new Date().toISOString(), updated_by: me })

  function openCreate() {
    setD({ ...EMPTY, start: todayStr() })
    setErr('')
    setModal({ id: null })
  }

  function openEdit(it: HomePopupItem) {
    setD({
      title: it.title, body: it.body, image: it.image || '',
      link_url: it.link_url || '', link_label: it.link_label || '',
      start: it.start || '', end: it.end || '', active: it.active, renotify: true,
    })
    setErr('')
    setModal({ id: it.id })
  }

  async function onPickImage(f: File | undefined) {
    if (!f) return
    setErr('')
    try {
      setD((x) => ({ ...x, image: '' }))
      const url = await shrinkImage(f)
      if (url.length > 1_500_000) throw new Error('이미지가 너무 큽니다. 더 작은 이미지를 올려주세요.')
      setD((x) => ({ ...x, image: url }))
    } catch (e) {
      setErr(e instanceof Error ? e.message : '이미지 처리 실패')
    }
  }

  function draftToItem(base: HomePopupItem | null): HomePopupItem {
    return {
      id: base?.id ?? (crypto.randomUUID?.() ?? `p-${Date.now()}`),
      title: d.title.trim(),
      body: d.body.trim(),
      image: d.image || undefined,
      link_url: d.link_url.trim() || undefined,
      link_label: d.link_label.trim() || undefined,
      start: d.start || undefined,
      end: d.end || undefined,
      active: d.active,
      version: base ? base.version + (d.renotify ? 1 : 0) : 1,
      ...stamp(),
    }
  }

  async function submit() {
    if (!d.title.trim() && !d.image) { setErr('제목 또는 이미지 중 하나는 있어야 합니다.'); return }
    if (d.start && d.end && d.end < d.start) { setErr('종료일이 시작일보다 빠릅니다.'); return }
    if (d.link_url.trim() && !/^(https?:\/\/|\/(?!\/))/i.test(d.link_url.trim())) {
      setErr('링크는 http:// · https:// 로 시작하거나 플랫폼 경로(/…)여야 합니다.'); return
    }
    setBusy(true)
    setErr('')
    try {
      const id = modal?.id ?? null
      await mutate((list) => {
        if (id === null) return [draftToItem(null), ...list]
        return list.map((x) => (x.id === id ? draftToItem(x) : x))
      }, id === null ? '팝업을 등록했습니다.' : '수정했습니다.')
      setModal(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setBusy(false)
    }
  }

  async function toggle(it: HomePopupItem) {
    try {
      // 다시 켤 때는 version 을 올려 '오늘 하루 열지 않기' 한 사람에게도 다시 보이게 한다.
      await mutate((list) => list.map((x) => (x.id === it.id
        ? { ...x, active: !x.active, version: x.active ? x.version : x.version + 1, ...stamp() }
        : x)), it.active ? '팝업을 껐습니다.' : '팝업을 켰습니다.')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '저장 실패')
    }
  }

  async function remove() {
    if (!delTarget) return
    const id = delTarget.id
    try {
      await mutate((list) => list.filter((x) => x.id !== id), '삭제했습니다.')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '삭제 실패')
    }
    setDelTarget(null)
  }

  const today = todayStr()
  const live = items.filter((x) => popupStatus(x, today) === 'on')
  const draftImg = safeImage(d.image)
  const editBase = modal?.id ? items.find((x) => x.id === modal.id) ?? null : null

  return (
    <div>
      <div className="ledger" style={{ marginBottom: 24 }}>
        <div className="lh">
          <h2><BellRing size={18} /> 홈 팝업 공지</h2>
          <div className="sp" />
          {msg && <span className="pillx ok">{msg}</span>}
          <span className="pillx na">노출 중 {live.length} / 전체 {items.length}</span>
          <button className="btn btn-ghost" disabled={live.length === 0} onClick={() => setPreview(live)}>
            <Eye size={15} /> 홈 화면 미리보기
          </button>
          <button className="btn btn-primary" onClick={openCreate}><Plus size={15} /> 팝업 등록</button>
        </div>
        <div className="card-body muted" style={{ padding: '10px 26px 0', fontSize: 12.5 }}>
          켜져 있고 기간 안인 팝업이 직원들 홈 화면 진입 시 뜹니다. 여러 개면 좌우로 넘겨 봅니다.
          수정하거나 다시 켜면 '오늘 하루 열지 않기' 한 직원에게도 다시 뜹니다.
        </div>
        <div className="twrap">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 96 }} className="c">상태</th>
                <th>제목</th>
                <th style={{ width: 190 }}>노출 기간</th>
                <th style={{ width: 150 }}>최근 수정</th>
                <th style={{ width: 210 }} className="c">작업</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const [tone, label] = STATUS_PILL[popupStatus(it, today)]
                return (
                  <tr key={it.id}>
                    <td className="c"><span className={'pillx ' + tone}>{label}</span></td>
                    <td>
                      <b>{it.title || '(제목 없음 · 이미지)'}</b>
                      {it.image && <span className="pillx na" style={{ marginLeft: 6 }}>이미지</span>}
                      {it.body && (
                        <div className="muted" style={{ maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12.5 }}>
                          {it.body}
                        </div>
                      )}
                    </td>
                    <td>{it.start || '즉시'} ~ {it.end || '계속'}</td>
                    <td className="muted" style={{ fontSize: 12.5 }}>
                      {(it.updated_at || '').slice(0, 10)}{it.updated_by ? ` · ${it.updated_by}` : ''}
                    </td>
                    <td className="c" style={{ whiteSpace: 'nowrap' }}>
                      <button
                        className={'btn ' + (it.active ? 'btn-ghost' : 'btn-primary')}
                        style={{ height: 30, padding: '0 10px' }}
                        onClick={() => void toggle(it)}
                        title={it.active ? '끄기' : '켜기'}
                      >
                        <Power size={13} /> {it.active ? '끄기' : '켜기'}
                      </button>{' '}
                      <button className="btn btn-ghost" style={{ height: 30, padding: '0 10px' }} title="미리보기" onClick={() => setPreview([it])}><Eye size={13} /></button>{' '}
                      <button className="btn btn-ghost" style={{ height: 30, padding: '0 10px' }} title="수정" onClick={() => openEdit(it)}><Pencil size={13} /></button>{' '}
                      <button className="btn btn-ghost" style={{ height: 30, padding: '0 10px', color: 'var(--red-ink)' }} title="삭제" onClick={() => setDelTarget(it)}><Trash2 size={13} /></button>
                    </td>
                  </tr>
                )
              })}
              {!loading && items.length === 0 && (
                <tr><td colSpan={5}><div className="tstate">등록된 팝업이 없습니다 — [팝업 등록]으로 시작하세요. (예: 현장 앱 새 버전 안내)</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <Modal
          title={modal.id ? '팝업 수정' : '팝업 등록'}
          wide
          onClose={() => setModal(null)}
          footer={
            <>
              <button
                className="btn btn-ghost"
                onClick={() => setPreview([draftToItem(editBase)])}
                disabled={!d.title.trim() && !d.image}
              >
                <Eye size={14} /> 미리보기
              </button>
              <div style={{ flex: 1 }} />
              <button className="btn btn-ghost" onClick={() => setModal(null)}>취소</button>
              <button className="btn btn-primary" onClick={() => void submit()} disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
            </>
          }
        >
          <div className="formrow" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
            <label className="field"><span>제목</span>
              <input className="input" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="예: 현장 앱 새 버전(1.4.0) 업데이트 안내" />
            </label>
            <label className="field"><span>내용</span>
              <textarea className="input" rows={5} value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} placeholder={'예: 태블릿에서 아래 링크로 새 APK를 받아 설치해 주세요.\n설치 전 오프라인 큐가 비어 있는지 확인 바랍니다.'} />
            </label>
            <div className="field">
              <span>이미지 (선택 — 가로 1200px로 자동 축소)</span>
              {draftImg ? (
                <div style={{ position: 'relative' }}>
                  <img src={draftImg} alt="" style={{ width: '100%', maxHeight: 220, objectFit: 'contain', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--card-2)' }} />
                  <button className="btn btn-ghost" style={{ position: 'absolute', top: 6, right: 6, height: 28, padding: '0 8px' }} onClick={() => setD({ ...d, image: '' })}>
                    <X size={13} /> 빼기
                  </button>
                </div>
              ) : (
                <label className="btn btn-ghost" style={{ alignSelf: 'flex-start', cursor: 'pointer' }}>
                  <ImagePlus size={14} /> 이미지 선택
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(e) => { void onPickImage(e.target.files?.[0]); e.target.value = '' }} />
                </label>
              )}
            </div>
            <div className="formrow" style={{ gap: 12 }}>
              <label className="field" style={{ flex: 2, minWidth: 220 }}><span>링크 (선택)</span>
                <input className="input" value={d.link_url} onChange={(e) => setD({ ...d, link_url: e.target.value })} placeholder="https://… 또는 /resources" />
              </label>
              <label className="field" style={{ flex: 1, minWidth: 140 }}><span>버튼 문구</span>
                <input className="input" value={d.link_label} onChange={(e) => setD({ ...d, link_label: e.target.value })} placeholder="자세히 보기" />
              </label>
            </div>
            <div className="formrow" style={{ gap: 12 }}>
              <label className="field"><span>시작일 (비우면 즉시)</span>
                <input className="input" type="date" value={d.start} onChange={(e) => setD({ ...d, start: e.target.value })} />
              </label>
              <label className="field"><span>종료일 (비우면 계속)</span>
                <input className="input" type="date" value={d.end} onChange={(e) => setD({ ...d, end: e.target.value })} />
              </label>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
              <input type="checkbox" checked={d.active} onChange={(e) => setD({ ...d, active: e.target.checked })} /> 켜기(홈에 노출)
            </label>
            {modal.id && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, cursor: 'pointer' }}>
                <input type="checkbox" checked={d.renotify} onChange={(e) => setD({ ...d, renotify: e.target.checked })} />
                '오늘 하루 열지 않기' 한 직원에게도 다시 띄우기 <span className="muted">(오타 수정만이면 해제)</span>
              </label>
            )}
            {err && <div style={{ color: 'var(--red-ink)', fontSize: 12.5, fontWeight: 600 }}>{err}</div>}
          </div>
        </Modal>
      )}

      {delTarget && (
        <Modal
          title="팝업 삭제"
          onClose={() => setDelTarget(null)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setDelTarget(null)}>취소</button>
              <button className="btn btn-danger" onClick={() => void remove()}><Trash2 size={14} /> 삭제</button>
            </>
          }
        >
          <p style={{ margin: 0 }}>
            <b>{delTarget.title || '(제목 없음)'}</b> 팝업을 삭제합니다. 잠시 내리기만 하려면 [끄기]를 쓰세요.
          </p>
        </Modal>
      )}

      {preview && preview.length > 0 && (
        <HomePopup items={preview} preview onClose={() => setPreview(null)} />
      )}
    </div>
  )
}
