// 계정 관리(본사 관리자 전용) — 계정 목록·생성·역할/모듈 권한 부여·비밀번호 재설정.
// 모듈 권한: 비면 전체 허용, 지정하면 해당 모듈 메뉴만 사이드바에 표시(재로그인/새로고침 시 반영).
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Check, KeyRound, Pencil, Plus, ScrollText, Trash2, UserMinus, Users } from 'lucide-react'
import { api } from '../lib/api'
import { AFFILIATIONS, isAffiliation } from '../lib/affiliations'
import { Modal } from '../components/Modal'
import { InfoTip } from '../components/InfoTip'

type Account = {
  id: string
  login_id: string
  name: string
  role: string
  modules: string[]
}
// 직원 등록 정보 — 스키마 변경 없이 org_docs 'staff-registry'(로그인ID→정보)에 저장.
// 소속은 점검표/발행처 자동채움·교육청 계정(소속별) 선택의 기준이 된다.
type StaffInfo = { affiliation?: string; department?: string; phone?: string }

const ROLES: { value: string; label: string }[] = [
  { value: 'hq_admin', label: '본사 관리자' },
  { value: 'executive', label: '경영진' },
  { value: 'field_inspector', label: '현장 조사원' },
  { value: 'school_confirmer', label: '학교 확인자' },
]
const ROLE_LABEL = Object.fromEntries(ROLES.map((r) => [r.value, r.label]))
const ROLE_PILL: Record<string, string> = {
  hq_admin: 'doing', executive: 'warn', field_inspector: 'ok', school_confirmer: 'na',
}
// 본사 권한(계정의 소속·직급 편집·전체 조회 가능). 나머지 역할은 읽기 전용.
const HQ_ROLES = ['hq_admin', 'executive']
// 정렬용: 역할 그룹 우선순위(등록정보 없는 계정끼리는 역할 순으로 묶는다)
const ROLE_ORDER: Record<string, number> = {
  hq_admin: 0, executive: 1, field_inspector: 2, school_confirmer: 3,
}

// 부여 가능한 모듈 카탈로그(사이드바 메뉴 키와 동일)
const MODULES: { key: string; label: string; group: string }[] = [
  { key: 'inspection', label: '안전점검', group: '업무' },
  { key: 'risk', label: '위험성평가', group: '업무' },
  { key: 'musculo', label: '근골격계', group: '업무' },
  { key: 'education', label: '교육', group: '업무' },
  { key: 'compliance', label: '이행점검', group: '업무' },
  { key: 'accidents', label: '산업재해', group: '업무' },
  { key: 'ledger', label: '경영 대시보드', group: '본사' },
  { key: 'ops', label: '종합관리', group: '본사' },
  { key: 'billing', label: '세금계산서', group: '본사' },
  { key: 'resources', label: '자료실', group: '본사' },
  { key: 'sessions', label: '세션코드', group: '업무' },
]
const MODULE_LABEL = Object.fromEntries(MODULES.map((m) => [m.key, m.label]))

