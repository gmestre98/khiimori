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

## Navigation chrome (S2)

`AuthenticatedLayout` is the route element wrapping every gated screen (see `App.tsx`).
It fills `AppLayout`'s slots from one shared destination list
([`navItems.ts`](./navItems.ts) → `PRIMARY_NAV_ITEMS`), so laptop and mobile navigate
the same information architecture:

- **`SidebarNav`** — laptop sidebar: the primary destinations as a vertical list plus a
  footer slot (sign out). Active route is `end`-matched for `/`.
- **`BottomNav`** (Epic 02) — mobile bottom bar in the thumb zone; ≥48px tap targets.
- **`ThumbFab`** — mobile-only floating primary action (e.g. _New trip_), pinned
  bottom-right above the bottom nav with a ≥56px tap target and safe-area offset. Hidden
  on laptop, where primary actions sit inline in the content.

To change the destinations, edit `PRIMARY_NAV_ITEMS` once — both navs update.
