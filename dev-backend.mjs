// ============================================================================
// web-hq 임시 백엔드 (dev-backend) — mock-server.mjs 위에 얹는 "보강 계층"
//
// 실행:  node dev-backend.mjs   (start.bat이 자동 실행 · Node 18+ · 의존성 없음)
//
// 구조
//   브라우저 → vite(5173) → /api 프록시 → [dev-backend :3001] ─┬─ 보강 경로: 여기서 직접 응답
//                                                              └─ 나머지: mock-server(:3002)로 전달
//   - mock-server.mjs는 한 글자도 수정하지 않고 같은 프로세스 안에서 포트만 3002로 바꿔 띄운다.
//   - vite.config.ts / api.ts / auth.tsx(계약 파일)도 그대로 — 프록시 대상 3001 유지.
//   - 운영 백엔드에는 있지만 목업에 없던 경로만 여기서 흉내 낸다. 목업 데이터 자체는 건드리지 않음.
//
// 보강 경로
//   GET  /inspections/:id/report.pdf        완성 점검표 PDF (결재란·항목·기타의견·사진대지·서명)
//                                           → 실제 화면 CSS(src/styles/inspectsheet.css)로 HTML을 만들고
//                                             PC의 Edge/Chrome 헤드리스로 PDF 인쇄
//   GET  /inspections/summary                점검 목록 요약(학교별, items/followups 제외)
//   POST /inspections/:id/request-eduoffice  교육청 재전송 대기 등록(흉내)
//   POST /inspections/:id/sign               목업 서명 + 웹 서명패드 이미지 보관(sign_<id>.png)
//   GET  /files/inspection/download?path=    보관한 서명 이미지 내려주기
//   GET  /inspections(?school_id=)           목업 응답에 보관한 서명 image_ref를 채워서 전달
//
// 데이터는 전부 메모리 — 서버를 재시작하면 목업과 함께 초기화된다.
// PDF용 브라우저 경로를 직접 지정하려면 환경변수 PDF_BROWSER=경로
// ============================================================================
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const PORT = 3001
const MOCK_PORT = 3002
const ROOT = path.dirname(fileURLToPath(import.meta.url))

// ---- 1) mock-server.mjs를 같은 프로세스에서 3002 포트로 기동 (파일 수정 없이 listen 포트만 치환) ----
const origListen = http.Server.prototype.listen
http.Server.prototype.listen = function (port, ...rest) {
  if (port === PORT) port = MOCK_PORT
  return origListen.call(this, port, ...rest)
}
await import('./mock-server.mjs')
http.Server.prototype.listen = origListen

// ---- 공용 헬퍼 ----
const MOCK = `http://127.0.0.1:${MOCK_PORT}/api/v1`
async function mock(method, p, body) {
  const r = await fetch(MOCK + p, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!r.ok) throw Object.assign(new Error(`mock ${r.status} ${method} ${p}`), { status: r.status })
  const t = await r.text()
  return t ? JSON.parse(t) : null
}
function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(obj))
}
async function readBody(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  return Buffer.concat(chunks)
}
function proxy(req, res, bodyBuf) {
  const up = http.request(
    { host: '127.0.0.1', port: MOCK_PORT, method: req.method, path: req.url, headers: req.headers },
    (r) => { res.writeHead(r.statusCode || 502, r.headers); r.pipe(res) },
  )
  up.on('error', (e) => sendJson(res, 502, { error: { message: 'dev-backend: 목업 연결 실패 ' + e.message } }))
  if (bodyBuf) up.end(bodyBuf)
  else req.pipe(up)
}
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const dateOf = (r) => String(r.submitted_at || r.signed_at || r.signatures?.[0]?.signed_at || r.created_at || '').slice(0, 10)

