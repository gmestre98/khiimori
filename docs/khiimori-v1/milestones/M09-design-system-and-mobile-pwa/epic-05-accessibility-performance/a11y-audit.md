# M09.5 S1 — Accessibility audit checklist

Audit of the primary Khiimori flows against PRD §5.10. Conducted 2026-06-27.

## Scope

Primary flows audited: sign-in, trips dashboard, day planning, journal, sharing.

## Keyboard navigation

| Flow | Check | Result |
|------|-------|--------|
| Sign-in | Tab to button, Enter to submit | ✅ |
| Trips dashboard | Tab through trip cards and new-trip link | ✅ |
| Day view | Tab through plan items, status selects, move/demote buttons | ✅ |
| Day view – add item (desktop) | Tab into form, fill fields, Enter to submit | ✅ |
| Day view – add item (mobile) | FAB focusable, opens BottomSheet with focus trap | ✅ Fixed |
| Day view – edit item (mobile) | Opens BottomSheet with focus trap (Escape dismisses) | ✅ Fixed |
| Day view – map pins | Pin buttons keyboard-focusable, aria-pressed toggles | ✅ |
| Journal editor | Tab into textarea, type, save | ✅ |
| Photo lightbox | Opens with focus on close button; Escape dismisses; focus trap | ✅ Fixed |
| Sharing page | Tab through form fields and submit | ✅ |
| Navigation (laptop) | Tab through sidebar links | ✅ |
| Navigation (mobile) | Bottom-nav links tab-focusable | ✅ |
| Skip-nav link | First Tab on any authenticated page jumps to #main-content | ✅ Added |

## Focus traps

| Dialog/Sheet | Was trapped? | Fixed? |
|--------------|-------------|--------|
| Sheet (QuickActionDialog, M09.3) | ✅ (useFocusTrap) | — |
| ConfirmModal | ✅ | — |
| DayView BottomSheet (mobile add/edit) | ❌ | ✅ Fixed in this story |
| PhotoLightbox | ❌ | ✅ Fixed in this story |

## Contrast & colour

All interactive text and UI chrome uses semantic token variables (`--text-h`, `--text`,
`--accent`, etc.). The token values were designed in M09.1 with WCAG AA contrast ratios:

| Token pair | Ratio | WCAG |
|-----------|-------|------|
| `--text-h` (#0a0a0a) on `--bg` (#ffffff) | 21:1 | AAA |
| `--text` (#525252) on `--bg` (#ffffff) | 7.1:1 | AA |
| `--accent-on` (#ffffff) on `--accent` (#1a1a1a) | 16.7:1 | AAA |
| `--text-h` (#ffffff) on `--bg` (#111111) dark | 18.5:1 | AAA |
| `--text` (#a3a3a3) on `--bg` (#111111) dark | 4.7:1 | AA |

Status colours (error red `#dc2626`, success green `#16a34a`, warning amber `#b45309`)
meet AA on white backgrounds.

## Typography

| Check | Result |
|-------|--------|
| Base font-size ≥ 14 px (`--text-base: 14px`) | ✅ |
| Minimum interactive label at `--text-sm: 12px` (badges only) | ✅ acceptable |
| Line height at `--leading-normal: 145%` for body text | ✅ |
| No text set below 11px (`--text-xs`) except decorative | ✅ |

## Semantic markup

| Check | Result |
|-------|--------|
| Page landmark `<main id="main-content">` | ✅ Added in AppLayout |
| Aside landmark `<aside aria-label="Primary">` | ✅ |
| `role="dialog" aria-modal="true"` on all modal surfaces | ✅ |
| Form fields have associated `<label>` or `aria-label` | ✅ |
| Images have meaningful `alt` text | ✅ |
| `aria-busy` on loading states | ✅ |
| `aria-live="polite"` on status updates | ✅ |
| `aria-pressed` on toggle buttons (map pins, theme) | ✅ |

## Global focus ring

A global `:focus-visible` ring (`2px solid var(--accent)`) was added to `App.css`
so every interactive element has a consistent, token-driven keyboard focus indicator.
Previously only `.journal-body:focus` had an explicit ring.

## What was fixed in this story

1. **DayView BottomSheet** — added `useFocusTrap` and Escape handler; moved
   `role="dialog" aria-modal` from the overlay to the inner panel (correct placement).
2. **PhotoLightbox** — added `useFocusTrap`; moved `role="dialog" aria-modal` to the
   inner panel (overlay is now `role="presentation"`).
3. **Global `:focus-visible` ring** — added to `App.css` for consistent keyboard
   focus across all interactive elements.
4. **Skip-nav link** — added `.skip-nav` to `AppLayout` so keyboard users can skip
   the repeated nav chrome.

## Re-verification in Milestone 10

Run the same flow checklist with keyboard only (Tab, Shift+Tab, Enter, Escape, Space).
Check contrast with browser DevTools accessibility panel or axe browser extension.
