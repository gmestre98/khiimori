# S1 — Web app manifest, icons & installability

## Context
The app is an **installable PWA** (manifest, icons) that launches standalone on a phone (PRD §7.2). This
story makes it installable.

## Task
Add the web app manifest and icons so the app is installable and launches standalone.

## Acceptance criteria
- [ ] A **web app manifest** defines name, theme/background colours (from Epic 01 tokens), display
  `standalone`, and start URL.
- [ ] **Icons** (required sizes) are provided, following the minimal black/white identity.
- [ ] The app meets installability criteria and can be **added to home screen / installed**, launching
  **standalone** (no browser chrome).
- [ ] Installability is verified on a mobile browser.

## Constraints
- Manifest colours/identity come from Epic 01 tokens.
- A service worker is required for full PWA installability — scaffold/registration coordinated with S2.

## Definition of done
The app is installable and launches standalone with correct manifest + icons.

## Dependencies
M01.6 (web shell), Epic 01 (theme/icons). Service worker in S2.
