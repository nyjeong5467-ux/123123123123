// 경영 콘솔 — 현장 앱 관리 탭: 세션코드 발급(임베드) + 앱 배포 관리(KV) + 운영 안내.
// 앱 배포 정보는 org_docs 'app-release' KV에 저장(백엔드 무변경) — 본사 관리자(hq)만 PUT 가능.
import { useEffect, useState } from 'react'
import { Copy, Info, KeyRound, Pencil, Save, Smartphone, X } from 'lucide-react'
import { api } from '../../lib/api'

type AppRelease = {
  version: string
  released_at: string
  apk_url: string
  notes: string
  min_note: string
}

const RELEASE_DEFAULT: AppRelease = {
  version: '260822c',
  released_at: '2026-08-22',
  apk_url: '',
  notes: '임시저장·5대 업무 PC 파리티·디자인 고도화',
  min_note: '',
}

export default function ConsoleApp() {
  const [rel, setRel] = useState<AppRelease>(RELEASE_DEFAULT)
  const [draft, setDraft] = useState<AppRelease>(RELEASE_DEFAULT)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let alive = true
    api<{ doc: Partial<AppRelease> }>('/ops/docs/app-release')
      .then((d) => {
        if (!alive) return
        const merged = { ...RELEASE_DEFAULT, ...(d?.doc || {}) }
        setRel(merged)
        setDraft(merged)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  async function save() {
    setSaving(true)
    setMsg('')
    try {
      await api('/ops/docs/app-release', { method: 'PUT', body: JSON.stringify({ doc: draft }) })
      setRel(draft)
      setEditing(false)
      setMsg('저장되었습니다.')
      setTimeout(() => setMsg(''), 2000)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  function copyUrl() {
    if (!rel.apk_url) return
    void navigator.clipboard?.writeText(rel.apk_url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }).catch(() => {})
  }

  const field = (label: string, key: keyof AppRelease, placeholder: string) => (
    <label className="field" style={{ flex: 1, minWidth: 200 }}>
      <span>{label}</span>
      <input
        className="input"
        value={draft[key]}
        placeholder={placeholder}
        onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
      />
    </label>
  )

  return (
    <div>
      {/* ── 앱 배포 관리 ── */}
      <div className="ledger" style={{ marginBottom: 24 }}>
        <div className="lh">
          <h2><Smartphone size={18} /> 현장 앱 배포 관리</h2>
          <div className="sp" />
          {msg && <span className="pillx ok">{msg}</span>}
          {!editing ? (
            <button className="btn btn-ghost" onClick={() => { setDraft(rel); setEditing(true) }}>
              <Pencil size={14} /> 편집
            </button>
          ) : (
            <>
              <button className="btn btn-ghost" onClick={() => setEditing(false)}><X size={14} /> 취소</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                <Save size={14} /> {saving ? '저장 중…' : '저장'}
              </button>
            </>
          )}
        </div>
        <div className="card-body" style={{ padding: '20px 26px' }}>
          {!editing ? (
            <div className="kpis" style={{ marginBottom: 0 }}>
              <div className="kpi">
                <div className="l">현재 배포 버전</div>
                <div className="v">{rel.version || '—'}</div>
                <div className="d">배포일 {rel.released_at || '—'}</div>
              </div>
              <div className="kpi">
                <div className="l">APK 다운로드 URL</div>
                <div className="v" style={{ fontSize: 15, wordBreak: 'break-all' }}>
                  {rel.apk_url || <span className="muted">미등록 — 배포 시 URL을 입력하세요</span>}
                </div>
                <div className="d">
                  {rel.apk_url && (
                    <button className="btn btn-ghost" style={{ height: 26, padding: '0 10px' }} onClick={copyUrl}>
                      <Copy size={12} /> {copied ? '복사됨' : 'URL 복사'}
                    </button>
                  )}
                </div>
              </div>
              <div className="kpi">
                <div className="l">이번 버전 변경사항</div>
                <div className="v" style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.5 }}>{rel.notes || '—'}</div>
                {rel.min_note && <div className="d">{rel.min_note}</div>}
              </div>
            </div>
          ) : (
            <>
              <div className="formrow">
                {field('버전명', 'version', '예: 260822c')}
                {field('배포일', 'released_at', 'YYYY-MM-DD')}
              </div>
              <div className="formrow" style={{ marginTop: 12 }}>
                {field('APK 다운로드 URL', 'apk_url', 'https:// … (NAS·드라이브 공유 링크)')}
              </div>
              <div className="formrow" style={{ marginTop: 12 }}>
                {field('변경사항 메모', 'notes', '이번 버전의 주요 변경사항')}
                {field('설치 안내(선택)', 'min_note', '예: Android 10 이상 · 이전 버전 삭제 후 설치')}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── 세션코드 발급: 로그인 방식 전환으로 기본 UI에서 숨김(2026-09-18) ──
           조사원은 앱에서 아이디/비번 로그인 → 그날 일정표 학교 자동. 세션코드는 비상용만.
           백엔드 발급/리딤은 유지되며, 필요 시 /sessions 로 직접 접근해 발급할 수 있다. */}
      <div className="ledger" style={{ marginBottom: 24 }}>
        <div className="lh">
          <h2><KeyRound size={18} /> 세션코드 발급 (숨김)</h2>
          <div className="sp" />
          <span className="pillx na">비상용</span>
        </div>
        <div className="card-body" style={{ padding: '14px 26px', fontSize: 13.5, lineHeight: 1.9, color: 'var(--muted)' }}>
          조사원은 이제 앱에서 <b>아이디·비밀번호로 로그인</b>하면 그날 일정표의 학교가 자동으로 열립니다(세션코드 불필요).
          비상 시 세션코드 발급이 필요하면 <a href="/sessions" style={{ color: 'var(--violet)' }}>/sessions</a> 로 직접 접근하세요.
        </div>
      </div>

      {/* ── 운영 안내 ── */}
      <div className="ledger">
        <div className="lh"><h2><Info size={18} /> 기기·세션 운영 안내</h2></div>
        <div className="card-body" style={{ padding: '18px 26px', fontSize: 13.5, lineHeight: 1.9 }}>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>조사원은 앱에서 <b>아이디·비밀번호로 로그인</b>하면 그날 일정표(근무 종합관리표) 학교가 자동으로 열립니다. 세션코드는 비상용으로만 사용합니다(위 안내 참고).</li>
            <li>태블릿 앱의 서버 주소는 앱 로그인 화면의 <b>[서버 주소 설정]</b>에서 변경합니다(터널 주소 변경 시 재빌드 불필요).</li>
            <li>현장 제출은 오프라인 큐에 쌓였다가 연결 시 자동 동기화됩니다 — 제출 직후 목록에 없으면 앱의 <b>동기화</b> 상태를 확인하세요.</li>
            <li>앱 임시저장 건은 각 업무 화면에서 <b>[이어서 작성]</b>으로 PC에서 이어받을 수 있습니다.</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
