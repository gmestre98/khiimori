// Guards the PWA install contract (M09.4 S1): the web app manifest and the
// install-related <head> tags must stay present and valid so the app remains
// installable / standalone. These are static files, so the test reads them
// straight from disk rather than rendering anything.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Vitest runs with the web/ package as cwd, so files resolve from there.
const root = process.cwd()

interface Manifest {
  name: string
  short_name: string
  start_url: string
  scope: string
  display: string
  theme_color: string
  background_color: string
  icons: { src: string; sizes: string; type: string; purpose: string }[]
}

describe('PWA web app manifest', () => {
  const manifest = JSON.parse(
    readFileSync(`${root}/public/manifest.webmanifest`, 'utf8'),
  ) as Manifest

  it('declares a standalone, themed installable app', () => {
    expect(manifest.name).toBe('Khiimori')
    expect(manifest.display).toBe('standalone')
    expect(manifest.start_url).toBe('/')
    expect(manifest.scope).toBe('/')
    // Colours come from the Epic 01 black/white identity. theme_color matches
    // the --ink token used in index.html so the installed app's chrome matches.
    expect(manifest.theme_color).toBe('#101113')
    expect(manifest.background_color).toBe('#ffffff')
  })

  it('provides the 192 + 512 any icons and a maskable 512', () => {
    const byKey = new Map(manifest.icons.map((i) => [`${i.sizes}-${i.purpose}`, i]))
    expect(byKey.has('192x192-any')).toBe(true)
    expect(byKey.has('512x512-any')).toBe(true)
    expect(byKey.has('512x512-maskable')).toBe(true)
    for (const icon of manifest.icons) {
      expect(icon.type).toBe('image/png')
      expect(icon.src.startsWith('/')).toBe(true)
    }
  })
})

describe('index.html PWA tags', () => {
  const html = readFileSync(`${root}/index.html`, 'utf8')

  it('links the manifest and the install-related meta/icon tags', () => {
    expect(html).toContain('rel="manifest"')
    expect(html).toContain('href="/manifest.webmanifest"')
    expect(html).toContain('name="theme-color"')
    expect(html).toContain('rel="apple-touch-icon"')
    expect(html).toContain('name="apple-mobile-web-app-capable"')
  })
})
