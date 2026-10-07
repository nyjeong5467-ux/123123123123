import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FolderOpen, FileText, Download, Trash2, Plus, Search, Smartphone } from 'lucide-react'
import { api, getToken } from '../lib/api'
import { Modal } from '../components/Modal'
import { FilePicker } from '../components/FilePicker'

// 릴리스 서버(/release, 무인증 공개)의 배포 파일 — 자료실 '현장 앱' 섹션용(2026-10-08).
// display_name: APK 는 원본명_빌드일(yymmdd).apk — 받는 파일명도 서버가 같은 이름으로 내려준다.
type ReleaseFile = { name: string; display_name?: string; size: number; modified: string; url: string }

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

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// embedded: 경영 콘솔(홈페이지·콘텐츠 탭) 임베드용 — 페이지 헤더만 숨기고 본문(등록 버튼 포함) 동일.
export function Resources({ embedded = false }: { embedded?: boolean } = {}) {
  const [docs, setDocs] = useState<ResourceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [catFilter, setCatFilter] = useState<Category | ''>('')
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  // 현장 앱(APK) — 릴리스 서버 목록 중 .apk 만(홈 카드에서 자료실로 이동, 2026-10-08)
  const [apks, setApks] = useState<ReleaseFile[]>([])
  useEffect(() => {
    let alive = true
    api<ReleaseFile[]>('/release')
      .then((files) => {
        if (alive) setApks((files || []).filter((f) => f.name.toLowerCase().endsWith('.apk')))
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  // 등록 폼 상태
  const [fTitle, setFTitle] = useState('')
  const [fCat, setFCat] = useState<Category>('양식')
  const [fFile, setFFile] = useState<File | null>(null)
  const [formErr, setFormErr] = useState('')
  const [busy, setBusy] = useState(false)

  const refetch = useCallback(() => {
    setLoading(true)
    setError('')
    api<ResourceItem[]>('/resources')
      .then((d) => { setDocs(d); setLoading(false) })
      .catch((e) => { setError(e instanceof Error ? e.message : '오류'); setLoading(false) })
  }, [])

  useEffect(() => { refetch() }, [refetch])

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
    // 디스크 저장 파일(인증 필요): content 가 /api/v1/files/... 경로면 토큰으로 받아 blob 다운로드
    if (full.content && full.content.startsWith('/api/v1/files/')) {
      try {
        const res = await fetch(full.content, { headers: { Authorization: `Bearer ${getToken()}` } })
        if (!res.ok) throw new Error(String(res.status))
        const blob = await res.blob()
        const u = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = u
        a.download = full.title
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(u)
      } catch (e) {
        setError('다운로드 실패: ' + (e instanceof Error ? e.message : ''))
      }
      return
    }
    // base64 dataURL(소용량 업로드) 또는 데모 폴백
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
    <div className={embedded ? '' : 'page rv'}>
      {!embedded && <div className="breadcrumb"><Link to="/">홈</Link> / <b>자료실</b></div>}
      <div className="bar">
        {!embedded && <h2><FolderOpen size={20} /> 자료실</h2>}
        <div className="sp" />
        <button className="btn btn-primary" onClick={() => setOpen(true)}>
          <Plus size={16} /> 문서 등록
        </button>
      </div>

      {/* ===== 현장 앱(APK) 다운로드 — 홈 카드에서 이동(2026-10-08) ===== */}
      <div className="ledger" style={{ marginBottom: 16 }}>
        <div className="lh">
          <h2><Smartphone size={18} /> 현장 앱 (안드로이드 APK)</h2>
        </div>
        <div className="twrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>파일명</th>
                <th>크기</th>
                <th>빌드(교체)일</th>
                <th style={{ textAlign: 'right' }}>다운로드</th>
              </tr>
            </thead>
            <tbody>
              {apks.map((f) => (
                <tr key={f.name} style={{ cursor: 'default' }}>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
                      <Smartphone size={16} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                      <b>{f.display_name || f.name}</b>
                    </span>
                  </td>
                  <td>{humanSize(f.size)}</td>
                  <td>{f.modified.slice(0, 16).replace('T', ' ')}</td>
                  <td>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <a className="btn btn-primary" style={{ height: 34, display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
                        href={f.url} download>
                        <Download size={15} /> APK 받기
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
              {apks.length === 0 && (
                <tr><td colSpan={4}><div className="tstate">등록된 앱 파일이 없습니다 — 관리자에게 문의하세요.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '10px 16px', fontSize: 12, color: 'var(--muted)' }}>
          조사원 태블릿·휴대폰에 설치하는 현장 점검 앱입니다. 설치 시 "출처를 알 수 없는 앱" 허용이
          필요할 수 있고, 이미 설치돼 있으면 덮어쓰기 설치로 업데이트됩니다. 파일명 끝 숫자는 빌드일(버전)입니다.
        </div>
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
            <FilePicker
              fileName={fFile?.name}
              onPick={(fl) => setFFile(fl?.[0] ?? null)}
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
