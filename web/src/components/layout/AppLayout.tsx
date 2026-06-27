import { type ReactNode } from 'react'
import './layout.css'

export interface AppLayoutProps {
  /**
   * Navigation for the comfortable laptop layout, rendered in a persistent
   * sidebar. Hidden on mobile/tablet (the bottom nav takes over there — S2).
   */
  sidebar?: ReactNode
  /**
   * Navigation for the purpose-built mobile layout, rendered as a fixed bottom
   * bar in the thumb zone. Hidden on laptop. Filled by S2's BottomNav.
   */
  bottomNav?: ReactNode
  /**
   * Optional top bar spanning the content column (e.g. NavBar). Shown on both
   * layouts; on mobile it is the only chrome above the content.
   */
  header?: ReactNode
  /** Main content. Feature screens compose here without per-screen layout code. */
  children: ReactNode
  className?: string
}

// AppLayout (M09.3 S1) is the responsive shell. It provides two genuinely
// distinct structures from one tree:
//
//   - Laptop (≥1024px): a persistent left sidebar (`sidebar`) beside a wide,
//     comfortable content column. No bottom nav.
//   - Mobile/tablet (<1024px): a single-column, full-bleed content area with a
//     fixed bottom navigation bar in the thumb zone (`bottomNav`). The sidebar
//     is not shown — the mobile layout is purpose-built, not a shrunk desktop.
//
// The switch is pure CSS (layout.css media queries) so there is no layout shift
// from JS measuring the viewport. Components that must branch in JS use
// useBreakpoint (e.g. S3's sheet-vs-modal choice).
export function AppLayout({
  sidebar,
  bottomNav,
  header,
  children,
  className = '',
}: AppLayoutProps) {
  return (
    <div className={['app-layout', className].filter(Boolean).join(' ')}>
      {/* Skip-nav: visible only on :focus-visible, lets keyboard users jump
          past the repeated navigation chrome to the main content. */}
      <a className="skip-nav" href="#main-content">
        Skip to main content
      </a>
      {sidebar && (
        <aside className="app-layout-sidebar" aria-label="Primary">
          {sidebar}
        </aside>
      )}
      <div className="app-layout-content">
        {header && <div className="app-layout-header">{header}</div>}
        <main id="main-content" className="app-layout-main">
          {children}
        </main>
      </div>
      {bottomNav && <div className="app-layout-bottom-nav">{bottomNav}</div>}
    </div>
  )
}
