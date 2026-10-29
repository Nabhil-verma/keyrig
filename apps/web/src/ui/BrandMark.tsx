interface BrandMarkProps {
  size?: number;
  title?: string;
}

/**
 * The exact 64x64 keyrig mark. Geometry comes from the logo kit README.
 * Amber is always the key. Cyan is always the AI link. The CSS variables
 * change to the dark variants on a light background (BR-01).
 */
export function BrandMark({ size = 28, title }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
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
    </svg>
  );
}
