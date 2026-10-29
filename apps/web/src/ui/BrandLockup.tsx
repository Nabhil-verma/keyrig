interface BrandLockupProps {
  /** Height of the lockup in pixels. The width follows the kit ratio. */
  height?: number;
  title?: string;
}

/** The kit draws the mark and the wordmark on a 64-unit grid. */
const LOCKUP_WIDTH = 157;
const LOCKUP_HEIGHT = 31;
const LOCKUP_TOP = 15;

/**
 * The horizontal lockup from the brand kit: the key mark and the outlined
 * geometric wordmark. The kit places a tagline under the wordmark. The header
 * has no room for the tagline (BR-07), so the viewBox crops to the mark and the
 * wordmark only. The path data comes from the kit without a change (BR-07).
 */
export function BrandLockup({ height = 32, title }: BrandLockupProps) {
  const width = Math.round((height * LOCKUP_WIDTH) / LOCKUP_HEIGHT);

  return (
    <svg
      viewBox={`0 ${LOCKUP_TOP} ${LOCKUP_WIDTH} ${LOCKUP_HEIGHT}`}
      width={width}
      height={height}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <g fill="none">
        <circle cx="22" cy="32" r="12" stroke="var(--mark-amber)" strokeWidth="4" />
        <line x1="34" y1="32" x2="58" y2="32" stroke="var(--mark-amber)" strokeWidth="3" strokeLinecap="butt" />
        <line x1="48" y1="32" x2="48" y2="39" stroke="var(--mark-amber)" strokeWidth="2.5" strokeLinecap="butt" />
        <line x1="54" y1="32" x2="54" y2="42" stroke="var(--mark-amber)" strokeWidth="2.5" strokeLinecap="butt" />
        <line x1="22" y1="32" x2="34" y2="32" stroke="var(--mark-cyan)" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="22" y1="32" x2="16" y2="42.3923" stroke="var(--mark-cyan)" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="22" y1="32" x2="16" y2="21.6077" stroke="var(--mark-cyan)" strokeWidth="1.5" strokeLinecap="round" />
      </g>
      <circle cx="22" cy="32" r="2.5" fill="var(--mark-cyan)" />
      <circle cx="34" cy="32" r="1.8" fill="var(--mark-cyan)" />
      <circle cx="16" cy="42.3923" r="1.8" fill="var(--mark-cyan)" />
      <circle cx="16" cy="21.6077" r="1.8" fill="var(--mark-cyan)" />
      <g
        transform="translate(72, 8)"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M0 10 V30 M0 21 L11 10 M4 17.5 L12 30" />
        <path d="M28 21 C28 14 16 14 16 21 C16 28 28 28 28 21 M16 21 H27.5" />
        <path d="M32 12 L38 23 M44 12 L35.5 27.5 C34 30.5 32.5 33 29.5 33" />
        <path d="M48 12 V30 M48 18 C50 13.5 57 13.5 59 16" />
        <path d="M62 12 V30" />
        <path d="M79 12 C67 12 67 23 79 23 C85 23 85 12 79 12 M85 12 V26 C85 33 71 33 71 28" />
      </g>
      <circle cx="134" cy="15" r="1.5" fill="currentColor" />
    </svg>
  );
}
