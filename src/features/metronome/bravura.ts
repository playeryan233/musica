/**
 * Bravura is the SMuFL music font shipped with alphaTab. The Vite plugin
 * copies it into `<base>/font/` at build time, so we can load it ourselves for
 * the metronome staff without going through alphaTab's renderer.
 *
 * The @font-face rule is injected at runtime (instead of living in styles.css)
 * so the URL follows `import.meta.env.BASE_URL` and sub-path deployments keep
 * working without Vite trying to resolve a `public/` asset at build time.
 */
export const BRAVURA_FAMILY = 'Bravura';

const codePoint = (value: number): string => String.fromCodePoint(value);

/** SMuFL codepoints used by the staff. */
export const MUSIC_GLYPHS = {
  gClef: codePoint(0xe050),
  noteheadBlack: codePoint(0xe0a4),
  noteheadHalf: codePoint(0xe0a3),
  restWhole: codePoint(0xe4e3),
  restHalf: codePoint(0xe4e4),
  restQuarter: codePoint(0xe4e5),
  rest8th: codePoint(0xe4e6),
  rest16th: codePoint(0xe4e7),
  flag8thUp: codePoint(0xe240),
  flag8thDown: codePoint(0xe241),
  flag16thUp: codePoint(0xe242),
  flag16thDown: codePoint(0xe243),
  flag32ndUp: codePoint(0xe244),
  flag32ndDown: codePoint(0xe245),
  tuplet3: codePoint(0xe883),
  accentAbove: codePoint(0xe4a0),
} as const;

/** Number glyph for a time-signature digit (0-9). */
export function timeSigGlyph(digit: number): string {
  return codePoint(0xe080 + digit);
}

let installed = false;

/** Inject the @font-face rule once; safe to call from an effect. */
export function ensureBravuraFont(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;

  const url = `${import.meta.env.BASE_URL}font/Bravura.woff2`;
  const style = document.createElement('style');
  style.dataset.musicaFont = BRAVURA_FAMILY;
  style.textContent = `@font-face{font-family:'${BRAVURA_FAMILY}';src:url('${url}') format('woff2');font-weight:400;font-style:normal;font-display:block;}`;
  document.head.appendChild(style);
}
