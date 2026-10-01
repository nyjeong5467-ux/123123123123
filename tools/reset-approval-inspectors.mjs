// ============================================================================
// 결재선 점검자 이름 리셋 (1회성 관리 도구) — [122]
//
// 문제: 학교 이력관리대장 [결재선] 성명 칸에 협회 점검자(로그인 계정) 이름이 들어가 있음.
//       결재선은 학교 내부 결재자 전용([118])이므로 협회 직원 이름은 비워야 한다.
// 동작: 1) 로그인  2) 협회 계정(학교 확인자 제외) 이름 목록 수집  3) 전 학교 결재선 조회
//       4) 성명이 협회 계정 이름과 같은 칸만 찾아 미리보기  5) 전체 결재선 백업(JSON)
//       6) 확인(y) 후 해당 칸 성명만 '' 로 저장  7) 다시 조회해 반영 확인
//       - 직책·단계 구성·학교 담당자(행정실장·교장 등) 이름은 그대로 유지
//       - 되돌리기: node tools/reset-approval-inspectors.mjs --restore <백업파일>
//
// 실행: reset-approval.bat 더블클릭 (또는 node tools/reset-approval-inspectors.mjs)
//       [126] 기관 확인자 직책 변환: fix-agency-approval.bat (--fix-agency)
// 대상 서버 기본값: https://hanguksafe.kr  (로컬 목업 테스트: --server http://localhost:3001)
// 계약 파일(api.ts/auth.tsx/vite.config.ts)은 사용·수정하지 않는 독립 스크립트.
// ============================================================================
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const argOf = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined }
const RESTORE = argOf('--restore')
const FIX_AGENCY = argv.includes('--fix-agency') // [126] 기관 확인자 직책 변환 모드
let SERVER = (argOf('--server') || '').replace(/\/+$/, '')

// ---- 입력 (줄 대기열 — 붙여넣기·파이프 입력에서도 줄이 유실되지 않게) ----
const rl = readline.createInterface({ input: process.stdin, terminal: false })
const queue = []
const waiters = []
let muted = false
rl.on('line', (l) => { const w = waiters.shift(); if (w) w(l); else queue.push(l) })
rl.on('close', () => { while (waiters.length) waiters.shift()('') })
const nextLine = () => (queue.length ? Promise.resolve(queue.shift()) : new Promise((r) => waiters.push(r)))
async function ask(q) { process.stdout.write(q); const a = (await nextLine()).trim(); return a }
// 비밀번호: 화면 에코 끄기(터미널일 때) — cmd 창에서 입력 글자가 보이지 않음
async function askHidden(q) {
  process.stdout.write(q)
  const tty = process.stdin.isTTY
  if (tty) { muted = true; process.stdin.setRawMode?.(true) }
  if (!tty) { const a = await nextLine(); process.stdout.write('\n'); return a }
  return new Promise((resolve) => {
    let buf = ''
    rl.pause()
    const onData = (d) => {
      for (const ch of d.toString('utf8')) {
        if (ch === '\r' || ch === '\n') { done(); return }
        if (ch === '\u0003') process.exit(1)
        if (ch === '\u0008' || ch === '\u007f') buf = buf.slice(0, -1)
        else buf += ch
      }
    }
    const done = () => {
      process.stdin.off('data', onData); process.stdin.setRawMode?.(false); muted = false
      process.stdout.write('\n'); rl.resume(); resolve(buf)
    }
    process.stdin.on('data', onData)
  })
}

