// 산업재해 관리 — 0709 발주처 회의 결정 반영.
// 사고성/질병성 구분 등록 → 버튼 한 번으로 수시 위험성평가(/risk) 또는
// 수시 근골격계 유해요인조사(/musculo) 연동 생성. 산재조사표는 업로드(파일명 메타)+직접입력 병행.
// 이 페이지는 본사 관리자용 → 학교 실명 기본 표시, 익명 표시명(school_masked)은 보조 표기.
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ClipboardCheck,
  ExternalLink,
  FileText,
  Link2,
  Paperclip,
  Plus,
  Upload,
  X,
} from 'lucide-react'
import { api } from '../lib/api'
import { Modal } from '../components/Modal'
import { useTableQuery, type FilterDef } from '../lib/useTableQuery'
import { ExportButton, FilterBar, Pagination, SortableTh, type ExportColumn } from '../components/table'
import '../styles/accidents.css'

type Kind = 'accident' | 'disease'
type School = { id: string; name: string }
type AccFile = { name: string }
type Accident = {
  id: string
  school_id: string
  school_name: string
  school_masked: string
  kind: Kind
  date: string
  summary: string
  detail: string
  status: string
  files: AccFile[]
  links: { risk_id?: string; musculo_id?: string }
  created_at: string
}

const KIND_LABEL: Record<Kind, string> = { accident: '사고성', disease: '질병성' }
// 구분 선택 시 후속 조치 안내문구
const KIND_GUIDE: Record<Kind, string> = {
  accident: '사고성 재해는 수시 위험성평가 대상입니다. 등록 후 버튼 한 번으로 생성할 수 있습니다.',
  disease: '질병성(근골격계 질환) 재해는 수시 근골격계 부담작업 유해요인조사 대상입니다. 등록 후 버튼 한 번으로 생성할 수 있습니다.',
}
const TARGET_LABEL: Record<Kind, string> = {
  accident: '수시 위험성평가',
  disease: '수시 근골격계 유해요인조사',
}
const TARGET_PATH: Record<Kind, string> = { accident: '/risk', disease: '/musculo' }
// 첨부 종류(백엔드는 파일명 메타만 저장 — 종류는 안내용)
const FILE_SLOTS = ['산재조사표', '재발방지대책', '교육자료'] as const

function isLinked(a: Accident): boolean {
  return !!(a.links?.risk_id || a.links?.musculo_id)
}

// useTableQuery 접근자 — 렌더 간 안정적이어야 하므로 모듈 상수
const ACC_SEARCH = [
  (r: Accident) => r.school_name,
  (r: Accident) => r.school_masked,
  (r: Accident) => r.summary,
]
const ACC_FILTERS: FilterDef<Accident>[] = [
  {
    key: 'kind',
    label: '구분',
    options: [
      { value: 'accident', label: '사고성' },
      { value: 'disease', label: '질병성' },
    ],
    accessor: (r) => r.kind,
  },
  {
    key: 'linked',
    label: '연동',
    options: [
      { value: 'y', label: '연동 완료' },
      { value: 'n', label: '미연동' },
    ],
    accessor: (r) => (isLinked(r) ? 'y' : 'n'),
  },
]
const ACC_DATE = (r: Accident) => r.created_at
const ACC_SORTS = {
  date: (r: Accident) => r.date || '',
  school: (r: Accident) => r.school_name || '',
  kind: (r: Accident) => r.kind,
}
const ACC_EXPORT: ExportColumn<Accident>[] = [
  { header: '발생일', value: (r) => r.date || '' },
  { header: '학교', value: (r) => r.school_name || '' },
  { header: '익명표시', value: (r) => r.school_masked || '' },
  { header: '구분', value: (r) => KIND_LABEL[r.kind] ?? r.kind },
  { header: '개요', value: (r) => r.summary || '' },
  { header: '연동상태', value: (r) => (r.links?.risk_id ? '수시 위험성평가' : r.links?.musculo_id ? '수시 근골격계 조사' : '미연동') },
  { header: '첨부', value: (r) => (r.files?.length ?? 0) },
  { header: '작성일', value: (r) => (r.created_at || '').slice(0, 10) },
]

