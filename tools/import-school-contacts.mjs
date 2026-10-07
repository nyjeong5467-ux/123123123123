// ============================================================================
// 학교 담당자 이메일 일괄 등록 (1회성 관리 도구) — [132]
//
// 원본: "한국산업안전협회 계약 학교 목록.xlsx"의 [기관명 · 이메일] 771건
//       → tools/school-contacts-data.json (엑셀에서 추출, 개인 이메일 포함 → git 제외)
// 대상: 학교 이력관리대장 > 학교 정보 > [학교 담당자]의 '담당자 이메일' (/mail/school-contacts)
// 동작: 1) 로그인  2) 서버 학교 목록·기존 담당자 연락처 조회  3) 기관명으로 매칭(동명 학교는 사업자번호·주소로 구분)
//       4) 미리보기 + 결과표(CSV) 저장  5) 기존 연락처 백업  6) 확인(y) 후 저장  7) 다시 조회해 반영 확인
//       - 기본: 담당자 이메일이 비어 있는 학교만 채움 (이미 입력된 값은 유지)   --overwrite : 다르면 엑셀 값으로 교체
//       - 기존 담당자 이름·전화는 그대로 유지
//       - 한 칸에 이메일이 여러 개면 (안전·교육) 표기 → 표기 없음 → 그 외 → 계약 → 회계 순으로 1개 선택   --all-emails : 전부 쉼표로 저장
//       - 되돌리기: --restore <백업파일>
// 실행: import-school-contacts.bat  (로컬 목업 테스트: --server http://localhost:3001)
// ============================================================================
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const argOf = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined }
const RESTORE = argOf('--restore')
const OVERWRITE = argv.includes('--overwrite')
const ALL_EMAILS = argv.includes('--all-emails')
const DATA = argOf('--data') || path.join(HERE, 'school-contacts-data.json')
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
  const tenant = (await ask('테넌트 ID [엔터 = t_demo (웹 로그인과 동일)]: ')) || 't_demo'
  const loginId = await ask('로그인 ID (본사 관리자 계정): ')
  const password = await askHidden('비밀번호: ')
  const r = await api('POST', '/auth/login', { tenant_id: tenant, login_id: loginId, password })
  TOKEN = r.access_token
  console.log(`\n[로그인] ${SERVER} 접속 완료\n`)
}

// ---- 이메일 칸 해석: "a@x.kr(회계), b@y.kr(교육)" → [{email, tag}] ----
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g
function parseEmails(cell) {
  const s = String(cell ?? '')
  const out = []
  let m
  EMAIL_RE.lastIndex = 0
  while ((m = EMAIL_RE.exec(s))) {
    const rest = s.slice(m.index + m[0].length)
    const tag = (/^\s*\(([^)]*)\)/.exec(rest) || [])[1] || ''
    out.push({ email: m[0].replace(/\.+$/, ''), tag: tag.trim() })
  }
  return out
}
// 점검 결과 메일 수신자 기준 우선순위: 안전·교육 담당 > 표기 없음 > 그 외(행정실장·주무관 등) > 계약 > 회계·세금계산서
function rank(tag) {
  if (/안전|교육/.test(tag)) return 0
  if (!tag) return 1
  if (/회계|세금/.test(tag) && !/계약/.test(tag)) return 4
  if (/계약/.test(tag)) return 3
  return 2
}
function pickEmail(cell) {
  const list = parseEmails(cell)
  if (!list.length) return { email: '', all: [] }
  if (ALL_EMAILS) return { email: [...new Set(list.map((x) => x.email))].join(', '), all: list }
  const best = [...list].sort((a, b) => rank(a.tag) - rank(b.tag))[0]
  return { email: best.email, all: list }
}