// ---- API ----
let TOKEN = ''
async function api(method, p, body) {
  const r = await fetch(`${SERVER}/api/v1${p}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`${r.status} ${method} ${p} ${t.slice(0, 200)}`)
  return t ? JSON.parse(t) : null
}
async function pool(items, n, fn) {
  const out = new Array(items.length)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k) }
  }))
  return out
}
const norm = (s) => String(s ?? '').replace(/\s+/g, '')
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 13)

async function login() {
  if (!SERVER) SERVER = ((await ask('서버 주소 [엔터 = https://hanguksafe.kr]: ')) || 'https://hanguksafe.kr').replace(/\/+$/, '')
  const tenant = await ask('테넌트(기관) ID: ')
  const loginId = await ask('로그인 ID (본사 관리자 계정): ')
  const password = await askHidden('비밀번호: ')
  const r = await api('POST', '/auth/login', { tenant_id: tenant, login_id: loginId, password })
  TOKEN = r.access_token
  console.log(`\n[로그인] ${SERVER} 접속 완료\n`)
}

async function restore(file) {
  const backup = JSON.parse(fs.readFileSync(file, 'utf8'))
  // 이번 도구가 바꾼 학교만 되돌림(나머지 학교는 건드리지 않음)
  const changed = new Set(backup.changed || [])
  const list = (backup.lines || []).filter((x) => !changed.size || changed.has(x.school_id))
  console.log(`[되돌리기] ${file} — ${list.length}개 학교 결재선`)
  if ((await ask('백업 시점으로 되돌릴까요? (y/N): ')).toLowerCase() !== 'y') return console.log('중단했습니다.')
  let ok = 0
  await pool(list, 4, async (x) => {
    try { await api('PUT', `/schools/${x.school_id}/approval-line`, { steps: x.steps }); ok++ } catch (e) { console.log(`  실패 ${x.school_name}: ${e.message}`) }
  })
  console.log(`[되돌리기] 완료 ${ok}/${list.length}`)
}

// ---- [126] 기관 확인자 직책 변환: 학교식(담당자·행정실장·교장) → 기관식(담당자·팀장·과장) ----
// 화면은 표시 시 자동 변환하지만, 운영 백엔드의 PDF(report.pdf)는 저장값을 그대로 쓰므로 저장값 자체를 고친다.
const isAgency = (s) => {
  if (s?.org_kind && /교육청|기관/.test(s.org_kind)) return true
  const n = String(s?.name ?? '').replace(/\(.*?\)/g, '').replace(/\s+/g, '')
  return !!n && !/(학교|유치원)$/.test(n)
}
const AGENCY_TITLE = { 안전담당자: '담당자', 행정실장: '팀장', 행정주무관: '담당자', 교감: '팀장', 교장: '과장', 원감: '팀장', 원장: '과장' }
const SCHOOL_HEAD = new Set(['교장', '원장'])
async function fixAgency() {
  const schools = (await api('GET', '/schools')).filter(isAgency)
  console.log(`[1/3] 기관 ${schools.length}곳 확인자 조회 중...`)
  const lines = (await pool(schools, 6, async (s) => {
    try {
      const r = await api('GET', `/schools/${s.id}/approval-line`)
      return { school_id: s.id, school_name: s.name, principal: s.principal || '', steps: Array.isArray(r?.steps) ? r.steps : [] }
    } catch { return null }
  })).filter(Boolean)
  const targets = []
  for (const x of lines) {
    const next = x.steps.length
      ? x.steps.map((st) => {
          const t = String(st?.title ?? '').trim()
          const nm = String(st?.name ?? '').trim()
          return { title: AGENCY_TITLE[t] ?? t, name: SCHOOL_HEAD.has(t) && (!nm || nm === x.principal) ? '' : nm }
        })
      : [{ title: '담당자', name: '' }, { title: '팀장', name: '' }, { title: '과장', name: '' }]
    if (JSON.stringify(next) !== JSON.stringify(x.steps.map((st) => ({ title: String(st?.title ?? '').trim(), name: String(st?.name ?? '').trim() })))) targets.push({ ...x, next })
  }
  console.log(`[2/3] 변환 대상 ${targets.length}곳\n`)
  for (const t of targets) {
    const a = t.steps.map((st) => `${st.title}${st.name ? ' ' + st.name : ''}`).join(' → ') || '(비어 있음)'
    const b = t.next.map((st) => `${st.title}${st.name ? ' ' + st.name : ''}`).join(' → ')
    console.log(`  - ${t.school_name}: ${a}  ⇒  ${b}`)
  }
  if (!targets.length) { console.log('바꿀 항목이 없습니다.'); return }
  const backupFile = path.join(HERE, `approval-backup-${stamp()}.json`)
  fs.writeFileSync(backupFile, JSON.stringify({ server: SERVER, at: new Date().toISOString(), changed: targets.map((t) => t.school_id), lines }, null, 2), 'utf8')
  console.log(`\n[백업] ${backupFile}`)
  if ((await ask(`\n위 ${targets.length}개 기관의 확인자를 담당자·팀장·과장으로 바꿀까요? (y/N): `)).toLowerCase() !== 'y') {
    console.log('중단했습니다. 아무것도 변경하지 않았습니다.')
    return
  }
  let ok = 0
  await pool(targets, 4, async (t) => {
    try { await api('PUT', `/schools/${t.school_id}/approval-line`, { steps: t.next }); ok++ } catch (e) { console.log(`  실패 ${t.school_name}: ${e.message}`) }
  })
  console.log(`\n[3/3] 완료: ${ok}/${targets.length}곳`)
  console.log(`  되돌리기: node tools/reset-approval-inspectors.mjs --restore "${backupFile}"`)
}

async function main() {
  await login()
  if (RESTORE) return restore(RESTORE)
  if (FIX_AGENCY) return fixAgency()

  // 1) 협회 계정 이름 (학교 확인자 계정 제외)
  const users = await api('GET', '/users')
  const staff = new Map()
  for (const u of users || []) {
    if (u.role === 'school_confirmer') continue
    const n = norm(u.name)
    if (n) staff.set(n, `${u.name}(${u.login_id})`)
  }
  console.log(`[1/4] 협회 계정 ${staff.size}명: ${[...staff.values()].join(', ') || '없음'}`)

  // 2) 전 학교 결재선 조회
  const schools = await api('GET', '/schools')
  console.log(`[2/4] 학교 ${schools.length}곳 결재선 조회 중...`)
  let failed = 0
  const lines = await pool(schools, 6, async (s) => {
    try {
      const r = await api('GET', `/schools/${s.id}/approval-line`)
      return { school_id: s.id, school_name: s.name, steps: Array.isArray(r?.steps) ? r.steps : [] }
    } catch { failed++; return null }
  })
  const valid = lines.filter(Boolean)
  if (failed) console.log(`  (조회 실패 ${failed}곳 — 이번 작업에서 제외)`)

  // 3) 점검자 이름이 들어간 칸 찾기
  const targets = []
  for (const x of valid) {
    const hits = x.steps.map((st, i) => (staff.has(norm(st?.name)) ? i : -1)).filter((i) => i >= 0)
    if (hits.length) targets.push({ ...x, hits })
  }
  console.log(`[3/4] 점검자 이름이 들어간 학교: ${targets.length}곳\n`)
  for (const t of targets) {
    const view = t.steps.map((st, i) => `${st.title || '직책'}:${st.name || '-'}${t.hits.includes(i) ? ' → (비움)' : ''}`).join('  |  ')
    console.log(`  - ${t.school_name}  ${view}`)
  }
  if (!targets.length) { console.log('\n바꿀 항목이 없습니다.'); return }

  // 4) 백업 후 적용
  const backupFile = path.join(HERE, `approval-backup-${stamp()}.json`)
  fs.writeFileSync(backupFile, JSON.stringify({ server: SERVER, at: new Date().toISOString(), changed: targets.map((t) => t.school_id), lines: valid }, null, 2), 'utf8')
  console.log(`\n[백업] 전체 결재선 ${valid.length}곳 저장: ${backupFile}`)
  if ((await ask(`\n위 ${targets.length}개 학교의 점검자 이름 칸만 비울까요? (y/N): `)).toLowerCase() !== 'y') {
    console.log('중단했습니다. 아무것도 변경하지 않았습니다.')
    return
  }
  let ok = 0
  const stuck = []
  await pool(targets, 4, async (t) => {
    const steps = t.steps.map((st, i) => ({ title: st.title || '', name: t.hits.includes(i) ? '' : st.name || '' }))
    try {
      await api('PUT', `/schools/${t.school_id}/approval-line`, { steps })
      const after = await api('GET', `/schools/${t.school_id}/approval-line`)
      if ((after?.steps || []).some((st) => staff.has(norm(st?.name)))) stuck.push(t.school_name)
      else ok++
    } catch (e) {
      console.log(`  실패 ${t.school_name}: ${e.message}`)
    }
  })
  console.log(`\n[4/4] 완료: ${ok}/${targets.length}곳 정리`)
  if (stuck.length) {
    console.log(`  [주의] 저장 후에도 점검자 이름이 다시 보이는 학교 ${stuck.length}곳 — 서버가 조회 시 자동으로 채우는 것으로 보입니다(백엔드 확인 필요):`)
    console.log('   ' + stuck.join(', '))
  }
  console.log(`  되돌리기: node tools/reset-approval-inspectors.mjs --restore "${backupFile}"`)
}

main()
  .catch((e) => { console.error('\n[오류] ' + e.message) })
  .finally(() => rl.close())
