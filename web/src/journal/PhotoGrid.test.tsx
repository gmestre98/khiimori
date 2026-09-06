import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PhotoGrid } from './PhotoGrid'
import * as api from '../lib/api'
import type { Photo } from '../lib/api'

vi.mock('../lib/api', async (importOriginal) => {
  const orig = await importOriginal<typeof api>()
  return { ...orig, listPhotos: vi.fn() }
})

// resourceCache writes through to IndexedDB, which jsdom lacks — stub it out.
vi.mock('../lib/resourceCache', () => ({ writeCache: vi.fn() }))
vi.mock('../lib/useIsOnline', () => ({ useIsOnline: () => true }))

function makePhoto(overrides: Partial<Photo> = {}): Photo {
  return {
    id: 'photo-1',
    journal_entry_id: 'entry-1',
    storage_url: 'https://example/full.jpg',
    thumbnail_url: 'https://example/thumb.jpg',
    preview: 'data:image/jpeg;base64,AAAA',
    caption: 'A river',
    size_bytes: 1234,
    created_at: '2026-06-01T00:00:00Z',
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

beforeEach(() => {
  vi.mocked(api.listPhotos).mockResolvedValue([makePhoto()])
})

describe('PhotoGrid blur-up preview', () => {
  it('renders the inline preview behind the thumbnail and fades the image in on load', async () => {
    render(<PhotoGrid tripId="trip-1" dayId="day-1" readOnly />)

    const img = await screen.findByAltText('A river')
    // The blur preview is a sibling painted behind the thumbnail.
    const preview = img.parentElement?.querySelector('.photo-thumb-preview') as HTMLElement
    expect(preview).toBeTruthy()
    expect(preview.style.backgroundImage).toContain('data:image/jpeg;base64,AAAA')

    // Before load the thumbnail is transparent (no loaded modifier).
    expect(img.className).not.toContain('photo-thumb-img--loaded')

    fireEvent.load(img)
    await waitFor(() => expect(img.className).toContain('photo-thumb-img--loaded'))
  })

  it('omits the preview element when a photo has none (pre-backfill)', async () => {
    vi.mocked(api.listPhotos).mockResolvedValue([makePhoto({ preview: undefined })])
    render(<PhotoGrid tripId="trip-1" dayId="day-1" readOnly />)

    const img = await screen.findByAltText('A river')
    expect(img.parentElement?.querySelector('.photo-thumb-preview')).toBeNull()
  })
})