const nameKey = (s) => norm(s)
const nameKeyLoose = (s) => norm(String(s ?? '').replace(/\(.*?\)/g, ''))
const digits = (s) => String(s ?? '').replace(/\D/g, '')
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`

async function restore(file) {
  const backup = JSON.parse(fs.readFileSync(file, 'utf8'))
  const list = (backup.changed || []).map((sid) => ({ sid, c: backup.contacts?.[sid] || { email: '', name: '', phone: '' } }))
  console.log(`[되돌리기] ${file} — ${list.length}개 학교의 담당자 연락처를 백업 시점으로`)
  if ((await ask('되돌릴까요? (y/N): ')).toLowerCase() !== 'y') return console.log('중단했습니다.')
  let ok = 0
  await pool(list, 4, async ({ sid, c }) => {
    try { await api('PUT', '/mail/school-contacts', { school_id: sid, email: c.email || '', name: c.name || '', phone: c.phone || '' }); ok++ } catch (e) { console.log(`  실패 ${sid}: ${e.message}`) }
  })
  console.log(`[되돌리기] 완료 ${ok}/${list.length}  (서버가 빈 이메일 저장을 막으면 일부는 실패로 표시됩니다)`)
}

async function main() {
  if (!RESTORE && !fs.existsSync(DATA)) { console.log(`[오류] 데이터 파일이 없습니다: ${DATA}`); return }
  await login()
  if (RESTORE) return restore(RESTORE)
  const rows = JSON.parse(fs.readFileSync(DATA, 'utf8'))

  const schools = await api('GET', '/schools')
  const cur = (await api('GET', '/mail/school-contacts'))?.contacts || {}
  console.log(`[1/4] 엑셀 ${rows.length}건 · 서버 학교 ${schools.length}곳 · 기존 담당자 이메일 ${Object.values(cur).filter((c) => c?.email).length}곳`)

  // 기관명 → 서버 학교 (동명 학교는 사업자번호 → 주소로 구분)
  const byName = new Map(); const byLoose = new Map()
  for (const s of schools) {
    const k = nameKey(s.name); if (!byName.has(k)) byName.set(k, []); byName.get(k).push(s)
    const l = nameKeyLoose(s.name); if (!byLoose.has(l)) byLoose.set(l, []); byLoose.get(l).push(s)
  }
  const plan = [] // {row, school?, status, email, note}
  const used = new Set()
  for (const row of rows) {
    const picked = pickEmail(row.email)
    let cands = byName.get(nameKey(row.name)) || byLoose.get(nameKeyLoose(row.name)) || []
    if (cands.length > 1) {
      const biz = digits(row.biz_no)
      const byBiz = biz ? cands.filter((s) => digits(s.biz_no) === biz) : []
      const byAddr = cands.filter((s) => row.address && norm(s.address) === norm(row.address))
      const byRegion = cands.filter((s) => row.region && (s.region === row.region || String(s.address || '').includes(row.region)))
      cands = byBiz.length === 1 ? byBiz : byAddr.length === 1 ? byAddr : byRegion.length === 1 ? byRegion : cands
    }
    const note = picked.all.length > 1 ? `엑셀 원문: ${picked.all.map((x) => x.email + (x.tag ? `(${x.tag})` : '')).join(', ')}` : ''
    if (!picked.email) { plan.push({ row, status: '엑셀에 이메일 없음', email: '', note }); continue }
    if (cands.length === 0) { plan.push({ row, status: '서버에 학교 없음', email: picked.email, note }); continue }
    if (cands.length > 1) { plan.push({ row, status: '동명 학교 구분 불가', email: picked.email, note }); continue }
    const school = cands[0]
    if (used.has(school.id)) { plan.push({ row, school, status: '중복 매칭(건너뜀)', email: picked.email, note }); continue }
    used.add(school.id)
    const old = (cur[school.id]?.email || '').trim()
    let status
    if (!old) status = '입력'
    else if (old.toLowerCase() === picked.email.toLowerCase()) status = '이미 동일'
    else status = OVERWRITE ? '교체' : '기존 값 유지(다름)'
    plan.push({ row, school, status, email: picked.email, old, note })
  }
  const count = (st) => plan.filter((p) => p.status === st).length
  const todo = plan.filter((p) => p.status === '입력' || p.status === '교체')
  console.log('[2/4] 매칭 결과')
  for (const st of ['입력', '교체', '이미 동일', '기존 값 유지(다름)', '엑셀에 이메일 없음', '서버에 학교 없음', '동명 학교 구분 불가', '중복 매칭(건너뜀)']) {
    if (count(st)) console.log(`   · ${st}: ${count(st)}곳`)
  }
  const show = (st, n) => { const l = plan.filter((p) => p.status === st); if (l.length) console.log(`   [${st}] ` + l.slice(0, n).map((p) => p.row.name + (p.old ? `(${p.old}→${p.email})` : '')).join(', ') + (l.length > n ? ` 외 ${l.length - n}곳` : '')) }
  show('서버에 학교 없음', 15); show('동명 학교 구분 불가', 10); show('엑셀에 이메일 없음', 10); show('기존 값 유지(다름)', 8)
  const multi = todo.filter((p) => p.note)
  if (multi.length) {
    console.log(`   [이메일 여러 개 → ${ALL_EMAILS ? '전부 저장' : '1개 선택'}] ${multi.length}곳`)
    for (const p of multi.slice(0, 30)) console.log(`      - ${p.row.name}: ${p.email}   ← ${p.note.replace('엑셀 원문: ', '')}`)
  }
  const reportFile = path.join(HERE, `school-contacts-report-${stamp()}.csv`)
  fs.writeFileSync(reportFile, '﻿' + ['엑셀번호,기관명,결과,저장할 이메일,기존 이메일,서버 학교ID,비고',
    ...plan.map((p) => [p.row.no, p.row.name, p.status, p.email, p.old || '', p.school?.id || '', p.note].map(csvCell).join(','))].join('\r\n'), 'utf8')
  console.log(`   결과표(엑셀로 열림): ${reportFile}`)
  if (!todo.length) { console.log('\n저장할 항목이 없습니다.'); return }

  const backupFile = path.join(HERE, `school-contacts-backup-${stamp()}.json`)
  fs.writeFileSync(backupFile, JSON.stringify({ server: SERVER, at: new Date().toISOString(), changed: todo.map((p) => p.school.id), contacts: cur }, null, 2), 'utf8')
  console.log(`[3/4] 기존 담당자 연락처 백업: ${backupFile}`)
  if ((await ask(`\n${todo.length}개 학교의 담당자 이메일을 저장할까요? (y/N): `)).toLowerCase() !== 'y') {
    console.log('중단했습니다. 아무것도 변경하지 않았습니다.')
    return
  }
  let ok = 0; const fails = []
  await pool(todo, 4, async (p) => {
    const c = cur[p.school.id] || {}
    try { await api('PUT', '/mail/school-contacts', { school_id: p.school.id, email: p.email, name: c.name || '', phone: c.phone || '' }); ok++ }
    catch (e) { fails.push(`${p.row.name}: ${e.message}`) }
  })
  const after = (await api('GET', '/mail/school-contacts'))?.contacts || {}
  const verified = todo.filter((p) => (after[p.school.id]?.email || '').trim().toLowerCase() === p.email.toLowerCase()).length
  console.log(`\n[4/4] 저장 ${ok}/${todo.length}곳 · 다시 조회해 확인된 곳 ${verified}/${todo.length}곳`)
  for (const f of fails.slice(0, 20)) console.log('   실패 ' + f)
  console.log(`  되돌리기: node tools/import-school-contacts.mjs --restore "${backupFile}"`)
}

main()
  .catch((e) => { console.error('\n[오류] ' + e.message) })
  .finally(() => rl.close())