// ── 등록 폼 모달 ─────────────────────────────────────────────
function AccRegisterModal({
  schools, onClose, onSaved,
}: {
  schools: School[]
  onClose: () => void
  onSaved: (created: Accident | null) => void
}) {
  const [schoolId, setSchoolId] = useState(schools[0]?.id ?? '')
  const [kind, setKind] = useState<Kind>('accident')
  const [date, setDate] = useState('')
  const [summary, setSummary] = useState('')
  const [detail, setDetail] = useState('')
  const [files, setFiles] = useState<AccFile[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function addFiles(list: FileList | null) {
    if (!list) return
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name))
      const next = [...prev]
      for (const f of Array.from(list)) {
        if (!names.has(f.name)) {
          next.push({ name: f.name })
          names.add(f.name)
        }
      }
      return next
    })
  }

  async function save() {
    if (!schoolId) { setError('학교를 선택하세요.'); return }
    if (!date) { setError('발생일을 입력하세요.'); return }
    if (!summary.trim()) { setError('개요를 입력하세요.'); return }
    setBusy(true)
    setError('')
    try {
      const res = await api<Accident>('/accidents', {
        method: 'POST',
        body: JSON.stringify({
          school_id: schoolId,
          kind,
          date,
          summary: summary.trim(),
          detail: detail.trim() || undefined,
          files: files.length ? files : undefined,
        }),
      })
      onSaved(res && typeof res === 'object' && res.id ? res : null)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : '등록에 실패했습니다.')
      setBusy(false)
    }
  }

  return (
    <Modal
      title="산업재해 등록"
      onClose={onClose}
      wide
      footer={(
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>취소</button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? '등록 중…' : '등록'}
          </button>
        </>
      )}
    >
      {error && <div className="login-err">{error}</div>}

      <label className="field">
        <span>학교</span>
        <select className="select" value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
          {schools.length === 0 && <option value="">학교 없음</option>}
          {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>

      <div className="field">
        <span>구분</span>
        <div className="acc-radio">
          {(['accident', 'disease'] as Kind[]).map((k) => (
            <label key={k} className={'acc-radio-opt' + (kind === k ? ' active' : '')}>
              <input
                type="radio"
                name="acc-kind"
                checked={kind === k}
                onChange={() => setKind(k)}
              />
              <b>{KIND_LABEL[k]}</b>
              <small>{k === 'accident' ? '넘어짐·끼임·화상 등 사고' : '근골격계 질환 등 질병'}</small>
            </label>
          ))}
        </div>
        <div className={'acc-guide acc-guide-' + kind}>{KIND_GUIDE[kind]}</div>
      </div>

      <label className="field">
        <span>발생일</span>
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </label>

      <label className="field">
        <span>개요</span>
        <input
          className="input"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="예: 급식실 조리 중 화상"
        />
      </label>

      <label className="field">
        <span>상세 (산재조사표 직접입력)</span>
        <textarea
          className="input"
          rows={5}
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          placeholder="학교 담당자가 작성한 산재조사표가 부실한 경우 여기에 직접 재작성합니다. (발생 경위·원인·조치 등)"
        />
      </label>

      <div className="field">
        <span>파일 첨부 (파일명만 저장)</span>
        <div className="acc-addrow">
          {FILE_SLOTS.map((slot) => (
            <label key={slot} className="acc-addfile">
              <Upload size={14} /> {slot}
              <input
                type="file"
                multiple
                onChange={(e) => { addFiles(e.target.files); e.target.value = '' }}
              />
            </label>
          ))}
        </div>
        {files.length > 0 && (
          <ul className="acc-files">
            {files.map((f) => (
              <li key={f.name} className="acc-filerow">
                <FileText size={14} />
                <span className="acc-filename">{f.name}</span>
                <button
                  type="button"
                  className="acc-file-x"
                  aria-label="첨부 제거"
                  onClick={() => setFiles((prev) => prev.filter((x) => x.name !== f.name))}
                >
                  <X size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}

// ── 연동 상태 셀 (뱃지 or 생성 버튼) ─────────────────────────
function LinkState({
  a, busy, onGenerate,
}: {
  a: Accident
  busy: boolean
  onGenerate: (a: Accident) => void
}) {
  if (a.links?.risk_id) {
    return (
      <Link to="/risk" className="acc-link acc-link-risk" onClick={(e) => e.stopPropagation()}>
        <ClipboardCheck size={13} /> 수시 위평
      </Link>
    )
  }
  if (a.links?.musculo_id) {
    return (
      <Link to="/musculo" className="acc-link acc-link-mus" onClick={(e) => e.stopPropagation()}>
        <Activity size={13} /> 수시 근골
      </Link>
    )
  }
  return (
    <button
      className="acc-genbtn"
      disabled={busy}
      title={TARGET_LABEL[a.kind] + ' 생성'}
      onClick={(e) => { e.stopPropagation(); onGenerate(a) }}
    >
      <Link2 size={13} /> {busy ? '생성 중…' : '생성'}
    </button>
  )
}

// ── 페이지 ───────────────────────────────────────────────────
export function Accidents() {
  const [accidents, setAccidents] = useState<Accident[]>([])
  const [schools, setSchools] = useState<School[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [detail, setDetail] = useState<Accident | null>(null)
  const [banner, setBanner] = useState<Accident | null>(null) // 등록/연동 직후 안내
  const [genBusy, setGenBusy] = useState('') // 생성 중인 accident id
  const [genErr, setGenErr] = useState('')

  const q = useTableQuery(accidents, {
    searchFields: ACC_SEARCH,
    filters: ACC_FILTERS,
    dateField: ACC_DATE,
    sortAccessors: ACC_SORTS,
    initialSort: { key: 'date', dir: 'desc' },
    searchPlaceholder: '학교·개요 검색',
  })

  // 산재 목록 로드 (백엔드 미가동 시 빈 상태)
  useEffect(() => {
    let alive = true
    setLoading(true)
    api<Accident[]>('/accidents')
      .then((d) => { if (alive) { setAccidents(Array.isArray(d) ? d : []); setError(''); setLoading(false) } })
      .catch((e) => {
        if (alive) { setAccidents([]); setError(e instanceof Error ? e.message : '오류'); setLoading(false) }
      })
    return () => { alive = false }
  }, [reload])

  // 등록 폼용 학교 목록
  useEffect(() => {
    let alive = true
    api<School[]>('/schools')
      .then((s) => { if (alive) setSchools(Array.isArray(s) ? s : []) })
      .catch(() => { if (alive) setSchools([]) })
    return () => { alive = false }
  }, [])

  // KPI — 올해 / 사고성 / 질병성 / 연동 완료
  const kpi = useMemo(() => {
    const year = String(new Date().getFullYear())
    const thisYear = accidents.filter((a) => (a.date || '').startsWith(year))
    return {
      year,
      total: thisYear.length,
      accident: thisYear.filter((a) => a.kind === 'accident').length,
      disease: thisYear.filter((a) => a.kind === 'disease').length,
      linked: accidents.filter(isLinked).length,
    }
  }, [accidents])

  // 수시 위험성평가/근골 조사 연동 생성
  async function generate(a: Accident) {
    const target = a.kind === 'accident' ? 'risk' : 'musculo'
    setGenBusy(a.id)
    setGenErr('')
    try {
      const res = await api<Accident>(`/accidents/${a.id}/generate`, {
        method: 'POST',
        body: JSON.stringify({ target }),
      })
      if (res && typeof res === 'object' && res.id) {
        setAccidents((prev) => prev.map((x) => (x.id === res.id ? res : x)))
        setBanner((b) => (b && b.id === res.id ? res : b))
        setDetail((d) => (d && d.id === res.id ? res : d))
      } else {
        setReload((n) => n + 1) // 응답 형식이 다르면 재조회로 동기화
      }
    } catch (e) {
      setGenErr(e instanceof Error ? e.message : '연동 생성 실패')
    } finally {
      setGenBusy('')
    }
  }

  function onSaved(created: Accident | null) {
    setReload((n) => n + 1)
    if (created) setBanner(created)
  }

  // ── 외부 산재 데이터 연동(공공데이터 API + CSV 일괄 인입) ──
  type FeedSettings = { endpoint: string; items_path: string; map: Record<string, string>; has_service_key: boolean }
  type ImportResult = { created: number; duplicates: number; unmatched: string[]; fetched?: number }
  const [feedOpen, setFeedOpen] = useState(false)
  const [feed, setFeed] = useState<FeedSettings | null>(null)
  const [feedKey, setFeedKey] = useState('')
  const [feedBusy, setFeedBusy] = useState('')
  const [feedMsg, setFeedMsg] = useState<{ ok: boolean; text: string } | null>(null)

  function openFeed() {
    setFeedOpen(true)
    setFeedMsg(null)
    setFeedKey('')
    api<{ settings: FeedSettings }>('/accidents/feed-settings')
      .then((d) => setFeed(d.settings))
      .catch(() => setFeed(null))
  }

  async function saveFeed() {
    if (!feed) return
    setFeedBusy('save')
    setFeedMsg(null)
    try {
      const d = await api<{ settings: FeedSettings }>('/accidents/feed-settings', {
        method: 'PUT',
        body: JSON.stringify({ settings: { endpoint: feed.endpoint, items_path: feed.items_path, service_key: feedKey } }),
      })
      setFeed(d.settings)
      setFeedKey('')
      setFeedMsg({ ok: true, text: '연동 설정을 저장했습니다.' })
    } catch (e) {
      setFeedMsg({ ok: false, text: e instanceof Error ? e.message : '저장 실패' })
    } finally {
      setFeedBusy('')
    }
  }

  function fmtImport(r: ImportResult): string {
    const parts = [
      r.fetched != null ? `조회 ${r.fetched}건` : null,
      `신규 ${r.created}건`, `중복 제외 ${r.duplicates}건`,
      r.unmatched.length ? `학교 미매칭 ${r.unmatched.length}건(${r.unmatched.slice(0, 3).join(', ')}${r.unmatched.length > 3 ? '…' : ''})` : null,
    ]
    return parts.filter(Boolean).join(' · ')
  }

  async function syncFeed() {
    setFeedBusy('sync')
    setFeedMsg(null)
    try {
      const r = await api<ImportResult>('/accidents/feed-sync', { method: 'POST' })
      setFeedMsg({ ok: true, text: fmtImport(r) })
      if (r.created > 0) setReload((n) => n + 1)
    } catch (e) {
      setFeedMsg({ ok: false, text: e instanceof Error ? e.message : '동기화 실패' })
    } finally {
      setFeedBusy('')
    }
  }

  // CSV 일괄 인입: 학교명,발생일,구분(사고/질병),재해개요[,접수번호]
  async function importCsv(files: FileList | null) {
    const f = files?.[0]
    if (!f) return
    setFeedBusy('csv')
    setFeedMsg(null)
    try {
      const rows = (await f.text())
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
          const [school = '', date = '', kind = '', summary = '', ref = ''] = l.split(',')
          return {
            school: school.trim(), date: date.trim(),
            kind: kind.includes('질병') || kind.includes('근골') ? 'disease' : kind.includes('사고') ? 'accident' : '',
            summary: summary.trim(), ref: ref.trim(),
          }
        })
        .filter((r) => r.school && !/^(학교|사업장)/.test(r.school))
      if (!rows.length) { setFeedMsg({ ok: false, text: 'CSV에서 행을 찾지 못했습니다. 형식: 학교명,발생일,구분,재해개요[,접수번호]' }); return }
      const r = await api<ImportResult>('/accidents/import', {
        method: 'POST', body: JSON.stringify({ rows }),
      })
      setFeedMsg({ ok: true, text: fmtImport(r) })
      if (r.created > 0) setReload((n) => n + 1)
    } catch (e) {
      setFeedMsg({ ok: false, text: e instanceof Error ? e.message : 'CSV 인입 실패' })
    } finally {
      setFeedBusy('')
    }
  }

  return (
    <div className="page">
      <div className="breadcrumb"><Link to="/">홈</Link> / <b>산업재해</b></div>
      <div className="bar">
        <h2><AlertTriangle size={20} /> 산업재해 관리</h2>
        <div className="sp" />
        <button className="btn btn-ghost" onClick={openFeed}>
          <ExternalLink size={14} /> 외부 데이터 연동
        </button>
        <button className="btn btn-primary" onClick={() => setFormOpen(true)}>
          <Plus size={15} /> 산재 등록
        </button>
      </div>

      {/* 등록/연동 직후 안내 배너 */}
      {banner && (
        <div className={'acc-banner' + (isLinked(banner) ? ' done' : '')}>
          <div className="acc-banner-txt">
            {isLinked(banner) ? (
              <>
                <b>{banner.school_name}</b> {KIND_LABEL[banner.kind]} 재해의 <b>{TARGET_LABEL[banner.kind]}</b>가 생성되었습니다.
                {' '}
                <Link to={TARGET_PATH[banner.kind]} className="acc-banner-go">
                  {banner.kind === 'accident' ? '위험성평가로 이동' : '근골격계 조사로 이동'} <ArrowRight size={13} />
                </Link>
              </>
            ) : (
              <>
                <b>{banner.school_name}</b> {KIND_LABEL[banner.kind]} 재해가 등록되었습니다.
                {' '}<b>{TARGET_LABEL[banner.kind]}</b>를 생성하세요.
              </>
            )}
          </div>
          {!isLinked(banner) && (
            <button
              className="btn btn-primary"
              disabled={genBusy === banner.id}
              onClick={() => generate(banner)}
            >
              <Link2 size={15} /> {genBusy === banner.id ? '생성 중…' : TARGET_LABEL[banner.kind] + ' 생성'}
            </button>
          )}
          <button className="acc-banner-x" aria-label="배너 닫기" onClick={() => setBanner(null)}>
            <X size={15} />
          </button>
        </div>
      )}

      {genErr && (
        <div className="ledger"><div className="tstate">연동 생성 오류: {genErr}</div></div>
      )}

      {/* KPI */}
      <div className="kpis">
        <div className="kpi">
          <div className="l">{kpi.year}년 산재 건수</div>
          <div className="v">{kpi.total}<small>건</small></div>
        </div>
        <div className="kpi red">
          <div className="l">사고성</div>
          <div className="v">{kpi.accident}<small>건</small></div>
          <div className="d">수시 위험성평가 대상</div>
        </div>
        <div className="kpi warn">
          <div className="l">질병성</div>
          <div className="v">{kpi.disease}<small>건</small></div>
          <div className="d">수시 근골격계 조사 대상</div>
        </div>
        <div className="kpi">
          <div className="l">연동 완료</div>
          <div className="v">{kpi.linked}<small>건</small></div>
          <div className="d">수시평가·조사 생성됨</div>
        </div>
      </div>

      {/* 목록 */}
      <div className="ledger">
        <div className="lh">
          <h2><AlertTriangle size={19} /> 산재 내역</h2>
          <div className="sp" />
          <FilterBar q={q} />
          <ExportButton q={q} columns={ACC_EXPORT} filename="산업재해" />
        </div>
        <div className="twrap">
          <table className="tbl">
            <thead>
              <tr>
                <SortableTh q={q} col="date">발생일</SortableTh>
                <SortableTh q={q} col="school">학교</SortableTh>
                <SortableTh q={q} col="kind" className="c">구분</SortableTh>
                <th>개요</th>
                <th className="c">연동상태</th>
                <th className="c">첨부</th>
              </tr>
            </thead>
            <tbody>
              {q.view.map((a) => (
                <tr key={a.id} onClick={() => setDetail(a)} style={{ cursor: 'pointer' }}>
                  <td>{a.date || '—'}</td>
                  <td>
                    <div className="acc-school">
                      <b>{a.school_name || '—'}</b>
                      {a.school_masked && <span className="acc-masked">{a.school_masked}</span>}
                    </div>
                  </td>
                  <td className="c">
                    <span className={'acc-kind acc-kind-' + a.kind}>{KIND_LABEL[a.kind] ?? a.kind}</span>
                  </td>
                  <td><span className="acc-sum">{a.summary || '—'}</span></td>
                  <td className="c">
                    <LinkState a={a} busy={genBusy === a.id} onGenerate={generate} />
                  </td>
                  <td className="c">
                    {a.files?.length
                      ? <span className="acc-attach"><Paperclip size={13} /> {a.files.length}</span>
                      : '—'}
                  </td>
                </tr>
              ))}
              {loading && (
                <tr><td colSpan={6}><div className="tstate">불러오는 중…</div></td></tr>
              )}
              {!loading && q.view.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="tstate">
                      {error
                        ? `산재 내역을 불러오지 못했습니다. (${error})`
                        : accidents.length === 0
                          ? '등록된 산재가 없습니다. 우측 상단에서 등록하세요.'
                          : '조건에 맞는 산재가 없습니다.'}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination q={q} />
      </div>

      <div className="muted" style={{ marginTop: 16, fontSize: 12.5, lineHeight: 1.7 }}>
        사고성 재해는 수시 위험성평가, 질병성(근골격계) 재해는 수시 유해요인조사와 연동됩니다.
        홈 등 공용 화면에는 학교명이 익명(예: OOO초등학교)으로 표시됩니다.
      </div>

      {/* 상세 드릴다운 모달 */}
      {detail && (
        <Modal title="산재 상세" onClose={() => setDetail(null)} wide>
          <div className="kv">
            <b>구분</b>
            <span><span className={'acc-kind acc-kind-' + detail.kind}>{KIND_LABEL[detail.kind] ?? detail.kind}</span></span>
          </div>
          <div className="kv"><b>발생일</b><span>{detail.date || '—'}</span></div>
          <div className="kv">
            <b>학교</b>
            <span>
              <Link to={`/schools/${detail.school_id}`} className="acc-school-go" onClick={() => setDetail(null)}>
                {detail.school_name || '—'} <ExternalLink size={12} />
              </Link>
              {detail.school_masked && <span className="acc-masked">공용 표시: {detail.school_masked}</span>}
            </span>
          </div>
          {detail.status && (
            <div className="kv"><b>상태</b><span><span className="pillx na">{detail.status}</span></span></div>
          )}
          <div className="kv"><b>개요</b><span>{detail.summary || '—'}</span></div>
          <div className="kv"><b>작성일</b><span>{(detail.created_at || '').slice(0, 10) || '—'}</span></div>

          <div className="acc-detail-sec">산재조사표 (상세)</div>
          <div className="acc-detail-body">
            {detail.detail ? detail.detail : <span className="muted">직접입력된 내용이 없습니다.</span>}
          </div>

          <div className="acc-detail-sec">첨부파일</div>
          {detail.files?.length ? (
            <ul className="acc-files">
              {detail.files.map((f, i) => (
                <li key={f.name + i} className="acc-filerow">
                  <FileText size={14} /><span className="acc-filename">{f.name}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="muted" style={{ fontSize: 12.5 }}>첨부된 파일이 없습니다.</div>
          )}

          <div className="acc-detail-sec">연동 이력</div>
          {isLinked(detail) ? (
            <div className="acc-detail-links">
              {detail.links?.risk_id && (
                <Link to="/risk" className="acc-link acc-link-risk" onClick={() => setDetail(null)}>
                  <ClipboardCheck size={13} /> 수시 위험성평가 생성됨 <ArrowRight size={12} />
                </Link>
              )}
              {detail.links?.musculo_id && (
                <Link to="/musculo" className="acc-link acc-link-mus" onClick={() => setDetail(null)}>
                  <Activity size={13} /> 수시 근골격계 조사 생성됨 <ArrowRight size={12} />
                </Link>
              )}
            </div>
          ) : (
            <div className="acc-detail-gen">
              <span className={'acc-guide acc-guide-' + detail.kind}>{KIND_GUIDE[detail.kind]}</span>
              <button
                className="btn btn-primary"
                disabled={genBusy === detail.id}
                onClick={() => generate(detail)}
              >
                <Link2 size={15} /> {genBusy === detail.id ? '생성 중…' : TARGET_LABEL[detail.kind] + ' 생성'}
              </button>
            </div>
          )}
        </Modal>
      )}

      {/* 등록 폼 모달 */}
      {formOpen && (
        <AccRegisterModal
          schools={schools}
          onClose={() => setFormOpen(false)}
          onSaved={onSaved}
        />
      )}

      {/* ── 외부 산재 데이터 연동 모달 ── */}
      {feedOpen && (
        <Modal
          title="외부 산재 데이터 연동"
          onClose={() => { if (!feedBusy) setFeedOpen(false) }}
          footer={<button className="btn btn-primary" onClick={() => setFeedOpen(false)}>닫기</button>}
        >
          <b style={{ fontSize: 13 }}>공공데이터 API (근로복지공단·고용노동부)</b>
          {feed === null && <div className="tstate" style={{ marginTop: 8 }}>설정을 불러오는 중이거나 권한이 없습니다.</div>}
          {feed && (
            <>
              <div className="formrow" style={{ marginTop: 10 }}>
                <label className="field" style={{ flex: 1, minWidth: 260 }}>
                  <span>API 엔드포인트</span>
                  <input className="input" value={feed.endpoint} placeholder="https://apis.data.go.kr/…"
                    onChange={(e) => setFeed({ ...feed, endpoint: e.target.value })} />
                </label>
                <label className="field" style={{ minWidth: 180 }}>
                  <span>서비스 키 {feed.has_service_key && <span className="muted" style={{ fontWeight: 500 }}>(저장됨)</span>}</span>
                  <input className="input" type="password" value={feedKey} autoComplete="new-password"
                    placeholder={feed.has_service_key ? '●●●●●●' : '공공데이터포털 인증키'}
                    onChange={(e) => setFeedKey(e.target.value)} />
                </label>
              </div>
              <div className="formrow" style={{ marginTop: 8 }}>
                <label className="field" style={{ flex: 1 }}>
                  <span>응답 items 경로 <span className="muted" style={{ fontWeight: 500 }}>(공공데이터포털 표준)</span></span>
                  <input className="input" value={feed.items_path}
                    onChange={(e) => setFeed({ ...feed, items_path: e.target.value })} />
                </label>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={() => void saveFeed()} disabled={feedBusy !== ''}>
                  {feedBusy === 'save' ? '저장 중…' : '설정 저장'}
                </button>
                <button className="btn btn-ghost" onClick={() => void syncFeed()} disabled={feedBusy !== '' || !feed.has_service_key}>
                  {feedBusy === 'sync' ? '동기화 중…' : '지금 동기화'}
                </button>
              </div>
            </>
          )}

          <div style={{ borderTop: '1px solid var(--line)', margin: '16px 0 12px' }} />
          <b style={{ fontSize: 13 }}>엑셀/CSV 일괄 인입 (공단 제공분·협회 정리분)</b>
          <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <label className="btn btn-ghost" htmlFor="acc-import-csv" style={{ cursor: 'pointer' }}>
              <Upload size={14} /> {feedBusy === 'csv' ? '인입 중…' : 'CSV 파일 선택'}
            </label>
            <input id="acc-import-csv" type="file" accept=".csv,text/csv" style={{ display: 'none' }}
              onChange={(e) => { void importCsv(e.target.files); e.target.value = '' }} />
            <span className="muted" style={{ fontSize: 11.5 }}>형식: 학교명,발생일,구분(사고/질병),재해개요[,접수번호]</span>
          </div>

          {feedMsg && (
            <div className="tstate" style={{ marginTop: 14, color: feedMsg.ok ? 'var(--ink-2)' : 'var(--red-ink)' }}>
              {feedMsg.ok ? '✓ ' : '✕ '}{feedMsg.text}
            </div>
          )}
          <div className="muted" style={{ marginTop: 12, fontSize: 11.5, lineHeight: 1.7 }}>
            학교(사업장)명이 등록 학교와 일치하거나 이름을 포함하면 자동 매칭되고, 접수번호 기준으로 중복이 걸러집니다(재실행 안전).
            질병/근골 키워드는 질병성으로 분류돼 수시 근골격계 조사 연동 대상이 됩니다.
            사업장별 산재 '건' 단위 공개 API는 없어(개인정보) 공단·고용노동부 API 활용 승인 또는 공단 제공 자료를 받으면 키만 넣어 연결하세요.
          </div>
        </Modal>
      )}
    </div>
  )
}
