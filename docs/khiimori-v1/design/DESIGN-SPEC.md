# Khiimori — Design Spec (v1)

Implementer's notes to accompany **`khiimori-design.html`**. That file is the visual source of truth — open it in a browser to see every screen for laptop and mobile, plus the foundations and component library. This document describes the rules so Claude Code (or any engineer) can translate the reference into the React + TypeScript build without guessing.

> Aesthetic, per PRD §5.10: minimal **black & white**, restrained **teal** accent for status/progress/active, **amber** as a sparing secondary. Calm, uncluttered, few primary actions per screen. Mobile is a real mobile layout (bottom nav, thumb reach), not a shrunk desktop.

---

## 1. How to use this handoff

1. Copy the entire `:root { … }` token block from `khiimori-design.html` into the app's global stylesheet (or map it into the Tailwind/theme config). These CSS variables are the contract — components reference `var(--token)`, never hard-coded hex.
2. Copy the `APP STYLES` CSS block (everything under that comment) as the baseline component styles. The classes map 1:1 to the components below.
3. Build each screen as a React component using the markup in the reference as the structural blueprint. The reference uses plain HTML + inline styles in places for layout convenience; in React, prefer the shared classes and lift repeated inline styles into the component.
4. Treat the map as a placeholder. The real map is **Google Maps via the Geo proxy** (PRD §5.6, §7.1). Keep it inside the same card frame and route-overlay treatment.

---

## 2. Design tokens (summary)

**Color** — ink `#101113`, muted `#6b7076`, surfaces `#ffffff / #f7f8f8 / #eef0f0`, lines `#e7e9ea / #dcdfe1`. Accent teal `#2f6f6a` (press `#255854`, tint `#e7f0ef`). Amber `#b06a2c`. Status: warn `#b8852a`, danger `#b3402e`. Category colors (budget + map pins): Stays `#2f6f6a`, Transport `#3a6ea5`, Food `#b06a2c`, Activities `#6d5aa6`, Other `#6b7076`.

**Type** — Inter (system fallback). Display 28/700, H1 22/700, H2 17/600, Body 14/400, Meta 12.5, Eyebrow 11 uppercase. Money and dates use **tabular numerals** (`.num`).

**Spacing** — 4pt scale (4, 8, 12, 16, 20, 24, 32, 40…). **Radius** — 8 (controls), 12 (cards), 16 (large), pill (chips/buttons). **Elevation** — almost flat; `--shadow-1` for cards, `--shadow-2` on hover, `--shadow-3` only for FAB/floating.

**Motion** — 160ms, `cubic-bezier(.2,.7,.3,1)`. Hover lifts cards 1px; buttons depress 0.5px on active.

---

## 3. Component rules

- **Buttons** — pill-shaped. One **ink** primary per screen (`.btn-primary`). The **accent** button (`.btn-accent`) is reserved for the single most important confirm in a flow (e.g. "Open today", "Save entry"). `.btn-ghost` = secondary, `.btn-quiet` = tertiary/inline.
- **Tabs** (`.tabs`) — segmented pill control for Current/Upcoming/Past and similar. Active = white pill on a grey track.
- **Chips & badges** — `.chip` for metadata/filters; `.chip.accent.dot` for the live "today" marker; `.badge.ok/warn/danger` for budget and booking states.
- **Cards** (`.card`) — the universal container. `.card-accent-l` adds the 4px teal left bar used on the current trip, stays, and the day's hero. `.card.hover` for clickable cards.
- **Progress** (`.progress`) — budget meters. Turns `.warn` at ~80% and `.danger` at/over 100%. `.progress.seg` shows spend split by category color.
- **Avatars** — initial on a solid fill; owner = ink, others get accent/amber. `.avatar-stack` overlaps with a white ring for shared trips.
- **Inputs** (`.input`) — grey fill, focus brings white bg + teal ring. Always pair with a `.field > label`.
- **Timeline** (`.timeline`) — the day's itinerary. Node ring color encodes category; dashed node = an idea/untimed item.

---

## 4. Screen-by-screen notes

### Trips dashboard (`/trips`)
Current / Upcoming / Past from dates vs. today (PRD §5.1). The **current trip is a hero** carrying day N/total, live budget bar, spent-today, and a single accent CTA to jump into today. Upcoming/Past are calmer cards; Past slightly de-emphasised but still shows a journal-complete check. New-trip is the ink primary in the top bar.

### Day plan & map (`/trips/:id/day-:n`) — the core screen
Two columns on laptop, stacked on mobile. Left = the **living itinerary**: stay card, a **timeline of timed items** (time · title · category chip · cost · booking badge), then a separate loose list of **untimed ideas** that are never forced onto the clock (PRD §5.2). Each item has a drag affordance (`⋮⋮`) and a "Schedule →" / "move to day" action for fast re-planning (§5.3). Right = the **day map** (numbered pins in itinerary order + dashed route) and a **journal preview**. A day-budget meter sits under the itinerary with a "Log a cost" quick action. Day selector strip lets you page across days.

### Budget roll-up (`/trips/:id/budget`)
Three summary tiles (Spent / Remaining / Trip budget), a **by-category** breakdown with per-category meters (warn/danger states), and a **by-day** list. Remaining is shown in teal as the number you watch. All amounts EUR (§5.4). "Log a cost" is always one tap away.

### Sharing & access (`/trips/:id/sharing`)
Invite-by-email row with a role select, the members list with role chips (Owner = solid ink, others = outline dropdowns), pending invites with resend/revoke, and a roles legend. **Authorization is server-side** (PRD §5.9) — this UI only reflects state; never gate data client-side.

---

## 5. Mobile (PWA) specifics

- **Bottom tab bar**: Trips · Map · Journal · Me. Active tab = teal. Fixed, with safe-area padding; blurred translucent background.
- **FAB** (ink circle, bottom-right above the tab bar) = context quick-add: a plan item on the day screen, a cost on budget. This is the "capturing an idea is one tap" promise (§5.2).
- **Headers** are large-title style: small contextual meta line above a 21px title.
- **Journal is offline-first** (§5.5, §6): show a connection chip ("Offline"), "Auto-saved locally · syncs when online", and let writes queue. Don't block the UI on the network. Photo grid is capped per trip at **1 GB** — surface usage and warn near the cap.
- Tap targets ≥ 44px. Primary actions sit in the thumb zone (bottom third).

---

## 6. Accessibility & quality (PRD §5.10, §6)

- Contrast: body/muted text meet WCAG AA on white (`--muted` is tuned for this). Don't go lighter than `--muted` for meaningful text.
- Never encode meaning by **color alone** — budget states pair color with a label/badge; map pins use numbers; categories use a label beside the dot.
- Full keyboard navigation and visible focus (the teal focus ring on inputs; add an equivalent on buttons/links).
- Respect `prefers-reduced-motion` — drop the hover/translate transitions.
- Theming is centralised in tokens so the team can restyle from real feedback after v1 without touching components.

---

## 7. What's intentionally a placeholder

- **Map** tiles, pins, and route are mocked SVG; wire to Google Maps through the Geo proxy.
- Avatar images are initials; swap for real avatars when available.
- Currency is **EUR only** in v1 — keep money formatting in one helper so multi-currency can land later.
- Icons are inline strokes (1.7px) matching a Lucide-style set; standardise on one icon library in the build.
