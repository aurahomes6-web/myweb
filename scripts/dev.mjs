/**
 * Root dev launcher: starts the client and server dev servers concurrently.
 *
 * Cross-platform (Windows + POSIX), zero-dependency. Launched by `npm run dev`,
 * it runs the npm CLI directly with the current Node executable (no cmd.exe /
 * sh needed), so it works even in restricted Windows shells. Child output is
 * piped and forwarded to this terminal (safer than handle inheritance in some
 * Windows sessions), and the full process trees are torn down when either
 * server exits or Ctrl+C is pressed.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const isWin = process.platform === 'win32'

// The npm CLI entry npm points at when it runs us (set by npm itself).
const npmCli = process.env.npm_execpath

if (!npmCli) {
  console.error('[dev] Not launched through npm (npm_execpath is unset). Use `npm run dev` from the repo root.')
  process.exit(1)
}

// Candidate ways to reach the same Node runtime. Some Windows shells/sessions
// fail to spawn the reported absolute path (fs redirection / symlinks), so we
// fall back through the resolved path and finally a PATH lookup.
function nodeCandidates() {
  const set = new Set()
  try {
    set.add(fs.realpathSync(process.execPath))
  } catch {
    /* ignore */
  }
  set.add(process.execPath)
  set.add('node')
  return [...set]
}

const procs = []

function spawnWithFallback(name, cwd, exes) {
  const entry = { name, child: null, done: false }
  procs.push(entry)

  const tryNext = (index) => {
    if (entry.done) return
    if (index >= exes.length) {
      console.error(`[dev] unable to start ${name} — all node candidates failed.`)
      stopAll(1)
      return
    }

    const exe = exes[index]
    const child = spawn(exe, [npmCli, 'run', 'dev'], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: false,
    })

    child.stdout.on('data', (chunk) => process.stdout.write(chunk))
    child.stderr.on('data', (chunk) => process.stderr.write(chunk))

    child.on('error', (err) => {
      console.error(`[dev] spawn ${name} via "${exe}" failed: ${err.message}`)
      entry.child = null
      tryNext(index + 1)
    })
    child.on('exit', (code) => {
      if (entry.child !== child) return
      entry.done = true
      console.log(`[dev] ${name} exited (code ${code})`)
      stopAll(code ?? 1)
    })

    entry.child = child
    console.log(`[dev] starting ${name} on Node + npm CLI (pid ${child.pid})`)
  }

  tryNext(0)
}

function taskkillTree(pid) {
  const taskkill = process.env.SystemRoot
    ? path.join(process.env.SystemRoot, 'System32', 'taskkill.exe')
    : 'taskkill'
  const proc = spawn(taskkill, ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' })
  proc.on('error', () => {
    /* best-effort tree kill; the OS may have already reaped it */
  })
}

function stopAll(exitCode = 1) {
  for (const { name, child } of procs) {
    if (!child || child.exitCode !== null || child.killed) continue
    if (isWin) {
      taskkillTree(child.pid)
    } else {
      child.kill('SIGTERM')
    }
    console.log(`[dev] stopped ${name} (pid ${child.pid})`)
  }
  // Give taskkill a tick to sweep the trees before exiting.
  setTimeout(() => process.exit(exitCode), isWin ? 300 : 0)
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => stopAll(0))
}

const exes = nodeCandidates()
spawnWithFallback('DEV(client)', path.join(root, 'client'), exes)
spawnWithFallback('DEV(server)', path.join(root, 'server'), exes)