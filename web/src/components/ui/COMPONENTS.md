# Component library — M09.2

> All primitives live in `src/components/ui/`. Import from the barrel:
>
> ```ts
> import {
>   Button,
>   Input,
>   FormField,
>   Sheet,
>   ProgressBar,
>   NavBar,
>   BottomNav,
>   DayNavBar,
> } from '../components/ui'
> ```

---

## Accessibility baseline

Every primitive in this library meets the following baseline. Epic 05 audits real
flows against these guarantees.

| Concern                  | Guarantee                                                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Focus visible**        | All interactive elements have a visible `:focus` outline (2px solid `--accent`). Never remove outlines without providing an equivalent.                       |
| **Semantic markup**      | Elements use the correct HTML role (`<button>`, `<nav>`, `<header>`, `<ul>`, `role="dialog"`, `role="progressbar"`, etc.).                                    |
| **Labels**               | Every interactive control has an accessible name — via visible label text, `aria-label`, or `aria-labelledby`.                                                |
| **Error announcement**   | Form errors use `role="alert"` (via `FormField`) so screen readers announce them immediately.                                                                 |
| **Keyboard navigation**  | All interactive primitives are reachable and operable via keyboard (Tab, Enter, Space, Escape where applicable).                                              |
| **Colour contrast**      | Colours come exclusively from design tokens. The token scale was chosen to meet WCAG AA contrast ratios in both light and dark modes. Never hardcode colours. |
| **No hardcoded colours** | See _Token usage check_ below — primitives only reference CSS custom properties.                                                                              |

---

## Token usage check

**Rule:** primitives must reference only CSS custom properties (e.g. `var(--text-h)`,
`var(--accent)`), never raw hex values or named colours.

**Verified clean** — run this to confirm:

```sh
grep -n '#[0-9a-fA-F]\{3,6\}\b\|rgb(\|rgba(' web/src/components/ui/ui.css
```

Expected output: no matches. All colour values reference `var(--…)` tokens,
including the overlay scrim (`--overlay-scrim` in `tokens.css` §7).

Accent usage is further restricted — only three sanctioned cases:

- Status badges / indicators
- Budget / progress bars (ProgressBar component)
- Map pins

---

## S1 — Form & input primitives

### Button

**File:** `Button.tsx`  
**Variants:** `primary` | `secondary` | `destructive` | `ghost` | `ghost-danger`  
**Sizes:** `md` (default) | `sm`

```tsx
// Primary — default submit action
<Button type="submit">Create trip</Button>

// Secondary — cancel / secondary action
<Button variant="secondary" onClick={onCancel}>Cancel</Button>

// Destructive — irreversible actions
<Button variant="destructive" onClick={onDelete}>Delete trip</Button>

// Ghost — low-emphasis inline action
<Button variant="ghost" size="sm">Edit</Button>

// Ghost-danger — low-emphasis destructive inline action
<Button variant="ghost-danger" size="sm">Remove</Button>

// Disabled state
<Button disabled>Saving…</Button>
```

**A11y notes:**

- Defaults to `type="button"` to prevent accidental form submission.
- Use `type="submit"` inside `<form>` elements.
- `disabled` prevents click events and communicates state to assistive technology.

---

### Input

**File:** `Input.tsx`

```tsx
// Basic text input (always pair with FormField for label)
<FormField label="Trip name" htmlFor="trip-name">
  <Input id="trip-name" value={name} onChange={e => setName(e.target.value)} />
</FormField>

// With validation error
<FormField label="Start date" htmlFor="start" error={errors.start}>
  <Input id="start" type="date" value={start} invalid={!!errors.start} />
</FormField>
```

**Props:** all standard `<input>` HTML attributes + `invalid?: boolean`

**A11y notes:**

- `invalid` sets `aria-invalid="true"` and adds an error border ring.
- Always wrap in `FormField` — the label association is the consuming component's responsibility via `htmlFor` / `id`.

---

### Select

**File:** `Select.tsx`

```tsx
<FormField label="Currency" htmlFor="currency">
  <Select id="currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
    <option value="EUR">EUR</option>
    <option value="USD">USD</option>
  </Select>
</FormField>
```

**Props:** all standard `<select>` HTML attributes + `invalid?: boolean`

Same `invalid` / `aria-invalid` pattern as `Input`.

---

### FormField

**File:** `FormField.tsx`

Layout wrapper that provides label, optional hint, and error message for any
form control.

```tsx
<FormField
  label="Destinations"
  htmlFor="dests"
  hint="Comma-separated list"
  error={errors.destinations}
>
  <Input id="dests" value={dests} invalid={!!errors.destinations} />
</FormField>
```

**A11y notes:**

- Error message uses `role="alert"` for immediate screen-reader announcement.
- `htmlFor` / `id` pair wires the `<label>` to the control — always provide both.

---

## S2 — Layout & feedback primitives

### ListSection / ListRow

**File:** `ListSection.tsx`

