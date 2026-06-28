/**
 * Code-splitting regression guard (M09.5 S3).
 *
 * These tests read App.tsx as source text to assert that the lazy() calls
 * added in M09.5 S2 are still present. They act as a canary: if someone
 * accidentally reverts to eager imports, CI catches it before production.
 *
 * They intentionally test source structure (not runtime behaviour) because
 * the code-splitting only matters at build time — the Suspense boundaries
 * handle it transparently in tests via react-dom/test-utils.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const appSrc = readFileSync(resolve(__dirname, '../App.tsx'), 'utf-8')

describe('App.tsx code-splitting (M09.5 S2)', () => {
  it('DayView is lazy-loaded (not a static import)', () => {
    expect(appSrc).not.toMatch(/^import.*DayView.*from/m)
    expect(appSrc).toMatch(/lazy\(.*DayView/)
  })

  it('TripShellRoute is lazy-loaded', () => {
    expect(appSrc).not.toMatch(/^import.*TripShellRoute.*from/m)
    expect(appSrc).toMatch(/TripShellRoute\s*=\s*lazy/)
  })

  it('Home is lazy-loaded', () => {
    expect(appSrc).not.toMatch(/^import.*\bHome\b.*from.*pages\/Home/m)
    expect(appSrc).toMatch(/\bHome\s*=\s*lazy/)
  })

  it('Admin pages are lazy-loaded', () => {
    expect(appSrc).not.toMatch(/^import.*AdminPage.*from/m)
    expect(appSrc).toMatch(/AdminPage\s*=\s*lazy/)
  })

  it('DayMap is lazy-loaded in DayView', () => {
    const dayViewSrc = readFileSync(resolve(__dirname, '../trips/DayView.tsx'), 'utf-8')
    expect(dayViewSrc).toMatch(/lazy\(\s*\(\s*\)\s*=>\s*import\(['"]\.\/DayMap/)
  })
})
