import type { SVGProps } from 'react'

// Icon is the app's single set of inline stroke icons (24×24, 2px stroke, round
// caps), replacing the emoji that used to stand in as UI icons. Always
// decorative: the control carrying the icon owns the accessible name.
export type IconName =
  | 'days'
  | 'map'
  | 'journal'
  | 'money'
  | 'prep'
  | 'backlog'
  | 'back'
  | 'chevron-right'
  | 'chevron-left'
  | 'chevron-down'
  | 'plus'
  | 'more'
  | 'check'
  | 'bed'
  | 'camera'
  | 'share'
  | 'activity'
  | 'transport'
  | 'food'
  | 'note'
  | 'grip'
  | 'close'
  | 'trash'
  | 'search'
  | 'user'
  | 'fit'
  | 'edit'
  | 'package'

const PATHS: Record<IconName, string[]> = {
  edit: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'],
  package: ['M21 8l-9-5-9 5 9 5 9-5z', 'M3 8v8l9 5 9-5V8', 'M12 13v8'],
  days: [
    'M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    'M3 10h18M8 3v4M16 3v4',
  ],
  map: ['M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3z', 'M9 4v13M15 7v13'],
  journal: ['M4 4h12a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4z', 'M8 9h8M8 13h5'],
  money: [
    'M5 6h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z',
    'M3 10h18M16 15h2',
  ],
  prep: ['M9 11l3 3 8-8', 'M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9'],
  backlog: [
    'M9 18h6M10 21h4',
    'M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z',
  ],
  back: ['M15 18l-6-6 6-6'],
  'chevron-left': ['M15 18l-6-6 6-6'],
  'chevron-right': ['M9 18l6-6-6-6'],
  'chevron-down': ['M6 9l6 6 6-6'],
  plus: ['M12 5v14M5 12h14'],
  more: ['M5 12h.01M12 12h.01M19 12h.01'],
  check: ['M5 12l5 5 9-10'],
  bed: ['M3 18V8M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5', 'M7 9a2 2 0 1 0 0 4 2 2 0 0 0 0-4z'],
  camera: [
    'M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    'M12 9.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
  ],
  share: [
    'M16 19a4 4 0 0 0-8 0',
    'M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    'M20 19a3.5 3.5 0 0 0-5-3.2',
    'M4 19a3.5 3.5 0 0 1 5-3.2',
  ],
  activity: [
    'M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11z',
    'M12 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  ],
  transport: [
    'M6 4h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
    'M4 11h16M8 20l1.5-3M16 20l-1.5-3',
  ],
  food: ['M7 3v8a2 2 0 0 0 2 2v8M11 3v8M7 7h4', 'M17 21V3c-2 1-3 4-3 7h3'],
  note: ['M6 3h9l4 4v14H6z', 'M14 3v5h5M9 13h7M9 17h5'],
  grip: ['M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01'],
  close: ['M6 6l12 12M18 6L6 18'],
  trash: [
    'M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2',
    'M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12',
  ],
  search: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'M21 21l-4.3-4.3'],
  user: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M5 20a7 7 0 0 1 14 0'],
  fit: ['M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5'],
}

export function Icon({
  name,
  size = 20,
  strokeWidth = 2,
  ...rest
}: { name: IconName; size?: number; strokeWidth?: number } & SVGProps<SVGSVGElement>) {
  // Dot-only paths ("M5 12h.01") render as round dots with a wide stroke.
  const dots = name === 'more' || name === 'grip'
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={dots ? 3.5 : strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}