// ---- 웹 서명패드 이미지 보관소 (목업은 sign_image_b64를 버리므로 여기서 보관) ----
const signImages = new Map() // image_ref → base64 PNG
const signRefOf = (iid) => `web-sign/sign_${iid}.png`
function withSignRefs(list) {
  if (!Array.isArray(list)) return list
  for (const it of list) {
    const ref = signRefOf(it.id)
    if (!signImages.has(ref)) continue
    for (const s of it.signatures || []) if (!s.image_ref) s.image_ref = ref
  }
  return list
}

// ---- 점검표 문항 — 화면 코드(InspectionForm.tsx)의 Q_* 배열을 그대로 읽어 사용 (단일 소스) ----
function loadPartDefs() {
  const src = fs.readFileSync(path.join(ROOT, 'src/pages/InspectionForm.tsx'), 'utf8')
  const Q = {}
  for (const m of src.matchAll(/^const (Q_[A-Z]+)\s*=\s*(\[.*\])\s*$/gm)) {
    try { Q[m[1]] = new Function(`return ${m[2]}`)() } catch { /* 형식이 바뀌면 해당 공정은 저장 항목만 표시 */ }
  }
  return [
    { key: 'catering', label: '급식', name: '급식종사자', q: Q.Q_GS || null },
    { key: 'night_duty', label: '당직', name: '당직업무', q: Q.Q_DJ || null },
    { key: 'commute', label: '통학', name: '통학보조', q: Q.Q_TH || null },
    { key: 'facility', label: '시설', name: '시설관리', q: Q.Q_SI || null },
    { key: 'cleaning', label: '미화', name: '미화원', q: Q.Q_MI || null },
  ]
}
// ---- 확인자 규칙 — src/lib/approval.ts와 동일 (학교/기관 구분) [123] ----
function orgKindOf(org) {
  if (org?.org_kind && /교육청|기관/.test(org.org_kind)) return 'agency'
  const name = String(org?.name ?? '').replace(/\(.*?\)/g, '').replace(/\s+/g, '')
  if (!name) return 'school'
  return /(학교|유치원)$/.test(name) ? 'school' : 'agency'
}
function defaultApproval(org) {
  const kind = orgKindOf(org)
  const t = kind === 'school' ? ['담당자', '행정실장', '교장'] : ['담당자', '팀장', '과장']
  return [{ title: t[0], name: '' }, { title: t[1], name: '' }, { title: t[2], name: kind === 'school' ? String(org?.principal ?? '').trim() : '' }]
}
const AGENCY_TITLE = { 안전담당자: '담당자', 행정실장: '팀장', 행정주무관: '담당자', 교감: '팀장', 교장: '과장', 원감: '팀장', 원장: '과장' }
const SCHOOL_HEAD = new Set(['교장', '원장'])
function titleFor(org, title) {
  const t = String(title ?? '').trim()
  if (orgKindOf(org) === 'agency') return AGENCY_TITLE[t] ?? t
  return t === '안전담당자' ? '담당자' : t
}
function normalizeApproval(steps, org) {
  const agency = orgKindOf(org) === 'agency'
  const head = String(org?.principal ?? '').trim()
  const clean = (steps || [])
    .map((s) => ({ title: String(s?.title ?? '').trim(), name: String(s?.name ?? '').trim() }))
    .filter((s) => s.title || s.name)
    .map((s) => ({ title: titleFor(org, s.title), name: agency && SCHOOL_HEAD.has(s.title) && (!s.name || s.name === head) ? '' : s.name }))
    .slice(0, 3)
  return clean.length ? clean : defaultApproval(org)
}
const PART_ORDER = ['catering', 'night_duty', 'commute', 'facility', 'cleaning']
const RES_COL = { good: 0, ok: 0, poor: 1, fix: 1, na: 2 }

