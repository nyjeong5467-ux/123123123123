// ============================================================================
// 날짜별 수정이력 폴더 만들기 — [147]
//
// git 기록(커밋)을 날짜별 폴더로 정리한다. 코드는 그대로 두고 '기록'만 정리.
//   docs/수정이력/README.md              ← 날짜 목차(날짜·건수·주요 내용)
//   docs/수정이력/2026-10-22/README.md   ← 그날 올린 작업(제목·시각·작성자·커밋·바뀐 파일)
// 날짜는 한국 시간(KST) 기준. 매번 git 기록 전체로 다시 만들기 때문에 동료 커밋도 함께 정리된다.
//
// 실행: node tools/changelog-by-date.mjs           (단독 실행 — 폴더만 갱신, 커밋은 하지 않음)
//       auto-push.mjs 가 커밋 직전에 자동 호출 → 이번 업로드 내용도 그날 폴더에 함께 기록
// ============================================================================
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT_DEFAULT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const LOG_DIR = path.join('docs', '수정이력')
const STATUS = { A: '추가', M: '수정', D: '삭제', R: '이름변경', C: '복사', T: '수정' }

const kst = (iso) => {
  const d = new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString()
  return { day: d.slice(0, 10), time: d.slice(11, 16) }
}
const isLogPath = (p) => p.replace(/\\/g, '/').startsWith('docs/수정이력/')

function readCommits(git) {
  const SEP = '\u001e'
  let out = ''
  try {
    out = git(['log', '--no-color', '--name-status', `--format=${SEP}%H%x1f%h%x1f%aI%x1f%an%x1f%P%x1f%s`])
  } catch { return [] }
  return out.split(SEP).filter((b) => b.trim()).map((block) => {
    const [head, ...rest] = block.split('\n')
    const [hash, short, date, author, parents, subject] = head.split('\x1f')
    const files = rest.map((l) => l.trim()).filter(Boolean).map((l) => {
      const [st, ...ps] = l.split('\t')
      return { st: STATUS[st[0]] || st, path: ps[ps.length - 1] }
    }).filter((f) => f.path && !isLogPath(f.path))
    // 도구 이름이 들어간 옛 커밋 제목([135])은 수정이력에 그대로 옮기지 않는다.
    const clean = (subject || '').replace(/\s*Claude\s*/gi, ' ').replace(/\s{2,}/g, ' ').trim()
    return { hash, short, ...kst(date), author, merge: (parents || '').trim().split(' ').length > 1, subject: clean, files }
  })
}

/** git status --porcelain → 이번에 올릴 파일 목록 */
export function pendingFiles(git) {
  const out = git(['status', '--porcelain', '-uall'])
  return out.split('\n').filter(Boolean).map((l) => {
    // 앞 공백이 잘린 첫 줄(' M a' → 'M a')도 처리
    const m = l.match(/^([ MADRCTU?!]{1,2})\s+(.*)$/)
    if (!m) return { st: '수정', path: '' }
    const xy = m[1]
    const p = m[2].split(' -> ').pop().replace(/^"|"$/g, '')
    const c = xy.includes('?') || xy.includes('A') ? 'A' : xy.includes('D') ? 'D' : xy.includes('R') ? 'R' : 'M'
    return { st: STATUS[c], path: p }
  }).filter((f) => !isLogPath(f.path))
}

const html = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') // '<날짜>' 같은 표기가 태그로 사라지지 않게
const esc = (s) => html(s).replace(/\|/g, '\\|')

/**
 * docs/수정이력 을 다시 만든다.
 * @param {{ root?: string, git: Function, pending?: { subject: string, author?: string, files: {st:string,path:string}[] } }} o
 * @returns {string[]} 새로 쓰거나 바뀐 파일 경로
 */
export function buildChangelog({ root = ROOT_DEFAULT, git, pending } = {}) {
  const commits = readCommits(git)
  if (pending) {
    const now = kst(new Date().toISOString())
    commits.unshift({ hash: '', short: '(이번 업로드)', ...now, author: pending.author || '', merge: false, subject: pending.subject, files: pending.files })
  }
  const byDay = new Map()
  for (const c of commits) {
    if (!byDay.has(c.day)) byDay.set(c.day, [])
    byDay.get(c.day).push(c)
  }
  const dir = path.join(root, LOG_DIR)
  fs.mkdirSync(dir, { recursive: true })
  const written = []
  const put = (p, text) => {
    const old = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null
    if (old === text) return
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, text, 'utf8')
    written.push(p)
  }

  const days = [...byDay.keys()].sort().reverse()
  for (const day of days) {
    const list = byDay.get(day) // 최신순
    const lines = [`# ${day} 수정이력`, '', `총 ${list.length}건 · 최신순 · 한국 시간 기준`, '', '[← 날짜 목차](../README.md)', '']
    for (const c of list) {
      lines.push(`## ${c.time} — ${html(c.subject)}`, '')
      lines.push(`- 커밋: \`${c.short}\`${c.author ? ` · 작성: ${c.author}` : ''}${c.merge ? ' · 병합(동료 작업 합치기)' : ''}`)
      if (c.files.length) {
        lines.push(`- 바뀐 파일 ${c.files.length}개:`)
        for (const f of c.files.slice(0, 40)) lines.push(`  - (${f.st}) \`${f.path}\``)
        if (c.files.length > 40) lines.push(`  - … 외 ${c.files.length - 40}개`)
      }
      lines.push('')
    }
    put(path.join(dir, day, 'README.md'), lines.join('\n'))
  }

  const idx = [
    '# 수정이력 (날짜별)', '',
    'git에 올린 작업을 날짜별 폴더로 정리한 기록입니다. 코드는 원래 위치에 있고, 여기는 기록만 모읍니다.',
    '업로드(auto-push)할 때마다 자동으로 갱신됩니다. 직접 갱신: `node tools/changelog-by-date.mjs`', '',
    '| 날짜 | 건수 | 주요 내용 |', '|---|---:|---|',
    ...days.map((d) => {
      const l = byDay.get(d)
      const tops = l.slice(0, 3).map((c) => esc(c.subject.length > 50 ? c.subject.slice(0, 50) + '…' : c.subject)).join('<br>')
      return `| [${d}](./${d}/README.md) | ${l.length} | ${tops}${l.length > 3 ? '<br>…' : ''} |`
    }), '',
  ]
  put(path.join(dir, 'README.md'), idx.join('\n'))
  return written
}

// 단독 실행
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const git = (args) => execFileSync('git', ['-c', 'core.quotepath=false', ...args], { cwd: ROOT_DEFAULT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim()
  const w = buildChangelog({ git })
  console.log(`[changelog] ${LOG_DIR} 갱신 — ${w.length}개 파일`)
}
