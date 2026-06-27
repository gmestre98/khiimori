# Responsive layout system — M09.3

> The app is **genuinely responsive** (PRD §5.10): a comfortable laptop layout and a
> **purpose-built mobile layout** — not a scaled-down desktop — served from **one
> codebase** (PRD §7.2). Feature screens compose into `AppLayout` without bespoke
> per-screen layout code.

## Breakpoints

Source of truth: [`src/design/breakpoints.ts`](../../design/breakpoints.ts). The pixel
values are mirrored in [`layout.css`](./layout.css) media queries — keep them in sync.

| Name     | Range        | Layout                                       |
| -------- | ------------ | -------------------------------------------- |
| `mobile` | `< 640px`    | Purpose-built mobile layout (bottom nav, S2) |
| `tablet` | `640–1023px` | Mobile layout with more breathing room       |
| `laptop` | `≥ 1024px`   | Comfortable layout with a persistent sidebar |

The single decision point between the two structures is **1024px** (`LAPTOP_MIN_WIDTH`):
below it the mobile layout, at/above it the laptop layout.

## Choosing CSS vs JS

- **Prefer CSS media queries** (via `AppLayout`) for structural switches — no JS
  measuring means no layout shift.
- **Use the `useBreakpoint` / `useIsLaptop` hooks** only when a component must branch
  in JavaScript (e.g. S3 renders a bottom **Sheet** on mobile but a centred **modal** on
  laptop). The hooks are SSR/test-safe and assume the laptop layout when `window` is
  unavailable.

## `AppLayout`

```tsx
import { AppLayout } from '../components/layout'

<AppLayout
  sidebar={<SidebarNav />}      // laptop only — hidden < 1024px
  bottomNav={<BottomNav … />}   // mobile only — hidden ≥ 1024px (S2)
  header={<NavBar … />}         // both layouts, sticky top
>
  <FeatureScreen />            {/* main content column */}
</AppLayout>
```

| Layout           | Structure                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| Laptop (≥1024px) | Persistent left **sidebar** beside a centred, max-width content column.                                      |
| Mobile (<1024px) | Single full-bleed content column with a fixed **bottom nav** in the thumb zone. The sidebar is not rendered. |

The bottom-nav slot respects `env(safe-area-inset-bottom)` so it clears the iOS home
indicator. The content column reserves bottom padding so the fixed nav never overlaps the
last row.

Slots are optional: `AppLayout` with only `children` is a valid plain content shell.