// embedded: 경영 콘솔(계정·권한 탭) 임베드용 — 페이지 헤더만 숨기고 본문(생성 버튼 포함) 동일.
export function Accounts({ embedded = false }: { embedded?: boolean } = {}) {
  const nav = useNavigate()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [staffReg, setStaffReg] = useState<Record<string, StaffInfo>>({}) // 직원 등록 정보(로그인ID→소속·부서·연락처)
  const [isHq, setIsHq] = useState(false) // 본사 권한이면 소속·직급 인라인 편집 허용(아니면 읽기 전용)

  // 신규 계정 모달
  const [createOpen, setCreateOpen] = useState(false)
  const [nLogin, setNLogin] = useState('')
  const [nName, setNName] = useState('')
  const [nPw, setNPw] = useState('')
  const [nRole, setNRole] = useState('field_inspector')
  const [nAff, setNAff] = useState('')
  const [nDept, setNDept] = useState('')
  const [nPhone, setNPhone] = useState('')
  const [nErr, setNErr] = useState('')

  // 계정 편집(아이디·이름·소속) 모달
  const [editTarget, setEditTarget] = useState<Account | null>(null)
  const [eLogin, setELogin] = useState('')
  const [eName, setEName] = useState('')
  const [eAff, setEAff] = useState('')
  const [eDept, setEDept] = useState('')
  const [ePhone, setEPhone] = useState('')
  const [eErr, setEErr] = useState('')

  // 소속·직급(부서)·연락처 인라인 편집 모달 — 계정 목록 「소속·직급/부서」 칸의 편집 버튼
  const [regTarget, setRegTarget] = useState<Account | null>(null)
  const [rAff, setRAff] = useState('')
  const [rDept, setRDept] = useState('')
  const [rPhone, setRPhone] = useState('')
  const [rErr, setRErr] = useState('')

  // 모듈 권한 편집 모달
  const [modTarget, setModTarget] = useState<Account | null>(null)
  const [modSel, setModSel] = useState<string[]>([])

  // 비밀번호 재설정 모달
  const [pwTarget, setPwTarget] = useState<Account | null>(null)
  const [pwNew, setPwNew] = useState('')
  const [pwErr, setPwErr] = useState('')

  // 계정 삭제 확인 모달
  const [delTarget, setDelTarget] = useState<Account | null>(null)
  const [delErr, setDelErr] = useState('')

  // 퇴사 처리(담당 이전 + 계정 삭제) 모달
  const [offOpen, setOffOpen] = useState(false)
  const [offFrom, setOffFrom] = useState('')      // 퇴사자 계정 id
  const [offTo, setOffTo] = useState('')          // 인수자 계정 id
  const [offDelete, setOffDelete] = useState(true)
  const [offCounts, setOffCounts] = useState<Record<string, number>>({}) // 담당자명 → 학교수
  const [offErr, setOffErr] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    api<Account[]>('/users')
      .then((d) => { if (alive) { setAccounts(Array.isArray(d) ? d : []); setLoading(false) } })
      .catch((e) => { if (alive) { setError(e instanceof Error ? e.message : '오류'); setLoading(false) } })
    api<{ doc: Record<string, StaffInfo> | null }>('/ops/docs/staff-registry')
      .then((d) => { if (alive) setStaffReg(d.doc || {}) }).catch(() => {})
    api<{ role?: string }>('/auth/me')
      .then((d) => { if (alive) setIsHq(HQ_ROLES.includes(d.role || '')) }).catch(() => {})
    return () => { alive = false }
  }, [reload])

  const stats = useMemo(() => ({
    total: accounts.length,
    hq: accounts.filter((a) => a.role === 'hq_admin' || a.role === 'executive').length,
    limited: accounts.filter((a) => a.modules.length > 0).length,
  }), [accounts])

  // 소속 태그 미지정 계정 — 태그가 없거나 목록 밖 값(구 자유입력 오타 등)이면 봇이 교육청 계정을 고르지 못한다.
  const untagged = useMemo(
    () => accounts.filter((a) => !isAffiliation(staffReg[a.login_id]?.affiliation)),
    [accounts, staffReg],
  )

  // 보기 좋은 결정적 정렬: 소속 등록된 실제 직원 먼저(소속→직급/부서→이름), 미등록 계정(admin·bot 등)은 뒤로(역할→ID).
  // 백엔드 반환 순서에 의존하지 않는다.
  const sortedAccounts = useMemo(() => {
    const col = new Intl.Collator('ko')
    const regOf = (a: Account) => staffReg[a.login_id] || {}
    const hasReg = (a: Account) => {
      const si = regOf(a)
      return !!(si.affiliation || si.department || si.phone)
    }
    return [...accounts].sort((a, b) => {
      const ra = hasReg(a), rb = hasReg(b)
      if (ra !== rb) return ra ? -1 : 1 // 등록된 직원을 위로
      if (!ra) {
        // 미등록 그룹: 역할 순 → 로그인ID
        const oa = ROLE_ORDER[a.role] ?? 9, ob = ROLE_ORDER[b.role] ?? 9
        if (oa !== ob) return oa - ob
        return col.compare(a.login_id, b.login_id)
      }
      // 등록 그룹: 소속 → 직급/부서 → 이름 → 로그인ID
      const sa = regOf(a), sb = regOf(b)
      const byAff = col.compare(sa.affiliation || '', sb.affiliation || '')
      if (byAff) return byAff
      const byDept = col.compare(sa.department || '', sb.department || '')
      if (byDept) return byDept
      const byName = col.compare(a.name || '', b.name || '')
      if (byName) return byName
      return col.compare(a.login_id, b.login_id)
    })
  }, [accounts, staffReg])

  // 직원 등록 정보 저장(org_docs) — 스키마 변경 없이 로그인ID 기준 병합 저장
  async function saveStaffReg(next: Record<string, StaffInfo>) {
    setStaffReg(next)
    try { await api('/ops/docs/staff-registry', { method: 'PUT', body: JSON.stringify({ doc: next }) }) } catch { /* 무시 — 세션 상태 유지 */ }
  }

  // 소속·직급 인라인 편집 열기 — 현재 등록값을 채워 넣는다(본사 권한만 진입).
  function openReg(a: Account) {
    if (!isHq) return
    setRErr('')
    const si = staffReg[a.login_id] || {}
    setRAff(si.affiliation || ''); setRDept(si.department || ''); setRPhone(si.phone || '')
    setRegTarget(a)
  }

  // 소속·직급 인라인 저장 — read-merge-write: 기존 doc에 해당 로그인ID만 병합(다른 항목 보존) 후 전체 PUT.
  async function saveReg() {
    if (!regTarget) return
    setRErr('')
    if (!isAffiliation(rAff)) { setRErr('소속 태그를 선택하세요.'); return }
    setBusy('reg')
    try {
      const next: Record<string, StaffInfo> = {
        ...staffReg,
        [regTarget.login_id]: { affiliation: rAff.trim(), department: rDept.trim(), phone: rPhone.trim() },
      }
      await api('/ops/docs/staff-registry', { method: 'PUT', body: JSON.stringify({ doc: next }) })
      setStaffReg(next)
      const who = regTarget.login_id
      setRegTarget(null)
      setReload((n) => n + 1) // 재조회 → 정렬 갱신
      setMsg({ ok: true, text: `${who} 소속·직급 정보를 저장했습니다.` })
    } catch (e) {
      setRErr(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setBusy('')
    }
  }

  async function changeRole(a: Account, role: string) {
    setBusy(a.id)
    setMsg(null)
    try {
      await api(`/users/${a.id}`, { method: 'PUT', body: JSON.stringify({ role }) })
      setReload((n) => n + 1)
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : '역할 변경 실패' })
    } finally {
      setBusy('')
    }
  }

  function openEdit(a: Account) {
    setEErr('')
    setELogin(a.login_id)
    setEName(a.name || '')
    const si = staffReg[a.login_id] || {}
    setEAff(si.affiliation || ''); setEDept(si.department || ''); setEPhone(si.phone || '')
    setEditTarget(a)
  }

  async function saveEdit() {
    if (!editTarget) return
    setEErr('')
    if (!eLogin.trim()) { setEErr('로그인 ID를 입력하세요.'); return }
    if (!isAffiliation(eAff)) { setEErr('소속 태그를 선택하세요.'); return }
    setBusy('edit')
    try {
      await api(`/users/${editTarget.id}`, {
        method: 'PUT',
        body: JSON.stringify({ login_id: eLogin.trim(), name: eName.trim() }),
      })
      // 직원 등록 정보 저장 — 로그인ID 변경 시 기존 키 이동
      const nextReg = { ...staffReg }
      if (editTarget.login_id !== eLogin.trim()) delete nextReg[editTarget.login_id]
      nextReg[eLogin.trim()] = { affiliation: eAff.trim(), department: eDept.trim(), phone: ePhone.trim() }
      await saveStaffReg(nextReg)
      setEditTarget(null)
      setReload((n) => n + 1)
      setMsg({ ok: true, text: '계정 정보(아이디·이름·소속)를 변경했습니다.' })
    } catch (e) {
      setEErr(e instanceof Error ? e.message : '변경 실패')
    } finally {
      setBusy('')
    }
  }

  async function createAccount() {
    setNErr('')
    if (!nLogin.trim()) { setNErr('로그인 ID를 입력하세요.'); return }
    if (!nPw) { setNErr('초기 비밀번호를 입력하세요.'); return }
    if (!isAffiliation(nAff)) { setNErr('소속 태그를 선택하세요.'); return }
    setBusy('create')
    try {
      await api('/users', {
        method: 'POST',
        body: JSON.stringify({ login_id: nLogin.trim(), password: nPw, role: nRole, name: nName.trim() }),
      })
      // 직원 등록 정보(소속 태그·부서·연락처) 저장 — 소속 태그는 필수
      await saveStaffReg({ ...staffReg, [nLogin.trim()]: { affiliation: nAff.trim(), department: nDept.trim(), phone: nPhone.trim() } })
      setCreateOpen(false)
      setNLogin(''); setNName(''); setNPw(''); setNRole('field_inspector'); setNAff(''); setNDept(''); setNPhone('')
      setReload((n) => n + 1)
      setMsg({ ok: true, text: '계정을 생성했습니다.' })
    } catch (e) {
      setNErr(e instanceof Error ? e.message : '생성 실패')
    } finally {
      setBusy('')
    }
  }

  function openModules(a: Account) {
    setModTarget(a)
    setModSel([...a.modules])
  }

  async function saveModules() {
    if (!modTarget) return
    setBusy('modules')
    try {
      await api(`/users/${modTarget.id}`, {
        method: 'PUT', body: JSON.stringify({ modules: modSel }),
      })
      setModTarget(null)
      setReload((n) => n + 1)
      setMsg({ ok: true, text: `${modTarget.login_id} 계정의 모듈 권한을 저장했습니다. (해당 계정은 새로고침 시 반영)` })
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : '권한 저장 실패' })
    } finally {
      setBusy('')
    }
  }

  async function deleteAccount() {
    if (!delTarget) return
    setDelErr('')
    setBusy('del')
    try {
      await api(`/users/${delTarget.id}`, { method: 'DELETE' })
      const removed = delTarget.login_id
      setDelTarget(null)
      setReload((n) => n + 1)
      setMsg({ ok: true, text: `${removed} 계정을 삭제했습니다.` })
    } catch (e) {
      setDelErr(e instanceof Error ? e.message : '삭제 실패')
    } finally {
      setBusy('')
    }
  }

  async function openOffboard() {
    setOffErr(''); setOffFrom(''); setOffTo(''); setOffDelete(true); setOffCounts({})
    setOffOpen(true)
    try {
      const schools = await api<Array<{ manager?: string }>>('/schools')
      const counts: Record<string, number> = {}
      for (const s of schools) {
        const m = (s.manager || '').trim()
        if (m) counts[m] = (counts[m] || 0) + 1
      }
      setOffCounts(counts)
    } catch { /* 담당 학교 수는 참고용 — 조회 실패해도 이전은 진행 가능 */ }
  }

  async function doOffboard() {
    setOffErr('')
    const from = accounts.find((a) => a.id === offFrom)
    const to = accounts.find((a) => a.id === offTo)
    if (!from) { setOffErr('퇴사할 조사원을 선택하세요.'); return }
    if (!to) { setOffErr('인수받을 조사원을 선택하세요.'); return }
    if (from.id === to.id) { setOffErr('퇴사자와 인수자는 서로 달라야 합니다.'); return }
    if (!from.name.trim()) {
      setOffErr('퇴사자 계정에 이름이 없어 담당 학교를 특정할 수 없습니다. 먼저 「편집」에서 이름을 지정하세요.')
      return
    }
    setBusy('off')
    try {
      const res = await api<{ transferred: number }>('/schools/transfer-manager', {
        method: 'POST',
        body: JSON.stringify({ from_name: from.name.trim(), to_name: to.name.trim() }),
      })
      if (offDelete) await api(`/users/${from.id}`, { method: 'DELETE' })
      setOffOpen(false)
      setReload((n) => n + 1)
      setMsg({
        ok: true,
        text: `${from.name} → ${to.name} 담당 학교 ${res.transferred}개 이전${offDelete ? ' + 계정 삭제' : ''} 완료.`,
      })
    } catch (e) {
      setOffErr(e instanceof Error ? e.message : '퇴사 처리 실패')
    } finally {
      setBusy('')
    }
  }

  async function resetPw() {
    if (!pwTarget) return
    setPwErr('')
    if (!pwNew) { setPwErr('새 비밀번호를 입력하세요.'); return }
    setBusy('pw')
    try {
      await api(`/users/${pwTarget.id}/reset-password`, {
        method: 'POST', body: JSON.stringify({ new_password: pwNew }),
      })
      setPwTarget(null)
      setPwNew('')
      setMsg({ ok: true, text: '비밀번호를 재설정했습니다.' })
    } catch (e) {
      setPwErr(e instanceof Error ? e.message : '재설정 실패')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className={embedded ? '' : 'page rv'}>
      {!embedded && <div className="breadcrumb"><Link to="/">홈</Link> / <b>계정 관리</b></div>}
      <div className="bar">
        {!embedded && <h2><Users size={20} /> 계정 관리</h2>}
        <div className="sp" />
        {msg && <span className={'pillx ' + (msg.ok ? 'ok' : 'late')}>{msg.text}</span>}
        <button className="btn btn-ghost" onClick={() => void openOffboard()}>
          <UserMinus size={15} /> 퇴사 처리
        </button>
        <button className="btn btn-primary" onClick={() => { setNErr(''); setCreateOpen(true) }}>
          <Plus size={15} /> 계정 생성
        </button>
      </div>

      <div className="kpis">
        <div className="kpi"><div className="l">전체 계정</div><div className="v">{stats.total}<small> 개</small></div><div className="d">이 테넌트 소속</div></div>
        <div className="kpi"><div className="l">본사 권한</div><div className="v">{stats.hq}<small> 개</small></div><div className="d">관리자·경영진</div></div>
        <div className="kpi"><div className="l">모듈 제한</div><div className="v">{stats.limited}<small> 개</small></div><div className="d">일부 모듈만 허용된 계정</div></div>
        <div className="kpi"><div className="l">소속 태그 없음</div><div className="v">{untagged.length}<small> 개</small></div><div className="d">교육청 계정 자동 선택 불가</div></div>
      </div>

      {/* 소속 태그 미지정 경고 — 봇은 제출자 계정의 태그로 교육청 로그인 계정을 고른다 */}
      {!loading && untagged.length > 0 && (
        <div className="pillx late" style={{ display: 'block', padding: '10px 14px', marginBottom: 16, lineHeight: 1.7, whiteSpace: 'normal' }}>
          <b>소속 태그가 없는 계정 {untagged.length}개</b> — 이 계정으로 제출한 점검은 교육청 업로드 시 기본(첫 번째) 계정으로 전송되어 실패할 수 있습니다.
          {isHq ? ' 아래 목록의 연필(편집) 버튼으로 태그를 지정하세요: ' : ' 본사 관리자에게 태그 지정을 요청하세요: '}
          {untagged.map((a) => a.name || a.login_id).join(', ')}
        </div>
      )}

      <div className="ledger">
        <div className="lh"><h2>계정 목록
          <InfoTip>
            역할: <b>본사 관리자/경영진</b>은 시스템 전체(계정·설정·발행·연동 설정)를, <b>현장 조사원</b>은 업무 화면을 사용합니다.
            모듈 권한을 지정하면 해당 계정 사이드바에는 허용된 모듈만 표시됩니다(비면 전체 허용).
            마지막 본사 관리자는 강등할 수 없습니다.
            <br />
            목록은 <b>소속 → 직급/부서 → 이름</b> 순으로 정렬되며, 소속·직급이 <b>미등록</b>인 계정은 맨 아래에 모입니다.
            <b>소속 태그</b>는 모든 계정의 필수 항목이며, 봇이 이 태그와 같은 태그의 교육청 계정으로 업로드합니다.
            직급은 별도 항목 없이 <b>부서</b> 칸에 저장됩니다(그래서 라벨이 「직급/부서」입니다).
            {isHq
              ? ' 소속·직급/부서 칸의 연필(편집) 버튼으로 계정별 정보를 바로 채울 수 있습니다.'
              : ' 소속·직급 편집은 본사 권한(관리자·경영진)만 가능합니다.'}
          </InfoTip></h2></div>
        <div className="twrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>로그인 ID</th><th>이름</th><th>소속 · 직급/부서</th><th>역할</th><th>사용 가능 모듈</th><th style={{ width: 210 }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6}><div className="tstate">불러오는 중…</div></td></tr>}
              {!loading && error && <tr><td colSpan={6}><div className="tstate">오류: {error}</div></td></tr>}
              {!loading && !error && sortedAccounts.map((a) => (
                <tr key={a.id}>
                  <td><b>{a.login_id}</b></td>
                  <td>{a.name || '—'}</td>
                  <td>
                    {(() => {
                      const si = staffReg[a.login_id] || {}
                      const meta = [si.department, si.phone].filter(Boolean).join(' · ')
                      return (
                        <div className="row" style={{ gap: 6, alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            {isAffiliation(si.affiliation)
                              ? <b>{si.affiliation}</b>
                              : <span className="pillx late" title="소속 태그가 없거나 목록에 없는 값입니다 — 편집 버튼으로 지정하세요">
                                  {si.affiliation ? `${si.affiliation} (태그 아님)` : '태그 없음'}</span>}
                            {meta && <div className="muted" style={{ fontSize: 11 }}>{meta}</div>}
                          </div>
                          {isHq && (
                            <button className="btn btn-ghost" style={{ padding: '2px 7px', flex: '0 0 auto' }}
                              title="소속 · 직급/부서 · 연락처 편집" onClick={() => openReg(a)}>
                              <Pencil size={12} />
                            </button>
                          )}
                        </div>
                      )
                    })()}
                  </td>
                  <td>
                    <select className="select" style={{ width: 140, padding: '4px 8px' }}
                      value={a.role} disabled={busy === a.id}
                      onChange={(e) => void changeRole(a, e.target.value)}>
                      {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </td>
                  <td>
                    {a.modules.length === 0
                      ? <span className="pillx ok">전체 허용</span>
                      : a.modules.map((m) => (
                        <span key={m} className="pillx doing" style={{ marginRight: 4 }}>{MODULE_LABEL[m] || m}</span>
                      ))}
                  </td>
                  <td>
                    <button className="btn btn-ghost" onClick={() => openEdit(a)}>
                      <Pencil size={13} /> 편집
                    </button>
                    <button className="btn btn-ghost" onClick={() => openModules(a)}>모듈 권한</button>
                    <button className="btn btn-ghost" title="작성 이력 보기"
                      onClick={() => nav(`/ledger?tab=history&author=${encodeURIComponent(a.login_id)}`)}>
                      <ScrollText size={13} /> 이력
                    </button>
                    <button className="btn btn-ghost" onClick={() => { setPwErr(''); setPwNew(''); setPwTarget(a) }}>
                      <KeyRound size={13} /> 비밀번호
                    </button>
                    <button className="btn btn-ghost" style={{ color: 'var(--red-ink)' }}
                      onClick={() => { setDelErr(''); setDelTarget(a) }} title="계정 삭제">
                      <Trash2 size={13} /> 삭제
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && !error && accounts.length === 0 && (
                <tr><td colSpan={6}><div className="tstate">계정이 없습니다.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 신규 계정 */}
      {createOpen && (
        <Modal
          title={<>계정 생성 <InfoTip>소속은 점검표·세금계산서 발행처 자동채움과 교육청 계정(소속별) 선택의 기준이 됩니다. 모듈 권한은 생성 후 목록의 「모듈 권한」에서 지정하세요(기본: 전체 허용).</InfoTip></>}
          onClose={() => { if (busy !== 'create') setCreateOpen(false) }}
          footer={
            <>
              <button className="btn btn-ghost" disabled={busy === 'create'} onClick={() => setCreateOpen(false)}>취소</button>
              <button className="btn btn-primary" disabled={busy === 'create'} onClick={() => void createAccount()}>
                {busy === 'create' ? '생성 중…' : '생성'}
              </button>
            </>
          }
        >
          {nErr && <div className="login-err">{nErr}</div>}
          <div className="formrow">
            <label className="field"><span>로그인 ID *</span>
              <input className="input" value={nLogin} onChange={(e) => setNLogin(e.target.value)} placeholder="예: insp-kim" /></label>
            <label className="field"><span>이름</span>
              <input className="input" value={nName} onChange={(e) => setNName(e.target.value)} placeholder="예: 김조사" /></label>
          </div>
          <div className="formrow" style={{ marginTop: 10 }}>
            <label className="field"><span>초기 비밀번호 *</span>
              <input className="input" type="password" value={nPw} autoComplete="new-password"
                onChange={(e) => setNPw(e.target.value)} /></label>
            <label className="field"><span>역할</span>
              <select className="select" value={nRole} onChange={(e) => setNRole(e.target.value)}>
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select></label>
          </div>
          <div className="formrow" style={{ marginTop: 10 }}>
            <label className="field"><span>소속 태그 (필수)</span>
              <select className="select" value={nAff} onChange={(e) => setNAff(e.target.value)}>
                <option value="">소속 태그 선택</option>
                {AFFILIATIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                {/* 목록 밖의 기존 값(구 자유입력)은 보여 주되 저장은 막는다 — 올바른 태그로 다시 고르게 */}
                {nAff && !isAffiliation(nAff) && <option value={nAff}>{nAff} (목록에 없음)</option>}
              </select></label>
            <label className="field"><span>직급/부서</span>
              <input className="input" value={nDept} onChange={(e) => setNDept(e.target.value)} placeholder="예: 팀장 · 안전점검팀" /></label>
            <label className="field"><span>연락처</span>
              <input className="input" value={nPhone} onChange={(e) => setNPhone(e.target.value)} placeholder="예: 010-0000-0000" /></label>
          </div>
        </Modal>
      )}

      {/* 계정 편집(아이디·이름) */}
      {editTarget && (
        <Modal
          title={<>계정 편집 · {editTarget.login_id} <InfoTip>아이디는 이 테넌트 안에서 중복될 수 없습니다. 비밀번호는 「비밀번호」 버튼에서 따로 변경하세요. 아이디를 바꾸면 해당 계정은 새 아이디로 로그인해야 합니다.</InfoTip></>}
          onClose={() => { if (busy !== 'edit') setEditTarget(null) }}
          footer={
            <>
              <button className="btn btn-ghost" disabled={busy === 'edit'} onClick={() => setEditTarget(null)}>취소</button>
              <button className="btn btn-primary" disabled={busy === 'edit'} onClick={() => void saveEdit()}>
                {busy === 'edit' ? '저장 중…' : '저장'}
              </button>
            </>
          }
        >
          {eErr && <div className="login-err">{eErr}</div>}
          <div className="formrow">
            <label className="field"><span>로그인 ID *</span>
              <input className="input" value={eLogin} onChange={(e) => setELogin(e.target.value)} placeholder="예: insp-kim" /></label>
            <label className="field"><span>이름</span>
              <input className="input" value={eName} onChange={(e) => setEName(e.target.value)} placeholder="예: 김조사" /></label>
          </div>
          <div className="formrow" style={{ marginTop: 10 }}>
            <label className="field"><span>소속 태그 (필수)</span>
              <select className="select" value={eAff} onChange={(e) => setEAff(e.target.value)}>
                <option value="">소속 태그 선택</option>
                {AFFILIATIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                {/* 목록 밖의 기존 값(구 자유입력)은 보여 주되 저장은 막는다 — 올바른 태그로 다시 고르게 */}
                {eAff && !isAffiliation(eAff) && <option value={eAff}>{eAff} (목록에 없음)</option>}
              </select></label>
            <label className="field"><span>직급/부서</span>
              <input className="input" value={eDept} onChange={(e) => setEDept(e.target.value)} placeholder="예: 팀장 · 안전점검팀" /></label>
            <label className="field"><span>연락처</span>
              <input className="input" value={ePhone} onChange={(e) => setEPhone(e.target.value)} placeholder="예: 010-0000-0000" /></label>
          </div>
        </Modal>
      )}

      {/* 모듈 권한 편집 */}
      {modTarget && (
        <Modal
          title={`모듈 권한 · ${modTarget.login_id}`}
          onClose={() => { if (busy !== 'modules') setModTarget(null) }}
          footer={
            <>
              <button className="btn btn-ghost" disabled={busy === 'modules'} onClick={() => setModTarget(null)}>취소</button>
              <button className="btn btn-primary" disabled={busy === 'modules'} onClick={() => void saveModules()}>
                {busy === 'modules' ? '저장 중…' : '저장'}
              </button>
            </>
          }
        >
          <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <button className="btn btn-ghost" onClick={() => setModSel([])}>전체 허용(제한 없음)</button>
            <button className="btn btn-ghost" onClick={() => setModSel(MODULES.filter((m) => m.group === '업무').map((m) => m.key))}>업무만</button>
            <button className="btn btn-ghost" onClick={() => setModSel(MODULES.map((m) => m.key))}>모두 선택</button>
          </div>
          {['업무', '본사'].map((g) => (
            <div key={g} style={{ marginBottom: 10 }}>
              <b style={{ fontSize: 12.5 }}>{g}</b>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                {MODULES.filter((m) => m.group === g).map((m) => {
                  const on = modSel.includes(m.key)
                  return (
                    <button key={m.key} type="button"
                      className={'pillx ' + (on ? 'doing' : 'na')}
                      style={{ cursor: 'pointer', border: on ? '1px solid var(--violet)' : '1px solid var(--line)' }}
                      onClick={() => setModSel((prev) => on ? prev.filter((x) => x !== m.key) : [...prev, m.key])}>
                      {on && <Check size={11} style={{ verticalAlign: '-1px', marginRight: 3 }} />}{m.label}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
            {modSel.length === 0
              ? '아무것도 선택하지 않으면 전체 모듈이 허용됩니다.'
              : `선택한 ${modSel.length}개 모듈만 이 계정의 사이드바에 표시됩니다.`}
          </div>
        </Modal>
      )}

      {/* 소속·직급(부서)·연락처 인라인 편집 — 본사 권한 전용 */}
      {regTarget && (
        <Modal
          title={<>소속·직급 편집 · {regTarget.login_id} <InfoTip>직급은 별도 항목이 없어 <b>부서</b> 칸에 함께 저장됩니다(예: 「팀장 · 안전점검팀」). 소속은 점검표·세금계산서 발행처 자동채움과 교육청 계정(소속별) 선택의 기준이 됩니다. 저장하면 목록이 소속·직급 순으로 다시 정렬됩니다.</InfoTip></>}
          onClose={() => { if (busy !== 'reg') setRegTarget(null) }}
          footer={
            <>
              <button className="btn btn-ghost" disabled={busy === 'reg'} onClick={() => setRegTarget(null)}>취소</button>
              <button className="btn btn-primary" disabled={busy === 'reg'} onClick={() => void saveReg()}>
                {busy === 'reg' ? '저장 중…' : '저장'}
              </button>
            </>
          }
        >
          {rErr && <div className="login-err">{rErr}</div>}
          <div className="formrow">
            <label className="field"><span>소속 태그 (필수)</span>
              <select className="select" value={rAff} onChange={(e) => setRAff(e.target.value)}>
                <option value="">소속 태그 선택</option>
                {AFFILIATIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                {/* 목록 밖의 기존 값(구 자유입력)은 보여 주되 저장은 막는다 — 올바른 태그로 다시 고르게 */}
                {rAff && !isAffiliation(rAff) && <option value={rAff}>{rAff} (목록에 없음)</option>}
              </select></label>
            <label className="field"><span>직급/부서</span>
              <input className="input" value={rDept} onChange={(e) => setRDept(e.target.value)} placeholder="예: 팀장 · 안전점검팀" /></label>
            <label className="field"><span>연락처</span>
              <input className="input" value={rPhone} onChange={(e) => setRPhone(e.target.value)} placeholder="예: 010-0000-0000" /></label>
          </div>
        </Modal>
      )}

      {/* 비밀번호 재설정 */}
      {pwTarget && (
        <Modal
          title={<>비밀번호 재설정 · {pwTarget.login_id} <InfoTip>관리자 재설정은 현재 비밀번호 확인 없이 즉시 적용됩니다. 본인 변경은 마이페이지에서.</InfoTip></>}
          onClose={() => { if (busy !== 'pw') setPwTarget(null) }}
          footer={
            <>
              <button className="btn btn-ghost" disabled={busy === 'pw'} onClick={() => setPwTarget(null)}>취소</button>
              <button className="btn btn-primary" disabled={busy === 'pw'} onClick={() => void resetPw()}>
                {busy === 'pw' ? '재설정 중…' : '재설정'}
              </button>
            </>
          }
        >
          {pwErr && <div className="login-err">{pwErr}</div>}
          <label className="field"><span>새 비밀번호</span>
            <input className="input" type="password" value={pwNew} autoComplete="new-password"
              onChange={(e) => setPwNew(e.target.value)} /></label>
        </Modal>
      )}

      {/* 계정 삭제 확인 */}
      {delTarget && (
        <Modal
          title="계정 삭제"
          onClose={() => { if (busy !== 'del') setDelTarget(null) }}
          footer={
            <>
              <button className="btn btn-ghost" disabled={busy === 'del'} onClick={() => setDelTarget(null)}>취소</button>
              <button className="btn btn-danger" disabled={busy === 'del'} onClick={() => void deleteAccount()}>
                <Trash2 size={15} /> {busy === 'del' ? '삭제 중…' : '삭제'}
              </button>
            </>
          }
        >
          {delErr && <div className="login-err">{delErr}</div>}
          <p style={{ fontSize: 13.5, lineHeight: 1.7, margin: 0 }}>
            <b>{delTarget.login_id}</b>{delTarget.name ? ` (${delTarget.name})` : ''} 계정을 삭제하시겠습니까?
          </p>
          <div className="muted" style={{ marginTop: 10, fontSize: 11.5 }}>
            삭제하면 이 계정으로는 더 이상 로그인할 수 없습니다. 되돌릴 수 없습니다.
            (본인 계정·마지막 본사 관리자는 삭제할 수 없습니다.)
          </div>
        </Modal>
      )}

      {/* 퇴사 처리(담당 이전 + 계정 삭제) */}
      {offOpen && (() => {
        const fromAcc = accounts.find((a) => a.id === offFrom)
        const cnt = fromAcc ? (offCounts[fromAcc.name.trim()] || 0) : 0
        const inspectors = accounts.filter((a) => a.role === 'field_inspector')
        return (
          <Modal
            title="퇴사 처리 · 담당 인수인계"
            onClose={() => { if (busy !== 'off') setOffOpen(false) }}
            footer={
              <>
                <button className="btn btn-ghost" disabled={busy === 'off'} onClick={() => setOffOpen(false)}>취소</button>
                <button className="btn btn-primary" disabled={busy === 'off'} onClick={() => void doOffboard()}>
                  {busy === 'off' ? '처리 중…' : '이전 실행'}
                </button>
              </>
            }
          >
            {offErr && <div className="login-err">{offErr}</div>}
            <div className="formrow">
              <label className="field" style={{ flex: 1, minWidth: 180 }}>
                <span>퇴사(이전) 조사원</span>
                <select className="select" value={offFrom} onChange={(e) => setOffFrom(e.target.value)}>
                  <option value="">선택하세요</option>
                  {inspectors.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name || a.login_id}{a.name ? ` (${offCounts[a.name.trim()] || 0}교)` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field" style={{ flex: 1, minWidth: 180 }}>
                <span>인수받을 조사원</span>
                <select className="select" value={offTo} onChange={(e) => setOffTo(e.target.value)}>
                  <option value="">선택하세요</option>
                  {inspectors.filter((a) => a.id !== offFrom).map((a) => (
                    <option key={a.id} value={a.id}>{a.name || a.login_id}</option>
                  ))}
                </select>
              </label>
            </div>
            {fromAcc && (
              <div className="muted" style={{ marginTop: 12, fontSize: 12.5, lineHeight: 1.7 }}>
                <b>{fromAcc.name || fromAcc.login_id}</b> 담당 학교 <b>{cnt}개</b>가 선택한 조사원으로 재배정되고,
                각 학교의 담당자 변경이력에 기록됩니다.
              </div>
            )}
            <label className="row" style={{ gap: 8, marginTop: 12, cursor: 'pointer', alignItems: 'center' }}>
              <input type="checkbox" checked={offDelete} onChange={(e) => setOffDelete(e.target.checked)} />
              <span style={{ fontSize: 13 }}>이전 후 퇴사자 계정 삭제(로그인 차단)</span>
            </label>
          </Modal>
        )
      })()}
    </div>
  )
}
