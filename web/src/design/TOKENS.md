# Design tokens — usage guide

> Source: `tokens.css` · Utilities: `utilities.css` · Epic: M09.1

## Theme

The default theme is **black & white**. The main palette is pure black/white/grey — no colour noise. A single accent colour exists for three specific cases only.

**To re-skin the whole app**, edit `--color-accent-base` in `tokens.css`. Changing that one variable flows through to every accent-aware component automatically.

**To change the neutral palette**, edit the `--color-gray-*` primitives and the semantic mappings below them.

---

## Colour tokens

### Semantic tokens — use these in components

| Token              | Light value | Dark value | Use for                      |
| ------------------ | ----------- | ---------- | ---------------------------- |
| `--bg`             | white       | near-black | page background              |
| `--bg-muted`       | gray-50     | gray-900   | subtle page regions          |
| `--surface`        | white       | gray-900   | cards, inputs, dialogs       |
| `--surface-muted`  | gray-100    | gray-800   | disabled/subdued surfaces    |
| `--surface-hover`  | gray-150    | gray-700   | hover states on surfaces     |
| `--text-h`         | black       | white      | headings, high-emphasis text |
| `--text`           | gray-600    | gray-400   | body text                    |
| `--text-secondary` | gray-500    | gray-500   | labels, meta                 |
| `--muted`          | gray-500    | gray-500   | placeholder, helper text     |
| `--text-muted`     | gray-400    | gray-600   | very low-emphasis text       |
| `--border`         | gray-200    | gray-800   | borders, dividers            |
| `--border-faint`   | gray-100    | gray-900   | very subtle separators       |

### Status tokens — fixed across themes

| Token            | Value     | Use for                            |
| ---------------- | --------- | ---------------------------------- |
| `--success`      | green-600 | success messages, saved indicators |
| `--warning`      | amber-700 | caution states                     |
| `--danger`       | `--error` | destructive actions                |
| `--error`        | red-600   | errors, validation failures        |
| `--color-rating` | amber-400 | star ratings only                  |

### Accent tokens — restrained use only

The accent is a **single configurable colour** (`--color-accent-base`). It is intentionally near-black in the default theme — making it almost invisible as a chromatic element and keeping the B&W aesthetic.

```
--accent          primary accent colour
--accent-bg       8% tint (for accent-tinted backgrounds)
--accent-border   30% tint (for accent-coloured borders)
--accent-hover    6% tint (for hover states on accent elements)
--accent-subtle   5% tint blended with --bg (very light wash)
--accent-on       text colour on a solid accent background (white / black)
```

**Sanctioned accent uses — the only three places where accent appears:**

1. **Status badges / indicators** — `plan-item-status-badge`, queue indicators, offline banners
2. **Budget bars** — rollup bar fills, budget editor inputs/values
3. **Map pins** — `day-map-pin`, `plan-item-pin-badge`

Do not apply accent anywhere else. If you find accent in a new component, use a semantic token instead.

---

## Typography tokens

```
--font-sans      system-ui stack (body, UI)
--font-heading   same as --font-sans (headings use weight/size for hierarchy)
--font-mono      monospace stack (code)

--text-xs    11px
--text-sm    12px
--text-base  14px   ← default for UI labels, table cells
--text-md    16px
--text-lg    18px   ← body copy size
--text-xl    20px
--text-2xl   24px
--text-4xl   36px
--text-6xl   56px   ← hero headings

--leading-tight   118%   headings
--leading-normal  145%   body copy

--tracking-tight   -0.04em   large headings
--tracking-wide     0.05em   uppercase labels
--tracking-wider    0.08em   very compact labels
```

---

## Spacing tokens (4-px grid)

```
--space-1   4px
--space-2   8px
--space-3   12px
--space-4   16px
--space-5   20px
--space-6   24px
--space-8   32px
--space-10  40px
--space-12  48px
--space-16  64px
```

---

## Border-radius tokens

```
--radius-sm    4px    small chips, tags
--radius-md    6px    table rows, compact cards
--radius-lg    8px    default inputs, cards
--radius-xl    12px   modals, overlays
--radius-2xl   16px   bottom sheets
--radius-full  9999px  pills, circular buttons
```

---

## Shadow tokens

```
--shadow-sm   subtle depth for inputs
--shadow-md   card/popover depth
--shadow-lg   modal/overlay depth
```

---

## Utility classes

`utilities.css` exports thin wrappers — prefer these over raw token references in feature CSS:

```css
.u-accent-text    /* color: var(--accent)         — sanctioned only */
.u-accent-bg      /* bg: var(--accent); color: var(--accent-on) */
.u-accent-border  /* border-color: var(--accent)  — sanctioned only */
.u-accent-surface /* bg + border using --accent-bg / --accent-border */

.u-success        /* color: var(--success) */
.u-warning        /* color: var(--warning) */
.u-error          /* color: var(--error) */

.u-text-secondary /* color: var(--text-secondary) */
.u-text-muted     /* color: var(--text-muted) */

.u-surface        /* background: var(--surface) */
.u-surface-muted  /* background: var(--surface-muted) */
```
