import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { FolderOpen, FileText, Download, Trash2, Plus, Search } from 'lucide-react'
import { api } from '../lib/api'
import { Modal } from '../components/Modal'

type Category = '양식' | '지침' | '증빙' | '기타'

// 목록 조회 응답(가벼운 형태 — content 없음)
type ResourceItem = {
  id: string
  title: string
  category: Category
  size: string
  date: string
}
// 단건 조회 응답(다운로드용 — content 포함)
type ResourceFull = ResourceItem & { content: string }
// 등록 요청 본문
type ResourceCreate = {
  title: string
  category: Category
  size: string
  content: string
}

const CATS: Category[] = ['양식', '지침', '증빙', '기타']
const PILL: Record<Category, string> = { 양식: 'doing', 지침: 'ok', 증빙: 'warn', 기타: 'todo' }

// 비어 있을 때 1회만 심는 샘플 문서(데모용)
const SEED: ResourceCreate[] = [
  { title: '안전점검표 양식.hwp', category: '양식', size: '48 KB', content: '' },
  { title: '위험성평가 실시 지침.pdf', category: '지침', size: '1.2 MB', content: '' },
  { title: '교육 이수증 예시.jpg', category: '증빙', size: '320 KB', content: '' },
]

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function Resources() {
  const [docs, setDocs] = useState<ResourceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [catFilter, setCatFilter] = useState<Category | ''>('')
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)

  // 등록 폼 상태
  const [fTitle, setFTitle] = useState('')
  const [fCat, setFCat] = useState<Category>('양식')
  const [fFile, setFFile] = useState<File | null>(null)
  const [formErr, setFormErr] = useState('')
  const [busy, setBusy] = useState(false)

  // 시드는 진짜로 비었을 때 딱 한 번만
  const seededRef = useRef(false)

  const refetch = useCallback(() => {
    setLoading(true)
    setError('')
    api<ResourceItem[]>('/resources')
      .then((d) => { setDocs(d); setLoading(false) })
      .catch((e) => { setError(e instanceof Error ? e.message : '오류'); setLoading(false) })
  }, [])

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    ;(async () => {
      try {
        let list = await api<ResourceItem[]>('/resources')
        if (list.length === 0 && !seededRef.current) {
          seededRef.current = true
          for (const s of SEED) {
            await api<ResourceItem>('/resources', { method: 'POST', body: JSON.stringify(s) })
          }
          list = await api<ResourceItem[]>('/resources')
        }
        if (!alive) return
        setDocs(list)
        setLoading(false)
      } catch (e) {
        if (alive) { setError(e instanceof Error ? e.message : '오류'); setLoading(false) }
      }
    })()
    return () => { alive = false }
  }, [])

  const view = docs.filter((d) => {
    const byCat = catFilter === '' || d.category === catFilter
    const q = search.trim().toLowerCase()
    const bySearch = q === '' || d.title.toLowerCase().includes(q)
    return byCat && bySearch
  })

  function closeModal() {
    setOpen(false)
    setFTitle('')
    setFCat('양식')
    setFFile(null)
    setFormErr('')
  }

  function submit() {
    if (busy) return
    if (!fFile) {
      setFormErr('파일을 선택하세요.')
      return
    }
    const file = fFile
    setBusy(true)
    setFormErr('')
    const payloadBase = {
      title: fTitle.trim() || file.name,
      category: fCat,
      size: humanSize(file.size),
    }

    const post = async (content: string) => {
      try {
        await api<ResourceItem>('/resources', {
          method: 'POST',
          body: JSON.stringify({ ...payloadBase, content } satisfies ResourceCreate),
        })
        closeModal()
        refetch()
      } catch (e) {
        setFormErr(e instanceof Error ? e.message : '등록 실패')
      } finally {
        setBusy(false)
      }
    }

    if (file.size <= 800 * 1024) {
      const reader = new FileReader()
      reader.onload = () => {
        void post(typeof reader.result === 'string' ? reader.result : '')
      }
      reader.onerror = () => { setFormErr('파일을 읽을 수 없습니다.'); setBusy(false) }
      reader.readAsDataURL(file)
    } else {
      void post('')
    }
  }

  async function download(item: ResourceItem) {
    let full: ResourceFull
    try {
      full = await api<ResourceFull>(`/resources/${item.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : '다운로드 실패')
      return
    }
    const a = document.createElement('a')
    let url: string
    if (full.content) {
      url = full.content
      a.download = full.title
    } else {
      const blob = new Blob([`${full.title}\n(자료실 데모 문서)`], { type: 'text/plain' })
      url = URL.createObjectURL(blob)
      a.download = `${full.title}.txt`
    }
    a.href = url
    document.body.appendChild(a)
    a.click()
    a.remove()
    if (!full.content) URL.revokeObjectURL(url)
  }

  async function remove(id: string) {
    if (!window.confirm('이 문서를 삭제하시겠습니까?')) return
    try {
      await api<{ ok: boolean }>(`/resources/${id}`, { method: 'DELETE' })
      refetch()
    } catch (e) {
      setError(e instanceof Error ? e.message : '삭제 실패')
    }
  }

  const iconBtn = { height: 34, width: 34, padding: 0, justifyContent: 'center' } as const

  return (
    <div className="page rv">
      <div className="breadcrumb"><Link to="/">홈</Link> / <b>자료실</b></div>
      <div className="bar">
        <h2><FolderOpen size={20} /> 자료실</h2>
        <div className="sp" />
        <button className="btn btn-primary" onClick={() => setOpen(true)}>
          <Plus size={16} /> 문서 등록
        </button>
      </div>

      <div className="ledger">
        <div className="lh">
          <h2><FileText size={18} /> 문서 목록</h2>
          <div className="sp" />
          <div className="lbar">
            <div className="lsearch">
              <Search size={15} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="제목 검색"
              />
            </div>
            <select
              className="lselect"
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value as Category | '')}
            >
              <option value="">분류 전체</option>
              {CATS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="twrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>제목</th>
                <th>분류</th>
                <th>크기</th>
                <th>등록일</th>
                <th style={{ textAlign: 'right' }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {!loading && !error && view.map((d) => (
                <tr key={d.id} style={{ cursor: 'default' }}>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
                      <FileText size={16} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                      <b>{d.title}</b>
                    </span>
                  </td>
                  <td><span className={`pillx ${PILL[d.category]}`}>{d.category}</span></td>
                  <td>{d.size}</td>
                  <td>{d.date}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button
                        className="btn btn-ghost"
                        style={iconBtn}
                        onClick={() => download(d)}
                        aria-label="다운로드"
                        title="다운로드"
                      >
                        <Download size={15} />
                      </button>
                      <button
                        className="btn btn-ghost"
                        style={{ ...iconBtn, color: 'var(--red-ink)' }}
                        onClick={() => remove(d.id)}
                        aria-label="삭제"
                        title="삭제"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && !error && view.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <div className="tstate">
                      {docs.length === 0
                        ? "등록된 문서가 없습니다. '문서 등록'으로 추가하세요."
                        : '조건에 맞는 문서가 없습니다.'}
                    </div>
                  </td>
                </tr>
              )}
              {loading && <tr><td colSpan={5}><div className="tstate">불러오는 중…</div></td></tr>}
              {error && <tr><td colSpan={5}><div className="tstate">오류: {error}</div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {open && (
        <Modal
          title="문서 등록"
          onClose={() => { if (!busy) closeModal() }}
          footer={
            <>
              <button className="btn btn-ghost" disabled={busy} onClick={closeModal}>취소</button>
              <button className="btn btn-primary" disabled={busy} onClick={submit}>
                <Plus size={16} /> {busy ? '등록 중…' : '등록'}
              </button>
            </>
          }
        >
          {formErr && <div className="login-err" style={{ marginBottom: 14 }}>{formErr}</div>}
          <div className="formrow">
            <label className="field" style={{ minWidth: 220, flex: 1 }}>
              <span>제목</span>
              <input
                className="input"
                value={fTitle}
                onChange={(e) => setFTitle(e.target.value)}
                placeholder="비워두면 파일명 사용"
              />
            </label>
            <label className="field">
              <span>분류</span>
              <select className="select" value={fCat} onChange={(e) => setFCat(e.target.value as Category)}>
                {CATS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="field" style={{ marginTop: 14 }}>
            <span>파일 선택 *</span>
            <input
              type="file"
              onChange={(e) => setFFile(e.target.files?.[0] ?? null)}
              style={{ fontSize: 13, padding: '4px 0' }}
            />
          </label>
          <p style={{ marginTop: 12, fontSize: 12, color: 'var(--muted)' }}>
            800KB 이하 파일은 원본이 저장되어 그대로 다운로드됩니다. 그 이상은 데모용 문서로 대체됩니다.
          </p>
        </Modal>
      )}
    </div>
  )
}
