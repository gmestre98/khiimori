import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerServiceWorker } from './registerSW'

// Build a fake ServiceWorkerRegistration with controllable worker states.
function makeReg(
  overrides: Partial<{
    waiting: ServiceWorker | null
    installing: ServiceWorker | null
    periodicSync: unknown
  }> = {},
) {
  const listeners: Record<string, ((e: unknown) => void)[]> = {}
  return {
    waiting: overrides.waiting ?? null,
    installing: overrides.installing ?? null,
    ...(overrides.periodicSync ? { periodicSync: overrides.periodicSync } : {}),
    addEventListener: (t: string, fn: (e: unknown) => void) => {
      ;(listeners[t] ??= []).push(fn)
    },
    _emit: (t: string, e: unknown = {}) => listeners[t]?.forEach((fn) => fn(e)),
  }
}

// makePeriodicSync builds a fake PeriodicSyncManager with controllable tags.
function makePeriodicSync(existingTags: string[] = []) {
  return {
    register: vi.fn().mockResolvedValue(undefined),
    getTags: vi.fn().mockResolvedValue(existingTags),
  }
}

// Build a fake ServiceWorker (installing/waiting).
function makeWorker(initialState: string = 'installing') {
  const listeners: Record<string, ((e: unknown) => void)[]> = {}
  const w = {
    state: initialState,
    postMessage: vi.fn(),
    addEventListener: (t: string, fn: (e: unknown) => void) => {
      ;(listeners[t] ??= []).push(fn)
    },
    _setState: (s: string) => {
      w.state = s
      listeners['statechange']?.forEach((fn) => fn({}))
    },
  }
  return w
}

function setServiceWorker(value: unknown) {
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value })
}

function clearServiceWorker() {
  delete (navigator as unknown as Record<string, unknown>).serviceWorker
}

// setPermissions stubs navigator.permissions.query to resolve the given state
// (or reject when `throws` is set, exercising the can't-tell fallback).
function setPermissions(state: PermissionState | null, throws = false) {
  const query = throws
    ? vi.fn().mockRejectedValue(new Error('unsupported name'))
    : vi.fn().mockResolvedValue({ state })
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: { query },
  })
}

function clearPermissions() {
  delete (navigator as unknown as Record<string, unknown>).permissions
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  clearServiceWorker()
  clearPermissions()
})

describe('registerServiceWorker', () => {
  it('no-ops in development', async () => {
    const register = vi.fn()
    setServiceWorker({ register, addEventListener: () => {} })
    expect(await registerServiceWorker()).toBeNull()
    expect(register).not.toHaveBeenCalled()
  })

  it('registers /sw.js at scope / in a production build', async () => {
    vi.stubEnv('PROD', true)
    const reg = makeReg()
    setServiceWorker({
      register: vi.fn().mockResolvedValue(reg),
      addEventListener: vi.fn(),
    })
    expect(await registerServiceWorker()).toBe(reg)
  })

  it('returns null and logs when registration fails', async () => {
    vi.stubEnv('PROD', true)
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    setServiceWorker({
      register: vi.fn().mockRejectedValue(new Error('nope')),
      addEventListener: vi.fn(),
    })
    expect(await registerServiceWorker()).toBeNull()
    expect(error).toHaveBeenCalled()
  })

  it('returns null when browser lacks service-worker support', async () => {
    vi.stubEnv('PROD', true)
    clearServiceWorker()
    expect(await registerServiceWorker()).toBeNull()
  })
})

