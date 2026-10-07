// ============================================================================
// 자동 올리기(auto-push) — [135]
//
// 목적: Claude가 이 폴더의 파일을 고친 뒤, 사람이 commit-push.bat을 누르지 않아도 GitHub에 올라가게 한다.
//       (Claude 쪽에는 GitHub에 올릴 권한이 없어서, 이 PC의 git 로그인으로 대신 올린다)
// 동작: 폴더에 push-request.txt (첫 줄부터 = 커밋 메시지) 가 생기면
//         git add -A → commit → fetch → (동료의 새 커밋이 있으면) rebase → push
//       를 실행하고 결과를 push-result.txt 에 남긴다. 요청 파일은 처리 후 삭제.
//       - 강제 푸시(force) 없음. rebase 충돌이면 중단(abort)하고 내 커밋은 그대로 보존.
//       - .gitignore 에 있는 파일(이메일 데이터·백업·임시물)은 올라가지 않는다.
// 실행: start.bat 이 'web-hq auto-push' 창으로 자동 실행 (끄기: off.bat 또는 창 닫기)
//       단독 실행: node tools/auto-push.mjs
// ============================================================================
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REQ = path.join(ROOT, 'push-request.txt')
const RES = path.join(ROOT, 'push-result.txt')
const POLL_MS = 3000

function findGit() {
  const env = process.env
  const cands = [
    'git',
    env.ProgramFiles && path.join(env.ProgramFiles, 'Git', 'cmd', 'git.exe'),
    env['ProgramFiles(x86)'] && path.join(env['ProgramFiles(x86)'], 'Git', 'cmd', 'git.exe'),
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs', 'Git', 'cmd', 'git.exe'),
  ].filter(Boolean)
  try {
    const gd = env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'GitHubDesktop')
    if (gd && fs.existsSync(gd)) {
      for (const d of fs.readdirSync(gd).filter((x) => x.startsWith('app-')).sort().reverse()) {
        cands.push(path.join(gd, d, 'resources', 'app', 'git', 'cmd', 'git.exe'))
      }
    }
  } catch { /* 무시 */ }
  for (const c of cands) {
    try { execFileSync(c, ['--version'], { stdio: 'ignore' }); return c } catch { /* 다음 후보 */ }
  }
  return ''
}
const GIT = findGit()
const git = (args, opts = {}) =>
  execFileSync(GIT, ['-c', 'core.quotepath=false', '-c', 'core.safecrlf=false', ...args], {
    cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, ...opts,
  }).trim()
const now = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' })

function writeResult(obj) {
  const text = [`status: ${obj.status}`, `time: ${now()}`, ...(obj.lines || [])].join('\n') + '\n'
  fs.writeFileSync(RES, text, 'utf8')
  console.log(`[auto-push] ${now()}  ${obj.status}` + (obj.lines?.length ? '\n  ' + obj.lines.join('\n  ') : ''))
}

function handle() {
  // 요청 파일이 다 써질 때까지 잠깐 대기(크기 안정)
  const raw = fs.readFileSync(REQ, 'utf8').replace(/^﻿/, '')
  const msg = raw.split(/\r?\n/).filter((l) => !/^(Co-Authored-By:|Claude-Session:|🤖)/i.test(l.trim())).join('\n').trim()
  fs.rmSync(REQ, { force: true })
  if (!msg) return writeResult({ status: 'ERROR', lines: ['커밋 메시지가 비어 있습니다 (push-request.txt)'] })
  const lines = []
  try {
    if (fs.existsSync(path.join(ROOT, '.git', 'rebase-merge')) || fs.existsSync(path.join(ROOT, '.git', 'rebase-apply'))) {
      return writeResult({ status: 'ERROR', lines: ['진행 중인 rebase가 있어 중단 — 사람이 확인해야 합니다'] })
    }
    const dirty = git(['status', '--porcelain'])
    if (dirty) {
      git(['add', '-A'])
      const tmp = path.join(ROOT, '.git', 'AUTO_PUSH_MSG')
      fs.writeFileSync(tmp, msg + '\n', 'utf8')
      git(['-c', 'i18n.commitEncoding=utf-8', 'commit', '-F', tmp])
      fs.rmSync(tmp, { force: true })
      lines.push('commit: ' + git(['log', '-1', '--format=%h %s']))
    } else {
      lines.push('commit: (새 변경 없음 — 올리지 않은 커밋만 확인)')
    }
    git(['fetch', '-q', 'origin'])
    const behind = Number(git(['rev-list', '--count', 'HEAD..origin/main']) || 0)
    if (behind > 0) {
      try { git(['rebase', 'origin/main']); lines.push(`rebase: 동료의 새 커밋 ${behind}개 위로 옮김`) }
      catch (e) {
        try { git(['rebase', '--abort']) } catch { /* 무시 */ }
        return writeResult({ status: 'CONFLICT', lines: [...lines, '동료와 같은 부분을 수정해 자동으로 합치지 못했습니다. 내 커밋은 PC에 보존됨.', String(e.stderr || e.message).split('\n').slice(0, 6).join(' | ')] })
      }
    }
    const ahead = Number(git(['rev-list', '--count', 'origin/main..HEAD']) || 0)
    if (ahead === 0) return writeResult({ status: 'NOTHING', lines: [...lines, 'GitHub와 이미 같습니다: ' + git(['log', '-1', '--format=%h %s'])] })
    git(['push', 'origin', 'HEAD:main'])
    lines.push(`push: ${ahead}개 커밋 올림`, 'head: ' + git(['log', '-1', '--format=%H %s']))
    writeResult({ status: 'OK', lines })
  } catch (e) {
    writeResult({ status: 'ERROR', lines: [...lines, String(e.stderr || e.message).split('\n').filter(Boolean).slice(0, 8).join(' | ')] })
  }
}

if (!GIT) {
  console.log('[auto-push] git을 찾지 못했습니다. Git 설치 후 다시 실행하세요.')
  process.exit(1)
}
console.log('  ┌──────────────────────────────────────────────┐')
console.log('  │  auto-push 대기 중 — 이 창은 닫지 마세요     │')
console.log('  │  push-request.txt 가 생기면 커밋+푸시 실행   │')
console.log('  └──────────────────────────────────────────────┘')
console.log(`  폴더: ${ROOT}`)
try { console.log('  현재: ' + git(['log', '-1', '--format=%h %s'])) } catch { /* 무시 */ }

let busy = false
let lastSize = -1
setInterval(() => {
  if (busy || !fs.existsSync(REQ)) { lastSize = -1; return }
  let size = 0
  try { size = fs.statSync(REQ).size } catch { return }
  if (size !== lastSize) { lastSize = size; return } // 한 주기 동안 크기가 그대로일 때 처리
  busy = true
  try { handle() } catch (e) { writeResult({ status: 'ERROR', lines: [String(e.message)] }) } finally { busy = false; lastSize = -1 }
}, POLL_MS)
