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

## Navigation chrome (field-guide redesign)

`AuthenticatedLayout` is the route element wrapping every gated screen (see `App.tsx`).
One information architecture, one presentation per layout — never two navs at once:

- **Desktop — `SidebarNav`**: the user's trips (upcoming, then a collapsible
  "Past trips (n)"), with the open trip's sections nested under it — Days, Map & stays,
  Journal, Money, Prep, Backlog (with count) — plus New trip and the profile footer.
  There is no in-trip top tab bar.
- **Phone, inside a trip — `BottomNav`**: five tabs, Days · Map · Journal · Money ·
  Prep (`buildTripBottomNavItems`). Back to Trips and Share live in the trip header.
- **Phone, outside a trip**: no bottom bar; the Trips screen header carries the profile
  avatar, and Admin is reached from Profile.

Section routes keep their historical paths (`/plan`, `/map`, `/journal`, `/budget` =
Money, `/packing` = Prep, `/sharing`, `/backlog`). Edit sections once in
[`navItems.ts`](./navItems.ts) (`buildTripSections`) — both navs follow.

`active` state uses `aria-current="page"`. The bottom bar only reserves space
(`--bottom-nav-height`) when it is rendered.

## Quick add/edit (S3)

`QuickActionDialog` is the responsive surface M04's low-friction plan-item/cost flows
compose into. It keeps **capability parity** across layouts by switching only the
presentation:

- **Mobile** — the Epic 02 `Sheet` (bottom drawer), thumb-reachable and dismissible.
- **Laptop** — a centred modal (`.modal` surface) equivalent.

```tsx
import { QuickActionDialog } from '../components/layout'

const [open, setOpen] = useState(false)
<QuickActionDialog open={open} onClose={() => setOpen(false)} title="Add plan item">
  <PlanItemForm onDone={() => setOpen(false)} />
</QuickActionDialog>
```

Both surfaces are accessible: focus is **trapped** while open (shared `useFocusTrap`
hook, exported from `components/ui`), **Escape** and an overlay/backdrop click dismiss,
and focus is **restored** to the trigger on close. The breakpoint choice uses
`useIsLaptop()` (JS branch) since the two surfaces are different DOM, not a CSS restyle.
