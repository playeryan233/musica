/**
 * The Musica brand mark: a warm gradient tile with a beamed pair of notes on
 * three staff lines. Kept as inline SVG so it stays crisp at any size and needs
 * no extra request.
 */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 36 36"
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="musica-brand-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f59e0b" />
          <stop offset="55%" stopColor="#c2410c" />
          <stop offset="100%" stopColor="#7c2d12" />
        </linearGradient>
      </defs>
      <rect width="36" height="36" rx="11" fill="url(#musica-brand-gradient)" />
      <g stroke="#fff" strokeWidth="1" strokeLinecap="round" opacity="0.5">
        <line x1="7" y1="15" x2="29" y2="15" />
        <line x1="7" y1="19" x2="29" y2="19" />
        <line x1="7" y1="23" x2="29" y2="23" />
      </g>
      <g fill="#fff">
        <ellipse cx="13" cy="21" rx="3.1" ry="2.5" transform="rotate(-18 13 21)" />
        <ellipse cx="24" cy="18" rx="3.1" ry="2.5" transform="rotate(-18 24 18)" />
      </g>
      <g stroke="#fff" strokeWidth="1.7" strokeLinecap="round">
        <line x1="16" y1="20.3" x2="16" y2="10.5" />
        <line x1="27" y1="17.3" x2="27" y2="7.5" />
      </g>
      <path d="M16 9.3 L27 6.3 L27 8.7 L16 11.7 Z" fill="#fff" />
    </svg>
  );
}