```tsx
// Basic list
<ListSection title="Upcoming trips">
  <ListRow>Japan 2026</ListRow>
  <ListRow>Morocco 2027</ListRow>
</ListSection>

// Interactive rows
<ListSection title="Days">
  {days.map(day => (
    <ListRow key={day.id} onClick={() => navigate(day.url)}>
      Day {day.index + 1} — {day.date}
    </ListRow>
  ))}
</ListSection>

// Selected state
<ListRow selected={currentDay === day.id} onClick={() => select(day.id)}>
  {day.date}
</ListRow>
```

**A11y notes:**

- When `onClick` is provided, renders `role="button"` with `tabIndex=0` and responds to Enter / Space.
- `selected` adds a visible accent border and box-shadow; aria state is the caller's responsibility (add `aria-pressed` or `aria-selected` if needed for the specific use-case).

---

### Sheet

**File:** `Sheet.tsx`

Accessible bottom drawer for quick-add / quick-edit on mobile.

```tsx
const [open, setOpen] = useState(false)

<Button onClick={() => setOpen(true)}>Add item</Button>

<Sheet open={open} onClose={() => setOpen(false)} title="Add plan item">
  <PlanItemForm onSave={() => setOpen(false)} />
</Sheet>
```

**A11y notes:**

- `role="dialog"` + `aria-modal="true"` + `aria-label={title}`.
- Escape key calls `onClose`.
- Close button receives initial focus on open.
- Overlay click calls `onClose`; click inside the sheet does not propagate.

---

### ProgressBar

**File:** `ProgressBar.tsx`

Used for budget bars (Milestone 05) and storage usage indicators (Milestone 06).
Accent colour is sanctioned for this use case.

```tsx
// Default (accent fill)
<ProgressBar value={spent / budget} label="Food budget" caption="€60 / €100" />

// Over-budget (error fill)
<ProgressBar value={1.3} variant="over" label="Transport budget" caption="€130 / €100" />

// Warning threshold
<ProgressBar value={0.85} variant="warning" label="Accommodation budget" />
```

**Props:**

- `value` — fraction in [0, 1]; values outside this range are clamped for display.
- `variant` — `"default"` | `"over"` | `"warning"`
- `label` — required accessible name (maps to `aria-label`).
- `caption` — optional visible text above the bar.

**A11y notes:**

- `role="progressbar"` with `aria-valuenow`, `aria-valuemin=0`, `aria-valuemax=100`.

---

## S3 — Navigation primitives

### NavBar

**File:** `NavBar.tsx`

Top-of-page navigation header.

```tsx
// Trip shell header
<NavBar
  backTo="/"
  backLabel="All trips"
  title={trip.name}
  subtitle={trip.destinations.join(', ')}
  actions={<Link to="budget" className="btn-secondary btn-sm">Budget</Link>}
/>

// Simple page header (no back)
<NavBar title="Profile" />
```

**A11y notes:**

- Renders as `<header role="banner">` — correct landmark for page-level headers.
- Back link has a visible `aria-label` for screen readers.
- Actions slot accepts any interactive element; ensure each has its own accessible name.

---

### BottomNav

**File:** `BottomNav.tsx`

Fixed bottom tab bar for mobile navigation. Rendered once at the app shell level.

```tsx
const navItems: BottomNavItem[] = [
  { to: '/', label: 'Home', icon: '🏠' },
  { to: '/trips', label: 'Trips', icon: '✈️' },
  { to: '/profile', label: 'Profile', icon: '👤' },
]

<BottomNav items={navItems} />
```

**A11y notes:**

- `<nav aria-label="Main navigation">` — named landmark.
- Active link gets `bottom-nav-link--active` class (accent colour).
- Minimum 48px tap target height.
- `safe-area-inset-bottom` padding for devices with home indicator.

---

### DayNavBar

**File:** `DayNavBar.tsx`

Prev / next day navigation strip used inside a trip shell.

```tsx
<DayNavBar
  dates={trip.days.map((d) => d.date)}
  currentDate={selectedDate}
  onDateChange={setSelectedDate}
/>
```

**A11y notes:**

- Renders `<nav aria-label="Day navigation">`.
- Prev/next buttons have `aria-label` ("Previous day" / "Next day").
- Buttons are `disabled` (not hidden) at boundaries so screen readers can discover the control.
- `<select>` has `aria-label="Select day"` for direct date jumping.

---

## Consuming components — what not to re-implement

| Need                    | Use                                                                   |
| ----------------------- | --------------------------------------------------------------------- |
| A button                | `<Button>` — never raw `<button className="btn-primary">` in new code |
| A text/date/url input   | `<Input>` + `<FormField>`                                             |
| A dropdown              | `<Select>` + `<FormField>`                                            |
| A list of items         | `<ListSection>` + `<ListRow>`                                         |
| A modal/sheet           | `<Sheet>` for mobile-first; `ConfirmModal` for destructive confirms   |
| A budget / usage bar    | `<ProgressBar>`                                                       |
| A page header with back | `<NavBar>`                                                            |
| Bottom tab bar          | `<BottomNav>`                                                         |
| Day prev/next           | `<DayNavBar>`                                                         |
