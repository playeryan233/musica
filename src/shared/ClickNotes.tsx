import { useEffect, useRef } from 'react';
import { BRAVURA_FAMILY, MUSIC_GLYPHS, ensureBravuraFont } from './bravura';

/** The three note values that may pop out of a click. */
const CLICK_NOTES = [
  MUSIC_GLYPHS.metNoteQuarterUp,
  MUSIC_GLYPHS.metNoteEighthUp,
  MUSIC_GLYPHS.metNoteSixteenthUp,
] as const;

/** Colours are picked from the app's warm accent palette. */
const CLICK_COLORS = ['#b45309', '#9a3412', '#d97706', '#7c2d12', '#c2410c'];

/** Keep the layer light when someone clicks rapidly. */
const MAX_ACTIVE_NOTES = 14;
/** Must match the `click-note-float` animation duration. */
const FLOAT_MS = 900;

interface ClickNotesProps {
  /** Disable the effect (e.g. inside a test harness). */
  disabled?: boolean;
}

function spawnNote(layer: HTMLElement, x: number, y: number): HTMLElement {
  const note = document.createElement('span');
  note.className = 'click-note';
  note.textContent = CLICK_NOTES[Math.floor(Math.random() * CLICK_NOTES.length)];
  note.style.left = `${x}px`;
  note.style.top = `${y}px`;
  note.style.fontSize = `${24 + Math.random() * 12}px`;
  note.style.color = CLICK_COLORS[Math.floor(Math.random() * CLICK_COLORS.length)];
  // Drift to the upper right; the distance and tilt vary per click.
  note.style.setProperty('--dx', `${56 + Math.random() * 84}px`);
  note.style.setProperty('--dy', `${-(84 + Math.random() * 76)}px`);
  note.style.setProperty('--rot', `${(Math.random() * 24 - 12).toFixed(1)}deg`);
  note.style.setProperty('--peak', (0.92 + Math.random() * 0.45).toFixed(2));
  layer.appendChild(note);
  return note;
}

/**
 * Decorative click feedback: every primary click on the page releases a random
 * quarter / eighth / sixteenth note that floats to the upper right and fades
 * out. The layer is fixed, full-screen and `pointer-events: none`, so it never
 * intercepts clicks or affects layout.
 */
export function ClickNotes({ disabled = false }: ClickNotesProps) {
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (disabled) return;
    const layer = layerRef.current;
    if (!layer) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    ensureBravuraFont();
    void document.fonts?.load(`16px ${BRAVURA_FAMILY}`).catch(() => undefined);

    let active = 0;
    const onPointerDown = (event: PointerEvent) => {
      // Primary button only; touch and pen clicks count too.
      if (event.button !== 0) return;
      if (active >= MAX_ACTIVE_NOTES) return;
      active += 1;

      const note = spawnNote(layer, event.clientX, event.clientY);
      let removed = false;
      const remove = () => {
        if (removed) return;
        removed = true;
        active -= 1;
        note.remove();
      };
      note.addEventListener('animationend', remove, { once: true });
      // Fallback for browsers that skip the animation (e.g. background tab).
      window.setTimeout(remove, FLOAT_MS + 300);
    };

    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [disabled]);

  return (
    <div className="click-notes" ref={layerRef} aria-hidden="true">
      {/*
        Render the glyphs once, off-screen, so the browser fetches Bravura as
        soon as the app starts. Otherwise the first click would be laid out with
        `font-display: block` and stay invisible until the font arrives.
      */}
      <span className="click-note-preload">
        {MUSIC_GLYPHS.metNoteQuarterUp}
        {MUSIC_GLYPHS.metNoteEighthUp}
        {MUSIC_GLYPHS.metNoteSixteenthUp}
      </span>
    </div>
  );
}
