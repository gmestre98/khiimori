import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PackingValidationError, UnauthorizedError } from './api'
import { enqueue, getAll } from './mutationQueue'
import { isNetworkFailure, QUEUED_EVENT, WriteTimeoutError, writeOrQueue } from './offlineWrite'

vi.mock('./mutationQueue', () => ({
  enqueue: vi.fn().mockResolvedValue({}),
  getAll: vi.fn().mockResolvedValue([]),
}))

function setOnline(v: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => v })
}

describe('isNetworkFailure', () => {
  it('treats connection problems as retryable and server answers as final', () => {
    expect(isNetworkFailure(new TypeError('Failed to fetch'))).toBe(true)
    expect(isNetworkFailure(new SyntaxError('Unexpected token <'))).toBe(true)
    expect(isNetworkFailure(new WriteTimeoutError())).toBe(true)
    expect(isNetworkFailure(new Error('API returned HTTP 503'))).toBe(true)
    expect(isNetworkFailure(new Error('API returned HTTP 404'))).toBe(false)
    expect(isNetworkFailure(new PackingValidationError('label is required'))).toBe(false)
    expect(isNetworkFailure(new UnauthorizedError())).toBe(false)
  })
})

describe('writeOrQueue', () => {
  const queued = vi.fn()
  beforeEach(() => {
    vi.mocked(enqueue).mockClear()
    vi.mocked(getAll).mockResolvedValue([])
    window.addEventListener(QUEUED_EVENT, queued)
    setOnline(true)
  })
  afterEach(() => {
    window.removeEventListener(QUEUED_EVENT, queued)
    queued.mockClear()
  })

  it('sends straight away when online and nothing is waiting', async () => {
    const call = vi.fn().mockResolvedValue('ok')
    await expect(writeOrQueue('updateTodo', { tripId: 't' }, call)).resolves.toBe('ok')
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('queues without trying when the phone is offline', async () => {
    setOnline(false)
    const call = vi.fn()
    await expect(writeOrQueue('updateTodo', { tripId: 't' }, call)).resolves.toBeNull()
    expect(call).not.toHaveBeenCalled()
    expect(enqueue).toHaveBeenCalledWith('updateTodo', { tripId: 't' })
    expect(queued).toHaveBeenCalled()
  })

  it('queues when "online" but the request fails (plane wifi)', async () => {
    const call = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(writeOrQueue('createTodo', { tripId: 't' }, call)).resolves.toBeNull()
    expect(enqueue).toHaveBeenCalledWith('createTodo', { tripId: 't' })
  })

  it('queues when the request hangs', async () => {
    const call = vi.fn().mockReturnValue(new Promise(() => {}))
    await expect(writeOrQueue('deleteTodo', { tripId: 't' }, call, 10)).resolves.toBeNull()
    expect(enqueue).toHaveBeenCalled()
  })

  it('queues behind older waiting writes to keep the order', async () => {
    vi.mocked(getAll).mockResolvedValue([{ id: 'older' } as never])
    const call = vi.fn()
    await expect(writeOrQueue('updateTodo', { tripId: 't' }, call)).resolves.toBeNull()
    expect(call).not.toHaveBeenCalled()
  })

  it('passes a real server answer through', async () => {
    const call = vi.fn().mockRejectedValue(new PackingValidationError('label is required'))
    await expect(writeOrQueue('createPackingItem', {}, call)).rejects.toThrow('label is required')
    expect(enqueue).not.toHaveBeenCalled()
  })
})
