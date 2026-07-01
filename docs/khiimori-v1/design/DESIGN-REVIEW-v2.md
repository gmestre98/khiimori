# Khiimori — Design Review & Follow-up (v2)

A critique of the **implemented** React build against the v1 reference
(`khiimori-design.html` + `DESIGN-SPEC.md`), with prioritized, actionable
improvements for a v2 pass. Written after reviewing every core screen rendered
in the browser at laptop (1180px) and mobile (375px) widths.

> Method: the app was driven without a backend via a dev-only API mock
> (`VITE_USE_MOCK_TRIPS=true` → `src/lib/dev-mock.ts` + `src/lib/mock-trips.ts`),
> seeded to mirror the reference ("Japan — Spring 2026", day 4 = today). The mock
> is gated behind the env flag and excluded from tests; delete it with the flag
> when no longer needed.

---

## 1. What now matches the reference

These were brought to spec in this pass (or were already correct):

- **Design tokens** — `:root` palette, type ramp, spacing, radius, shadow and
  motion already mirror the reference 1:1 (`src/design/tokens.css`). No drift.
- **Friendly dates & money everywhere** — added `src/lib/format.ts`
  (`formatDateRange`, `fullDate`, `shortDate`, `monthYear`, `euro`, `euroWhole`).
  The dashboard, hero, day header and day strip now read `Jun 27 – Jul 08, 2026`
  and `Friday, Apr 05 2026` instead of raw `2026-06-27`. Headline money uses
  whole euros with separators (`€1,800`); the formatters fail safe on partial
  rollups (this also fixed a latent `toFixed`/`toLocaleString` crash).
- **Dashboard hero (§04)** — teal day-counter panel, `Today · <city>` accent
  chip, H1 name, destinations + dates meta, single **Open today →** accent CTA,
  and the `Trip budget €640 / €1,800 · €1,160 left` line with progress bar.
- **Calm Upcoming / Past cards (§04)** — whole-card click target, status chip
  (`in N days` / `planning` / `journal ✓`), destinations, friendly date/`Oct 2025
  · 8 days` meta. Secondary actions (Edit/Archive/Delete) demoted to a quiet text
  row so the grid reads calm.
- **Day plan & map (§07)** — day-selector strip (weekday + `D4` pills, ink active
  pill, prev/next, jump select), two-column itinerary/map+journal, stay card with
  teal left accent, **time-first** plan rows (`09:00 Fushimi Inari Shrine`),
  untimed ideas, journal preview with rating/weather/mood.
- **Budget roll-up (§05)** — three summary tiles (Spent / **Remaining** in teal /
  Trip budget) and by-category meters with warn/danger states.
- **Sharing (§06)** — invite-by-email + role select, members list with role chips
  and remove, pending invites with resend/revoke, roles legend.
- **Mobile (§08)** — bottom tab bar (Trips · Map · Journal · Me, teal active),
  full-width **Open today** CTA in the thumb zone, scrollable day pills, plan rows
  that no longer collapse their spacing under flexbox.

---

## 2. Gaps & improvements (prioritized)

### P1 — closest to the spec, highest visible payoff

1. **Hero is missing the avatar stack + stat tiles.** §04 shows an avatar stack
   (owner = ink, members = accent/amber, white ring) beside *Open today*, plus
   two stat tiles (`€80 today`, `3 plans`). The build shows neither — there's no
   member list or today-spend wired into `CurrentTripCard`. *Proposal:* pass
   `members`, `spentToday` (from the rollup `by_day[todayId]`) and `planCount`
   into the card and render the stack + tiles. Until member data exists, render
   the owner avatar only.

2. **Plan rows show re-planning controls instead of the read-first line.** §07
   specifies `time · title · category chip · cost · booking badge` with a drag
   handle and a `Schedule →` affordance. The build leads with a `Planned ▾ /
   Move… / → Backlog` control cluster on every row, which is louder than the
   reference and hides cost/category. *Proposal:* make the **read** line primary
   (category dot+label chip, cost, `booked` badge), and move status/move/backlog
   behind an edit/overflow affordance revealed on hover (laptop) or via the row's
   edit sheet (mobile).

3. **Map pins render as a legend row, not as numbered pins on the map.** §07
   overlays numbered pins (itinerary order) + a dashed route on the map, with a
   small `Hotel · start` legend chip. *Proposal:* once the Geo static map is
   wired, overlay the numbered markers on the image and keep the legend inside
   the card frame (the static-map URL already encodes ordered markers).

### P2 — structural / behavioural alignment

4. **Tabs: 2 vs 3.** The dashboard uses `Current & Upcoming` / `Past`; the
   reference shows three segments (Current / Upcoming / Past) with everything
   stacked under Current. *Decision needed:* either restore three segments to
   match the mock, or ratify the two-tab model in `DESIGN-SPEC.md` (it reads
   well and reduces empty states — my recommendation is to **keep two** and
   update the spec).

5. **Secondary actions still visible on calm cards.** Even demoted, Edit/Archive/
   Delete sit on the card face; the reference shows none (cards are pure click
   targets). *Proposal:* collapse them into a `⋯` overflow menu (hover on laptop,
   long-press/kebab on mobile) for a fully calm grid.

6. **Untimed section naming + treatment.** §07 labels it *"Ideas for today ·
   untimed"* with dashed timeline nodes and a dashed `+ Capture an idea` button;
   the build labels it *Activities*. *Proposal:* rename, add the dashed node ring,
   and add the dashed full-width capture button.

7. **Mobile hero is taller than §08.** The reference mobile hero is a compact
   ~84px gradient band with the trip name *inside* the band; the build stacks the
   laptop hero (panel → body). It's on-brand but heavier. *Proposal (optional):*
   a dedicated compact mobile hero composition.

### P3 — polish & quality (spec §6)

8. **Offline-first journal cues.** §08/§5 call for an `Offline` connection chip,
   `Auto-saved locally · syncs when online` line, and a photo-grid usage bar that
   warns near the **1 GB** cap. Verify these surface on the mobile journal (the
   data exists via `fetchTripUsage`).

9. **Mobile quick-add FAB.** §08 shows an ink FAB (bottom-right, above the tab
   bar) for context quick-add (plan item / cost). Confirm it renders on the day
   and budget screens.

10. **Focus-visible & reduced-motion.** Inputs have the teal focus ring; ensure
    buttons/links get an equivalent visible focus ring, and that
    `prefers-reduced-motion` drops the card hover-translate (spec §6).

11. **Day budget meter (§07).** Confirm the segmented-by-category day meter +
    category chips + `+ Log a cost` quick action render under the itinerary.

---

## 3. Forward-looking (post-v1)

- **Money in one helper** — done (`format.ts`); multi-currency can land by
  touching only that module.
- **Map is a placeholder** — wire Google Maps via the Geo proxy; keep the card
  frame + route treatment from §07.
- **Avatars are initials** — swap for real avatars when available; keep the
  ink/accent/amber owner-vs-member encoding.
- **Theming stays tokenized** — restyle from real feedback without touching
  components.

---

## 4. Suggested v2 sequencing

1. Wire `spentToday` / `planCount` / `members` → hero stat tiles + avatar stack (P1.1).
2. Re-rank plan rows to read-first; move controls to overflow/edit (P1.2, P2.5).
3. Geo static map with overlaid numbered pins + legend (P1.3).
4. Untimed "Ideas" rename + dashed treatment + capture button (P2.6).
5. Decide tabs (P2.4) and ratify in the spec.
6. A11y sweep: button focus rings + reduced-motion (P3.10).
