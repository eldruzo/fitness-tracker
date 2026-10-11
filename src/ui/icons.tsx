import type { JSX } from 'preact';

/**
 * Custom icon set: 24px grid, 1.75px stroke, square caps, miter joins.
 * Decorative by default (aria-hidden); pass `label` to make one meaningful.
 */
const paths = {
  today: 'M5 4h14v17H5zM9 2.5v3M15 2.5v3M8 10h8M8 14h5',
  plan: 'M3.5 5h17v15.5h-17zM3.5 9.5h17M8 3v4M16 3v4M8 13.5h2M14 13.5h2M8 17h2M14 17h2',
  progress: 'M3.5 20.5h17M4.5 16l5-5.5 4 3 6-7M15.5 6.5h4v4',
  body: 'M4 6h16v14.5H4zM8.5 10.5a3.5 3.5 0 0 1 7 0M12 10.5l1.5-2',
  settings: 'M4 7h9M17 7h3M4 17h3M11 17h9M13 4.5v5M7 14.5v5',
  check: 'M4.5 12.5l5 5 10-11',
  close: 'M6 6l12 12M18 6L6 18',
  undo: 'M8 8.5H15a5 5 0 0 1 0 10H9M8 8.5l3.5-3.5M8 8.5l3.5 3.5',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  skip: 'M5 6l8 6-8 6zM17 6v12',
  timer: 'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4.5l2.5 1.5M9.5 2.5h5',
  left: 'M14.5 5.5L8 12l6.5 6.5',
  right: 'M9.5 5.5L16 12l-6.5 6.5',
  down: 'M5.5 9.5L12 16l6.5-6.5',
  download: 'M12 4v11M7 10.5l5 5 5-5M4.5 20h15',
  upload: 'M12 16V5M7 9.5l5-5 5 5M4.5 20h15',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5v.5',
  pause: 'M8 5v14M16 5v14',
  play: 'M7 5l12 7-12 7z',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  swap: 'M4 8h14M14.5 4.5L18 8l-3.5 3.5M20 16H6M9.5 12.5L6 16l3.5 3.5',
  rest: 'M4 18h16M4 14h16v-3a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3z',
  install: 'M7 3h10v18H7zM12 7v7M9.5 11.5L12 14l2.5-2.5M10.5 18h3',
  share: 'M12 3v12M8 6.5L12 3l4 3.5M5.5 10.5v10h13v-10',
  warn: 'M12 3.5L21 20H3zM12 10v4.5M12 17v.5',
  bell: 'M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15zM10 21h4',
  file: 'M6 3h8l4 4v14H6zM14 3v4h4',
  trash: 'M4.5 6.5h15M9.5 6.5V4h5v2.5M6.5 6.5l1 14h9l1-14',
  more: 'M5 12h.5M12 12h.5M19 12h.5',
} as const;

export type IconName = keyof typeof paths;

export function Icon({
  name,
  size = 24,
  label,
  class: cls,
}: {
  name: IconName;
  size?: number;
  label?: string;
  class?: string;
}): JSX.Element {
  return (
    <svg
      class={`icon ${cls ?? ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="square"
      stroke-linejoin="miter"
      aria-hidden={label ? undefined : 'true'}
      role={label ? 'img' : undefined}
      aria-label={label}
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  );
}

/** Status glyphs: shape + word carry meaning, color is secondary. */
export type Glyph =
  | 'done'
  | 'partial'
  | 'missed'
  | 'skipped'
  | 'rest'
  | 'pending'
  | 'today'
  | 'upcoming'
  | 'paused'
  | 'active'
  | 'before'
  | 'after';

export function StatusGlyph({ status, size = 16 }: { status: Glyph; size?: number }) {
  const s = size;
  const common = { width: s, height: s, viewBox: '0 0 16 16', 'aria-hidden': 'true' as const, class: `glyph glyph-${status}` };
  switch (status) {
    case 'done':
      return (
        <svg {...common}>
          <rect x="1" y="1" width="14" height="14" fill="currentColor" />
          <path d="M4 8.5l2.5 2.5L12 5.5" stroke="var(--glyph-on, var(--bg))" stroke-width="1.75" fill="none" stroke-linecap="square" />
        </svg>
      );
    case 'partial':
    case 'active':
      return (
        <svg {...common}>
          <rect x="1.75" y="1.75" width="12.5" height="12.5" fill="none" stroke="currentColor" stroke-width="1.5" />
          <path d="M1.75 14.25L14.25 1.75V14.25z" fill="currentColor" />
        </svg>
      );
    case 'missed':
      return (
        <svg {...common}>
          <rect x="1.75" y="1.75" width="12.5" height="12.5" fill="none" stroke="currentColor" stroke-width="1.5" />
          <path d="M2 14L14 2" stroke="currentColor" stroke-width="1.5" />
        </svg>
      );
    case 'skipped':
      return (
        <svg {...common}>
          <rect x="1.75" y="1.75" width="12.5" height="12.5" fill="none" stroke="currentColor" stroke-width="1.5" />
          <path d="M5 8h6" stroke="currentColor" stroke-width="1.75" />
        </svg>
      );
    case 'rest':
      return (
        <svg {...common}>
          <path d="M2 11h12" stroke="currentColor" stroke-width="1.5" />
        </svg>
      );
    case 'paused':
      return (
        <svg {...common}>
          <path d="M5.5 3v10M10.5 3v10" stroke="currentColor" stroke-width="1.75" />
        </svg>
      );
    case 'pending':
      return (
        <svg {...common}>
          <rect x="1.75" y="1.75" width="12.5" height="12.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 2" />
        </svg>
      );
    case 'today':
      return (
        <svg {...common}>
          <rect x="1.75" y="1.75" width="12.5" height="12.5" fill="none" stroke="currentColor" stroke-width="2.5" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <rect x="1.75" y="1.75" width="12.5" height="12.5" fill="none" stroke="currentColor" stroke-width="1" />
        </svg>
      );
  }
}
