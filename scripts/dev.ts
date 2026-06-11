// One-command local dev orchestrator for Eudaimonia.
//
// Starts the Go backend and the Vite web app together, after checking that the
// prerequisites and ports are available, and verifies the web host can reach
// the backend. Run via `make dev` (or `node scripts/dev.ts`).
//
// Written in TypeScript per the repo's one-scripting-language rule and run
// directly by Node's native type stripping (Node >= 22.6) — no extra runtime.

import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createConnection } from 'node:net'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '..')
const backendDir = resolve(repoRoot, 'backend')
const webDir = resolve(repoRoot, 'web')

const BACKEND_PORT = Number(process.env.PORT ?? 8080)
const WEB_PORT = Number(process.env.WEB_PORT ?? 5173)

// --- helpers ---------------------------------------------------------------

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`)
  process.exit(1)
}

function hasCommand(cmd: string): boolean {
  // cmd is a fixed literal ('go' / 'npm'); no untrusted input is interpolated.
  const res =
    process.platform === 'win32'
      ? spawnSync('where', [cmd], { stdio: 'ignore' })
      : spawnSync('sh', ['-c', `command -v ${cmd}`], { stdio: 'ignore' })
  return res.status === 0
}

function portInUse(port: number): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const socket = createConnection({ host: '127.0.0.1', port })
    socket.setTimeout(500)
    socket.once('connect', () => {
      socket.destroy()
      resolvePromise(true)
    })
    const notInUse = () => {
      socket.destroy()
      resolvePromise(false)
    }
    socket.once('timeout', notInUse)
    socket.once('error', notInUse)
  })
}

function waitForPort(port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolvePromise) => {
    const attempt = () => {
      const socket = createConnection({ host: '127.0.0.1', port })
      socket.setTimeout(500)
      socket.once('connect', () => {
        socket.destroy()
        resolvePromise(true)
      })
      const retry = () => {
        socket.destroy()
        if (Date.now() > deadline) {
          resolvePromise(false)
        } else {
          setTimeout(attempt, 250)
        }
      }
      socket.once('timeout', retry)
      socket.once('error', retry)
    }
    attempt()
  })
}

// --- preflight -------------------------------------------------------------

async function preflight(): Promise<void> {
  const missing: string[] = []
  if (!hasCommand('go')) missing.push('go (https://go.dev/dl/)')
  if (!hasCommand('npm')) missing.push('npm / node (https://nodejs.org/)')
  if (missing.length > 0) {
    fail(`Missing prerequisite(s):\n  - ${missing.join('\n  - ')}\nInstall them and re-run \`make dev\`.`)
  }

  if (!existsSync(resolve(webDir, 'node_modules'))) {
    fail(`Web dependencies are not installed (web/node_modules missing).\nRun \`make install\` (or \`cd web && npm install\`) first, then \`make dev\`.`)
  }

  if (await portInUse(BACKEND_PORT)) {
    fail(`Backend port ${BACKEND_PORT} is already in use.\nStop whatever is using it, or set PORT to a free port: \`PORT=8090 make dev\`.`)
  }
  if (await portInUse(WEB_PORT)) {
    fail(`Web port ${WEB_PORT} is already in use.\nStop whatever is using it, or set WEB_PORT to a free port: \`WEB_PORT=5180 make dev\`.`)
  }
}

// --- process management ----------------------------------------------------

const children: ChildProcess[] = []
let shuttingDown = false

function shutdown(code: number): void {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM')
    }
  }
  process.exit(code)
}

function start(name: string, command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): ChildProcess {
  const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'inherit', 'inherit'] })
  children.push(child)
  child.on('exit', (code, signal) => {
    if (shuttingDown) return
    console.error(`\n✖ ${name} exited unexpectedly (code=${code ?? 'null'}, signal=${signal ?? 'null'}). Shutting down the dev stack.`)
    shutdown(1)
  })
  child.on('error', (err) => {
    if (shuttingDown) return
    console.error(`\n✖ failed to start ${name}: ${err.message}`)
    shutdown(1)
  })
  return child
}

// --- main ------------------------------------------------------------------

async function main(): Promise<void> {
  await preflight()

  process.on('SIGINT', () => shutdown(0))
  process.on('SIGTERM', () => shutdown(0))

  console.log(`▸ starting backend  (go run ./cmd/api)  on :${BACKEND_PORT}`)
  start('backend', 'go', ['run', './cmd/api'], backendDir, { ...process.env, PORT: String(BACKEND_PORT) })

  console.log(`▸ starting web      (npm run dev)       on :${WEB_PORT}`)
  start('web', 'npm', ['run', 'dev', '--', '--port', String(WEB_PORT), '--strictPort'], webDir, {
    ...process.env,
  })

  const backendUp = await waitForPort(BACKEND_PORT, 20_000)
  if (!backendUp) {
    fail(`Backend did not become reachable on :${BACKEND_PORT} within 20s.`)
  }
  console.log(`✔ web host can reach backend on :${BACKEND_PORT}`)
  console.log(`\nDev stack is up. Web: http://localhost:${WEB_PORT}  ·  Backend: tcp://localhost:${BACKEND_PORT}`)
  console.log('Press Ctrl-C to stop both.\n')
}

main().catch((err) => {
  console.error(err)
  shutdown(1)
})