// ---- 완성 점검표 HTML (InspectionSheetBody와 같은 마크업·클래스 → 실제 CSS 재사용) ----
async function buildSheetHtml(iid) {
  const all = await mock('GET', '/inspections')
  const target = all.find((x) => x.id === iid)
  if (!target) throw Object.assign(new Error('점검을 찾을 수 없습니다: ' + iid), { status: 404 })
  const sid = target.school_id
  const [schools, extrasDoc, approvalRes] = await Promise.all([
    mock('GET', '/schools'),
    mock('GET', '/ops/docs/inspection-extras').catch(() => ({ doc: {} })),
    mock('GET', `/schools/${sid}/approval-line`).catch(() => ({ steps: [] })),
  ])
  const school = schools.find((s) => s.id === sid) || {}
  const extras = Array.isArray(extrasDoc?.doc?.[sid]) ? extrasDoc.doc[sid] : []
  const extra = extras.find((e) => Array.isArray(e?.ids) && e.ids.includes(iid))
  // 점검표 1장 = 부가정보에 묶인 ids, 없으면 같은 학교·같은 점검일
  const ids = new Set(extra?.ids?.length ? extra.ids : all.filter((x) => x.school_id === sid && x.status !== 'draft' && dateOf(x) === dateOf(target)).map((x) => x.id))
  ids.add(iid)
  const parts = all.filter((x) => ids.has(x.id))
  const PARTDEF = loadPartDefs()

  // 결재란 = 확인자 (src/lib/approval.ts normalizeApproval + InspectionSheetBody 규칙과 동일) [123]
  //  학교: 담당자 → 행정실장 → 교장 / 기관(교육청 등): 담당자 → 팀장 → 과장
  const line = normalizeApproval(approvalRes?.steps, school)
  const primary = Math.max(0, line.findIndex((s) => s.title.includes('담당')))
  const sigs = parts.flatMap((p) => p.signatures || [])
  const mainSig = sigs.find((s) => s.signer || s.image_ref)
  const finalSigner = extra?.signer || mainSig?.signer || ''
  const imgOf = (ref) => (ref && signImages.has(ref) ? `data:image/png;base64,${signImages.get(ref)}` : '')
  const cells = line.map((st) => ({ title: st.title, name: '', img: '' }))
  const mainImg = imgOf(sigs.map((s) => s.image_ref).find(Boolean)) || imgOf([iid, ...parts.map((x) => x.id)].map(signRefOf).find((r) => signImages.has(r)))
  if (finalSigner || mainImg) cells[primary] = { ...cells[primary], name: finalSigner, img: mainImg }
  for (const ln of extra?.approval_lines || []) {
    if (!ln.signer && !ln.image_ref && !ln.image_data) continue
    const lt = titleFor(school, ln.title || '') // [126] 기관: 행정실장→팀장·교장→과장
    const cell = { title: lt, name: ln.signer || '', img: ln.image_data || imgOf(ln.image_ref) }
    // [129] 직책 없는 '확인자' 서명은 별도 칸을 만들지 않음 — 담당자 칸이 비었을 때만 채움 (InspectionSheetView와 동일)
    if (!lt || lt === '확인자') {
      const pc = cells[primary]
      if (pc && !(pc.name || pc.img)) cells[primary] = { ...cell, title: pc.title }
      continue
    }
    const k = cells.findIndex((c, i) => c.title === lt && !(c.name || c.img) && !(i === primary && finalSigner))
    if (k >= 0) cells[k] = cell
    else if (!cells.some((c) => c.title === cell.title)) cells.push(cell)
  }

  const info = extra?.info || {}
  const signedAt = sigs.map((s) => String(s.signed_at || '').slice(0, 10)).find(Boolean) || ''
  const date = dateOf(target)
  const included = new Set(parts.map((p) => p.part))
  const targets = extra?.targets?.length ? new Set(extra.targets) : included
  const ordered = PART_ORDER.filter((k) => included.has(k)).map((k) => {
    const items = parts.filter((p) => p.part === k).flatMap((p) => p.items || [])
    return { part: k, items }
  })
  const ck = (white) => `<svg class="inss-ck" viewBox="0 0 16 16" width="${white ? 12 : 17}" height="${white ? 12 : 17}"><path d="M3 8.4 6.4 11.6 13 4.6" fill="none" stroke="${white ? '#fff' : '#333'}" stroke-width="${white ? 2 : 1.5}" stroke-linecap="round" stroke-linejoin="round"/></svg>`

  const partHtml = ordered.map((p) => {
    const def = PARTDEF.find((d) => d.key === p.part)
    const saved = new Map(p.items.map((it) => [it.code, it]))
    const rows = def?.q
      ? def.q.map((question, i) => {
          const [main, sub] = question.split('||')
          const code = `${def.label}-${i + 1}`
          const it = saved.get(code)
          return { code, main, sub, result: it?.result ?? null, remark: it?.remark ?? '' }
        })
      : p.items.map((it) => ({ code: it.code, main: it.label, sub: '', result: it.result ?? null, remark: it.remark ?? '' }))
    for (const it of p.items) if (!rows.some((r) => r.code === it.code)) rows.push({ code: it.code, main: it.label, sub: '', result: it.result ?? null, remark: it.remark ?? '' })
    const body = rows.length
      ? rows.map((r, i) => {
          const col = r.result != null ? RES_COL[r.result] : undefined
          return `<tr><td class="q">${i + 1}. ${esc(r.main)}${r.sub ? `<div class="sub">${esc(r.sub)}</div>` : ''}</td>`
            + `<td class="c">${col === 0 ? ck() : ''}</td><td class="c">${col === 1 ? ck() : ''}</td><td class="c">${col === 2 ? ck() : ''}</td>`
            + `<td class="r"><div class="memo">${esc(r.remark)}</div></td></tr>`
        }).join('')
      : '<tr><td colspan="5" class="q" style="text-align:center;color:#888">점검 항목이 없습니다.</td></tr>'
    return `<div class="inss-part"><div class="inss-sec"><i></i>${esc(def?.name || p.part)}</div>
      <table class="inss-tbl"><colgroup><col class="q"><col class="c"><col class="c"><col class="c"><col class="r"></colgroup>
      <thead><tr><th>점검항목</th><th>양호</th><th>미흡</th><th>해당없음</th><th>비고(보완계획)</th></tr></thead><tbody>${body}</tbody></table></div>`
  }).join('')

  const photos = ordered.flatMap((p) => {
    const def = PARTDEF.find((d) => d.key === p.part)
    return ((def && extra?.photos?.[def.label]) || []).filter((s) => s && (s.name || s.dataUrl || s.caption))
  })
  const photoHtml = photos.length
    ? `<div class="inss-photos">${photos.map((sl) => `<figure class="inss-photo"><div class="img">${sl.dataUrl ? `<img src="${esc(sl.dataUrl)}">` : `<span class="ph">${esc(sl.name || '사진')}</span>`}</div><figcaption>${esc(sl.caption)}</figcaption></figure>`).join('')}</div>`
    : '<div class="inss-empty">등록된 사진이 없습니다.</div>'

  const infoRow = (k, v) => `<label><span>${k}</span><div class="v">${esc(v)}</div></label>`
  // 웹 화면과 같은 CSS를 같은 순서로 — 토큰·전역 리셋(box-sizing·줄간격)·점검표 양식. [121] '보기'와 서식 통일
  const css = ['tokens.css', 'globals.css', 'inspectsheet.css']
    .map((f) => { try { return fs.readFileSync(path.join(ROOT, 'src/styles', f), 'utf8') } catch { return '' } })
    .join('\n')

  const html = `<!doctype html><html lang="ko" data-theme="light"><head><meta charset="utf-8"><title>종사자 안전·보건 점검표</title>
<style>${css}
html,body{margin:0;background:#fff}
@page{size:A4 portrait;margin:12mm 12mm} /* 보기 인쇄([120])와 같은 여백 */
</style></head><body><div class="inss-overlay"><div class="inss-page">
  <div class="inss-head"><h1>종사자 안전·보건 점검표</h1>
    <table class="inss-approve"><tbody>
      <tr><td class="lab" rowspan="2"><span>결</span><span>재</span></td>${cells.map((c) => `<td class="t">${esc(c.title)}</td>`).join('')}</tr>
      <tr>${cells.map((c) => `<td class="sign">${c.img ? `<img src="${esc(c.img)}" alt="서명" class="sgimg">` : c.name ? `<span class="sg">${esc(c.name)}</span>` : ''}</td>`).join('')}</tr>
    </tbody></table></div>
  <div class="inss-sec"><i></i>기본정보</div>
  <div class="inss-info">
    ${infoRow('학교(기관)명', school.name || '')}${infoRow('소속명', info.org)}${infoRow('부서명', info.dept)}
    ${infoRow('직책', info.role)}${infoRow('작성자', info.writer || school.manager || '')}${infoRow('작성일', info.writeDate || signedAt || date)}
    ${infoRow('점검일', info.inspectDate || date)}${infoRow('점검장소', info.place)}${infoRow('재해형태', info.accType)}
  </div>
  <div class="inss-sec"><i></i>점검대상</div>
  <div class="inss-targets">${PART_ORDER.map((k) => `<span class="tg"><i class="bx${targets.has(k) ? ' on' : ''}">${targets.has(k) ? ck(true) : ''}</i>${esc(PARTDEF.find((d) => d.key === k)?.name || k)}</span>`).join('')}</div>
  ${partHtml}
  <div class="inss-sec"><i></i>기타 의견</div>
  <div class="inss-etc">${esc(extra?.etc || '')}</div>
  <div class="inss-sec"><i></i>사진대지</div>
  ${photoHtml}
</div></div></body></html>`
  return { html, schoolName: school.name || '학교' }
}