describe('update handling (S5)', () => {
  it('applies an already-waiting worker immediately on registration', async () => {
    vi.stubEnv('PROD', true)
    const waiting = makeWorker('installed')
    const reg = makeReg({ waiting: waiting as unknown as ServiceWorker })
    const ccListeners: (() => void)[] = []
    setServiceWorker({
      register: vi.fn().mockResolvedValue(reg),
      addEventListener: (t: string, fn: () => void) => {
        if (t === 'controllerchange') ccListeners.push(fn)
      },
    })
    await registerServiceWorker()
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
  })

  it('applies a newly-installed update when it reaches "installed" state', async () => {
    vi.stubEnv('PROD', true)
    const worker = makeWorker('installing')
    const reg = makeReg({ installing: worker as unknown as ServiceWorker })
    setServiceWorker({
      register: vi.fn().mockResolvedValue(reg),
      addEventListener: vi.fn(),
    })
    await registerServiceWorker()

    // Simulate updatefound firing with the installing worker.
    ;(reg as unknown as { _emit: (t: string, e?: unknown) => void })._emit('updatefound')

    // Worker reaches 'installed' state and reg.waiting is set.
    ;(reg as unknown as { waiting: unknown }).waiting = worker
    worker._setState('installed')

    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
  })

  it('does NOT reload on first install (no prior controller)', async () => {
    vi.stubEnv('PROD', true)
    const reg = makeReg()
    const ccListeners: (() => void)[] = []
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    setServiceWorker({
      controller: null, // no prior controller → first install
      register: vi.fn().mockResolvedValue(reg),
      addEventListener: (t: string, fn: () => void) => {
        if (t === 'controllerchange') ccListeners.push(fn)
      },
    })
    await registerServiceWorker()
    // Simulate controllerchange (first install / clients.claim()).
    ccListeners.forEach((fn) => fn())
    expect(reload).not.toHaveBeenCalled()
  })

  it('reloads on controllerchange when an update replaces an existing controller', async () => {
    vi.stubEnv('PROD', true)
    const reg = makeReg()
    const ccListeners: (() => void)[] = []
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    setServiceWorker({
      controller: { postMessage: vi.fn() } as unknown as ServiceWorker, // had prior controller
      register: vi.fn().mockResolvedValue(reg),
      addEventListener: (t: string, fn: () => void) => {
        if (t === 'controllerchange') ccListeners.push(fn)
      },
    })
    await registerServiceWorker()
    ccListeners.forEach((fn) => fn())
    expect(reload).toHaveBeenCalled()
  })

  it('calls onUpdateReady before posting SKIP_WAITING', async () => {
    vi.stubEnv('PROD', true)
    const waiting = makeWorker('installed')
    const reg = makeReg({ waiting: waiting as unknown as ServiceWorker })
    setServiceWorker({
      register: vi.fn().mockResolvedValue(reg),
      addEventListener: vi.fn(),
    })
    const onUpdateReady = vi.fn()
    await registerServiceWorker(onUpdateReady)
    expect(onUpdateReady).toHaveBeenCalledBefore(waiting.postMessage)
  })
})

describe('periodic background refresh', () => {
  it('registers the refresh tag when supported and permission granted', async () => {
    vi.stubEnv('PROD', true)
    const periodicSync = makePeriodicSync()
    const reg = makeReg({ periodicSync })
    setPermissions('granted')
    setServiceWorker({
      register: vi.fn().mockResolvedValue(reg),
      addEventListener: vi.fn(),
    })
    await registerServiceWorker()
    await vi.waitFor(() => expect(periodicSync.register).toHaveBeenCalled())
    expect(periodicSync.register).toHaveBeenCalledWith('khiimori-refresh', {
      minInterval: 12 * 60 * 60 * 1000,
    })
  })

  it('does not register when the permission is not granted', async () => {
    vi.stubEnv('PROD', true)
    const periodicSync = makePeriodicSync()
    const reg = makeReg({ periodicSync })
    setPermissions('denied')
    setServiceWorker({
      register: vi.fn().mockResolvedValue(reg),
      addEventListener: vi.fn(),
    })
    await registerServiceWorker()
    // Give any pending microtasks a chance to (not) call register.
    await vi.waitFor(() => expect(periodicSync.getTags).not.toHaveBeenCalled())
    expect(periodicSync.register).not.toHaveBeenCalled()
  })

  it('skips re-registering when the tag already exists', async () => {
    vi.stubEnv('PROD', true)
    const periodicSync = makePeriodicSync(['khiimori-refresh'])
    const reg = makeReg({ periodicSync })
    setPermissions('granted')
    setServiceWorker({
      register: vi.fn().mockResolvedValue(reg),
      addEventListener: vi.fn(),
    })
    await registerServiceWorker()
    await vi.waitFor(() => expect(periodicSync.getTags).toHaveBeenCalled())
    expect(periodicSync.register).not.toHaveBeenCalled()
  })

  it('registers anyway when the permission name is unqueryable', async () => {
    vi.stubEnv('PROD', true)
    const periodicSync = makePeriodicSync()
    const reg = makeReg({ periodicSync })
    setPermissions(null, /* throws */ true)
    setServiceWorker({
      register: vi.fn().mockResolvedValue(reg),
      addEventListener: vi.fn(),
    })
    await registerServiceWorker()
    await vi.waitFor(() => expect(periodicSync.register).toHaveBeenCalled())
  })

  it('is a no-op when Periodic Background Sync is unsupported (e.g. iOS)', async () => {
    vi.stubEnv('PROD', true)
    const reg = makeReg() // no periodicSync on the registration
    setPermissions('granted')
    const query = (navigator.permissions as unknown as { query: ReturnType<typeof vi.fn> }).query
    setServiceWorker({
      register: vi.fn().mockResolvedValue(reg),
      addEventListener: vi.fn(),
    })
    await registerServiceWorker()
    // Unsupported path returns before ever touching permissions.
    await vi.waitFor(() => expect(query).not.toHaveBeenCalled())
  })
})
