# Design tokens — usage guide

> Source: `tokens.css` · Primitives: `field-guide.css` · Utilities: `utilities.css` ·
> Country colours: `countries.ts`

## Identity — "field guide"

A calm, paper-and-ink planner. The page is **sea-salt** (`--bg`), cards are **paper**
(`--surface`), text is **ink**. One accent — **indigo** — marks selection, links and
progress. Colour otherwise carries _meaning only_: status (booked / over budget) and
**country** (which country a day is in).

Dark mode keeps the same identity at night (slate page, ink-blue paper, light indigo).
Every text/background pair below meets **WCAG AA 4.5:1** in both themes.

---

## Colour tokens

| Token             | Light     | Dark      | Use for                                   |
| ----------------- | --------- | --------- | ----------------------------------------- |
| `--bg`            | `#EEF0EC` | `#10161D` | page background (sea-salt)                |
| `--surface`       | `#F8F9F6` | `#161E27` | cards, inputs, sheets (paper)             |
| `--surface-2/3`   | greys     | slates    | segmented-control track, hover, bar track |
| `--ink`           | `#16202A` | `#E7EBEE` | headings, body text                       |
| `--muted`         | `#5B6670` | `#9AA6B1` | secondary text, labels (≥4.5:1)           |
| `--faint`         | `#8A949C` | `#6C7883` | decorative only (icons, rings) — not text |
| `--line`          | `#CDD3D0` | `#2A3540` | borders, dividers                         |
| `--accent`        | `#2A3A8F` | `#9AA9F0` | links, selection, progress fills          |
| `--accent-tint`   | `#DFE3F3` | `#1F2747` | accent chip backgrounds                   |
| `--warn`/`-ink`   | `#9A3B1A` | `#F0A584` | over budget, destructive, "find a bed"    |
| `--warn-tint`     | `#F4E2D8` | `#3A2219` | warning callout background                |
| `--ok`/`--ok-ink` | `#1E7A55` | `#4CC193` | done ticks, BOOKED chips                  |
| `--ok-tint`       | `#DCEFE5` | `#13332A` | success chip background                   |
| `--fill-strong`   | ink       | light ink | primary buttons, active segment           |
| `--on-fill`       | sea-salt  | slate     | text on `--fill-strong`                   |

### Country colours

`--country-sn` (Senegal `#1E7A55`), `--country-gm` (The Gambia `#B4542E`),
`--country-mr` (Mauritania `#B8860B`), plus a six-slot palette `--country-1…6` for any
other country. Use `countryColor(name)` from `countries.ts` — it returns the named colour
for those three and a stable, hash-keyed palette slot otherwise.

Country colours are for **borders, strips and pins only** (Mauritania gold is 2.8:1 on
sea-salt — never use it for text). They are lightened in dark mode.

---

## Typography

```
--font-display  Newsreader        page titles, big dates, place names, money (weight --fw-display)
--font          Public Sans       body and UI
--font-label    IBM Plex Mono     small uppercase labels, times, durations, counts
```

Helpers: `.fg-page-title`, `.fg-display`, `.fg-label`, `.fg-meta`.

---

## The signature: the date box

```html
<span class="date-box" style="--country: var(--country-sn)">
  <span class="date-box-num">19</span><span class="date-box-wd">Thu</span>
</span>
```

Big serif day number over a mono weekday, with a 3px right border in the country
colour. Add `.date-box--empty` when the day has nothing planned (dashed + faded), and
`.date-box--lg` for the day screen header. React: `<DateBox>` in `components/ui`.

---

## Primitives (`field-guide.css`)

- `.seg` / `.seg--block` + `.seg-btn[aria-pressed]` — segmented controls
- `.tag` (`--accent`, `--ok`, `--warn`, `--tour`, `--night`) — mono pill tags
- `.tick[aria-pressed]` — round planned↔done toggle, 44px hit area
- `.fg-btn--primary|quiet|danger`, `.fg-icon-btn`, `.fg-back` — buttons ≥44px
- `.fg-menu` — `<details>` overflow menu
- `.fg-ticks`, `.fg-bar`, `.route-strip` — progress and route strips
- `.fg-stats` / `.fg-stat` — big serif figures
- `.fg-callout` — warning callout · `.fg-empty` — honest empty state

Icons: `<Icon name="…">` (`components/ui/Icon.tsx`) — inline stroke SVGs. **No emoji as
UI icons.**

---

## Spacing, radius, motion

4-px spacing scale (`--s1`…`--s10`), radius `--r-xs` 6 → `--r-xl` 22 + `--r-pill`.
`--tap: 44px` is the minimum touch target. All motion is disabled under
`prefers-reduced-motion: reduce` (see `index.css`).

Legacy aliases (`--text-h`, `--border`, `--space-*`, `--radius-*` …) still resolve to the
tokens above so older components re-skin automatically.