// ---- HTML → PDF : PC에 설치된 Edge/Chrome 헤드리스 인쇄 (npm 설치 불필요) ----
function findBrowser() {
  const env = process.env
  const list = [
    env.PDF_BROWSER,
    env['ProgramFiles(x86)'] && path.join(env['ProgramFiles(x86)'], 'Microsoft/Edge/Application/msedge.exe'),
    env.ProgramFiles && path.join(env.ProgramFiles, 'Microsoft/Edge/Application/msedge.exe'),
    env.ProgramFiles && path.join(env.ProgramFiles, 'Google/Chrome/Application/chrome.exe'),
    env['ProgramFiles(x86)'] && path.join(env['ProgramFiles(x86)'], 'Google/Chrome/Application/chrome.exe'),
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ]
  return list.find((p) => p && fs.existsSync(p)) || ''
}
function htmlToPdf(html) {
  const exe = findBrowser()
  if (!exe) return Promise.reject(Object.assign(new Error('PDF용 브라우저(Edge/Chrome)를 찾지 못했습니다'), { status: 501 }))
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'webhq-pdf-'))
  const htmlPath = path.join(dir, 'sheet.html')
  const pdfPath = path.join(dir, 'sheet.pdf')
  fs.writeFileSync(htmlPath, html, 'utf8')
  const args = [
    '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    `--user-data-dir=${path.join(dir, 'profile')}`, // 켜져 있는 브라우저와 분리 — 없으면 PDF가 안 만들어짐
    '--no-pdf-header-footer', '--print-to-pdf-no-header', '--virtual-time-budget=3000',
    `--print-to-pdf=${pdfPath}`, pathToFileURL(htmlPath).href,
  ]
  if (process.platform === 'linux') args.unshift('--no-sandbox')
  return new Promise((resolve, reject) => {
    execFile(exe, args, { timeout: 45000, windowsHide: true }, (err) => {
      try {
        if (fs.existsSync(pdfPath) && fs.statSync(pdfPath).size > 0) resolve(fs.readFileSync(pdfPath))
        else reject(err || new Error('PDF 파일이 생성되지 않았습니다'))
      } finally {
        fs.rm(dir, { recursive: true, force: true }, () => {})
      }
    })
  })
}

// ---- 2) 보강 서버 :3001 ----
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const p = url.pathname.replace(/^\/api\/v1/, '') || '/'
  const seg = p.split('/').filter(Boolean)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', '*')
  res.setHeader('Access-Control-Allow-Methods', '*')
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end() }

  try {
    // 완성 점검표 PDF
    if (req.method === 'GET' && seg[0] === 'inspections' && seg[2] === 'report.pdf' && seg.length === 3) {
      const t0 = Date.now()
      const { html, schoolName } = await buildSheetHtml(decodeURIComponent(seg[1]))
      if (url.searchParams.get('format') === 'html') { // 디버그: ?format=html 로 양식 HTML 확인
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(html)
      }
      const pdf = await htmlToPdf(html)
      console.log(`  [dev] GET ${p} → PDF ${Math.round(pdf.length / 1024)}KB (${Date.now() - t0}ms)`)
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Length': pdf.length,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`안전점검표_${schoolName}.pdf`)}`,
      })
      return res.end(pdf)
    }

    // 점검 목록 요약 — 학교별 경량 항목
    if (req.method === 'GET' && p === '/inspections/summary') {
      const all = withSignRefs(await mock('GET', '/inspections'))
      const out = {}
      for (const { items, followups, ...lite } of all) (out[lite.school_id] ||= []).push(lite)
      console.log(`  [dev] GET ${p}`)
      return sendJson(res, 200, out)
    }

    // 점검 목록(원본) — 보관한 웹 서명 image_ref 채워서 전달
    if (req.method === 'GET' && p === '/inspections') {
      return sendJson(res, 200, withSignRefs(await mock('GET', '/inspections' + url.search)))
    }

    // 교육청 재전송 대기 등록(흉내)
    if (req.method === 'POST' && seg[0] === 'inspections' && seg[2] === 'request-eduoffice' && seg.length === 3) {
      console.log(`  [dev] POST ${p}`)
      return sendJson(res, 200, { eduoffice: 'pending' })
    }

    // 서명 — 목업에 기록 + 서명패드 이미지 보관
    if (req.method === 'POST' && seg[0] === 'inspections' && seg[2] === 'sign' && seg.length === 3) {
      const buf = await readBody(req)
      let body = {}
      try { body = JSON.parse(buf.toString() || '{}') } catch { /* 빈 본문 */ }
      const iid = decodeURIComponent(seg[1])
      const out = (await mock('POST', `/inspections/${iid}/sign`, body)) || {}
      if (body.sign_image_b64) {
        const ref = signRefOf(iid)
        signImages.set(ref, body.sign_image_b64)
        out.image_ref = ref
      }
      console.log(`  [dev] POST ${p}${body.sign_image_b64 ? ' (+서명 이미지)' : ''}`)
      return sendJson(res, 200, { status: 'signed', ...out })
    }

    // 보관한 서명 이미지
    if (req.method === 'GET' && p === '/files/inspection/download') {
      const b64 = signImages.get(url.searchParams.get('path') || '')
      if (!b64) return proxy(req, res)
      res.writeHead(200, { 'Content-Type': 'image/png' })
      return res.end(Buffer.from(b64, 'base64'))
    }
  } catch (e) {
    console.error(`  [dev] ${e.status || 500} ${req.method} ${p}`, e.message)
    return sendJson(res, e.status || 500, { error: { message: 'dev-backend: ' + e.message } })
  }

  return proxy(req, res) // 그 외 전부 목업으로
})

server.listen(PORT, () => {
  console.log('  ┌──────────────────────────────────────────────┐')
  console.log('  │  dev-backend(임시 백엔드) :3001 → 목업 :3002   │')
  console.log('  │  보강: 점검표 PDF · 점검 요약 · 재전송 · 서명  │')
  console.log(`  │  PDF 브라우저: ${(findBrowser() ? '찾음' : '없음 (PDF 불가)').padEnd(30)}│`)
  console.log('  └──────────────────────────────────────────────┘')
})
