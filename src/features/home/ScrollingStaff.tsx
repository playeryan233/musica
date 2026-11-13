import { useEffect, useMemo, useRef, useState } from 'react';
import { BRAVURA_FAMILY, MUSIC_GLYPHS, ensureBravuraFont } from '../../shared/bravura';

/**
 * A decorative, endlessly scrolling staff for the home page.
 *
 * Notes are random on every visit but follow notation rules: eighth / sixteenth
 * notes are grouped and beamed, and a beamed group is usually a stepwise run
 * (all ascending or all descending). Bar lines are placed every 4/4 bar.
 *
 * The left side has an invisible "hit line". A note that reaches it flashes,
 * bursts particles and keeps a bright colour derived from its pitch while it
 * continues scrolling away.
 */

const STAFF_SPACE = 14;
const PX_PER_SECOND = 120;
const BEATS_PER_BAR = 4;
/** The phrase is at least this wide so it always covers the container. */
const MIN_PHRASE_WIDTH = 3400;
/** Extra phrase width beyond the window, so no gap can appear. */
const PHRASE_MARGIN = 800;
/** Invisible hit line, as a fraction of the container width (with a minimum). */
const HIT_LINE_RATIO = 0.16;
const HIT_LINE_MIN = 140;
/** A note this far left of the hit line is only coloured, no burst. */
const BURST_WINDOW = 80;

const NOTE_HEAD_SCALE = 0.9;
const STEM_WIDTH_FACTOR = 0.12;
const STEM_LENGTH_FACTOR = 3.4;
const MIN_STEM_FACTOR = 2.6;
const BEAM_THICKNESS_FACTOR = 0.46;
const BEAM_GAP_FACTOR = 0.72;
const MAX_BEAM_SLOPE = 0.34;
const FLAG_EM_FACTOR = 4;

type Duration = 0.25 | 0.5 | 1 | 2;

interface PhraseNote {
  key: string;
  x: number;
  /** Staff steps from the middle line: 0 = middle line, 1 = space above. */
  pitch: number;
  duration: Duration;
}

interface PhraseGroup {
  notes: PhraseNote[];
}

interface Phrase {
  groups: PhraseGroup[];
  bars: number[];
  width: number;
}

interface BeamSpan {
  /** Offset from the note anchor. */
  top: number;
  width: number;
  skew: string;
}

interface NoteRender {
  note: PhraseNote;
  y: number;
  stemX: number;
  stemTop: number;
  stemHeight: number;
  beams: BeamSpan[];
  flag: string | null;
  flagTop: number;
}

const clampPitch = (pitch: number): number => Math.max(-4, Math.min(4, pitch));

/** Horizontal room a note value takes, loosely proportional to its duration. */
function noteWidth(duration: Duration): number {
  return 26 + duration * 40;
}

function pickBeamed(remaining: number): { count: number; duration: Duration } | null {
  const duration: Duration = Math.random() < 0.5 ? 0.5 : 0.25;
  const maxCount = Math.min(4, Math.floor(remaining / duration));
  if (maxCount < 2) return null;
  const count = 2 + Math.floor(Math.random() * (maxCount - 1));
  return { count, duration };
}

function buildPhrase(minWidth: number): Phrase {
  const groups: PhraseGroup[] = [];
  const bars: number[] = [];
  let x = 56;
  let pitch = Math.floor(Math.random() * 7) - 3;
  let groupIndex = 0;

  while (x < minWidth) {
    // Build bar by bar so bar lines never cut a beamed group in half.
    let remaining = BEATS_PER_BAR;

    while (remaining > 0) {
      const beamed = Math.random() < 0.7 ? pickBeamed(remaining) : null;
      const notes: PhraseNote[] = [];

      if (beamed) {
        // A run: mostly a straight chromatic-ish ascent or descent.
        let direction = Math.random() < 0.5 ? 1 : -1;
        for (let i = 0; i < beamed.count; i++) {
          if (pitch + direction > 4 || pitch + direction < -4) direction = -direction;
          pitch = clampPitch(pitch + direction);
          notes.push({ key: `${groupIndex}-${i}`, x, pitch, duration: beamed.duration });
          x += noteWidth(beamed.duration);
          remaining -= beamed.duration;
        }
      } else {
        const options = ([1, 1, 0.5, 0.25, 2] as Duration[]).filter((d) => d <= remaining);
        const duration = options[Math.floor(Math.random() * options.length)] ?? 0.25;
        pitch = clampPitch(pitch + (Math.random() < 0.5 ? -1 : 1));
        notes.push({ key: `${groupIndex}-0`, x, pitch, duration });
        x += noteWidth(duration);
        remaining -= duration;
      }

      groups.push({ notes });
      groupIndex += 1;
    }

    bars.push(x);
  }

  return { groups, bars, width: x };
}

function beamCountFor(duration: Duration): number {
  return duration <= 0.25 ? 2 : 1;
}

function flagFor(duration: Duration, stemUp: boolean): string | null {
  if (duration > 0.5) return null;
  if (duration <= 0.25) {
    return stemUp ? MUSIC_GLYPHS.flag16thUp : MUSIC_GLYPHS.flag16thDown;
  }
  return stemUp ? MUSIC_GLYPHS.flag8thUp : MUSIC_GLYPHS.flag8thDown;
}

interface Geometry {
  space: number;
  headEm: number;
  headHalfWidth: number;
  headAttach: number;
  stemWidth: number;
  stemLength: number;
  minStem: number;
  beamThickness: number;
  beamGap: number;
  flagEm: number;
}

function geometryFor(space: number): Geometry {
  const headEm = space * 4 * NOTE_HEAD_SCALE;
  return {
    space,
    headEm,
    headHalfWidth: 0.1475 * headEm,
    headAttach: 0.042 * headEm,
    stemWidth: STEM_WIDTH_FACTOR * space,
    stemLength: STEM_LENGTH_FACTOR * space,
    minStem: MIN_STEM_FACTOR * space,
    beamThickness: BEAM_THICKNESS_FACTOR * space,
    beamGap: BEAM_GAP_FACTOR * space,
    flagEm: FLAG_EM_FACTOR * space,
  };
}

/** Positions one note; beamed groups share a fitted, clamped beam line. */
function layoutGroup(group: PhraseGroup, geo: Geometry): NoteRender[] {
  const notes = group.notes;
  const yOf = (note: PhraseNote) => -(note.pitch * geo.space) / 2;

  if (notes.length === 1) {
    const note = notes[0];
    const y = yOf(note);
    const stemUp = note.pitch <= 0;
    const attach = y + (stemUp ? -geo.headAttach : geo.headAttach);
    const tip = y + (stemUp ? -geo.stemLength : geo.stemLength);
    const flag = flagFor(note.duration, stemUp);
    return [
      {
        note,
        y,
        stemX: stemUp ? geo.headHalfWidth : -geo.headHalfWidth,
        stemTop: Math.min(attach, tip) - y,
        stemHeight: Math.abs(attach - tip),
        beams: [],
        flag,
        flagTop: tip - 0.5 * geo.flagEm - y,
      },
    ];
  }

  // Stems point away from the average pitch, and all tips hang on one beam.
  const down = notes.reduce((sum, note) => sum + note.pitch, 0) / notes.length > 0;
  const ys = notes.map(yOf);
  const ideal = ys.map((y) => y + (down ? geo.stemLength : -geo.stemLength));

  const meanX = notes.reduce((sum, note) => sum + note.x, 0) / notes.length;
  const meanY = ideal.reduce((sum, value) => sum + value, 0) / ideal.length;
  let covariance = 0;
  let variance = 0;
  notes.forEach((note, index) => {
    const dx = note.x - meanX;
    covariance += dx * (ideal[index] - meanY);
    variance += dx * dx;
  });
  const rawSlope = variance > 0 ? covariance / variance : 0;
  const slope = Math.max(-MAX_BEAM_SLOPE, Math.min(MAX_BEAM_SLOPE, rawSlope));

  let line = notes.map((note) => meanY + slope * (note.x - meanX));

  // Shift the beam so every stem keeps a usable length.
  let shift = 0;
  ys.forEach((y, index) => {
    const bound = y + (down ? geo.minStem : -geo.minStem);
    shift = down ? Math.max(shift, bound - line[index]) : Math.min(shift, bound - line[index]);
  });
  line = line.map((value) => value + shift);

  const beamCount = beamCountFor(notes[0].duration);

  return notes.map((note, i) => {
    const y = ys[i];
    const attach = y + (down ? geo.headAttach : -geo.headAttach);
    const beamY = line[i];
    const primaryTop = down ? beamY : beamY - geo.beamThickness;
    const beamTops = Array.from({ length: beamCount }, (_, level) =>
      (down ? primaryTop - level * geo.beamGap : primaryTop + level * geo.beamGap) - y,
    );

    const beams: BeamSpan[] = [];
    if (i < notes.length - 1) {
      const width = notes[i + 1].x - note.x;
      const dy = line[i + 1] - beamY;
      const skew = `${Math.atan2(dy, width).toFixed(4)}rad`;
      for (const top of beamTops) beams.push({ top, width, skew });
    }

    return {
      note,
      y,
      stemX: down ? -geo.headHalfWidth : geo.headHalfWidth,
      stemTop: Math.min(attach, beamY) - y,
      stemHeight: Math.max(4, Math.abs(attach - beamY)),
      beams,
      flag: null,
      flagTop: 0,
    };
  });
}

/** Bright, high-saturation colour: low notes are cool, high notes warm. */
function colorForPitch(pitch: number): string {
  const hue = 240 - (pitch + 4) * 28; // -4 → 240 (blue) … +4 → 16 (orange-red)
  return `hsl(${hue} 95% 50%)`;
}

interface StaffNoteProps {
  render: NoteRender;
  offsetX: number;
  elementRef: (el: HTMLSpanElement | null) => void;
}

function StaffNote({ render, offsetX, elementRef }: StaffNoteProps) {
  const { note, y, stemX, stemTop, stemHeight, beams, flag, flagTop } = render;
  return (
    <span
      className="home-staff-note"
      ref={elementRef}
      style={{ left: note.x + offsetX, transform: `translateY(${y}px)` }}
    >
      <span className="home-staff-head">{MUSIC_GLYPHS.noteheadBlack}</span>
      <span className="home-staff-stem" style={{ left: stemX, top: stemTop, height: stemHeight }} />
      {beams.map((beam, level) => (
        <span
          key={`beam-${level}`}
          className="home-staff-beam"
          style={{
            left: stemX,
            top: beam.top,
            width: beam.width,
            transform: `skewY(${beam.skew})`,
          }}
        />
      ))}
      {flag && (
        <span className="home-staff-flag" style={{ left: stemX, top: flagTop }}>
          {flag}
        </span>
      )}
    </span>
  );
}

export function ScrollingStaff() {
  const stageRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const noteElements = useRef(new Map<string, HTMLSpanElement>());
  const hitKeys = useRef(new Set<string>());
  const hitLineRef = useRef(HIT_LINE_MIN);
  const centerYRef = useRef(0);

  const [phraseWidth, setPhraseWidth] = useState(() =>
    typeof window === 'undefined'
      ? MIN_PHRASE_WIDTH
      : Math.max(MIN_PHRASE_WIDTH, Math.ceil(window.innerWidth) + PHRASE_MARGIN),
  );
  const [fontReady, setFontReady] = useState(() => {
    if (typeof document === 'undefined' || !document.fonts) return false;
    return document.fonts.check(`16px ${BRAVURA_FAMILY}`);
  });

  const phrase = useMemo(() => buildPhrase(phraseWidth), [phraseWidth]);
  const geo = useMemo(() => geometryFor(STAFF_SPACE), []);

  const layout = useMemo(
    () =>
      phrase.groups.map((group) => ({
        notes: layoutGroup(group, geo),
      })),
    [phrase, geo],
  );

  /** Flat index used by the hit detection loop. */
  const noteIndex = useMemo(() => {
    const list: { key: string; x: number; y: number; pitch: number }[] = [];
    for (const offset of [0, phrase.width]) {
      for (const group of layout) {
        for (const render of group.notes) {
          list.push({
            key: `${offset}:${render.note.key}`,
            x: render.note.x + offset,
            y: render.y,
            pitch: render.note.pitch,
          });
        }
      }
    }
    return list;
  }, [layout, phrase.width]);

  useEffect(() => {
    ensureBravuraFont();
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    if (!fonts) {
      setFontReady(true);
      return;
    }
    let cancelled = false;
    fonts
      .load(`16px ${BRAVURA_FAMILY}`)
      .then(() => {
        if (!cancelled) setFontReady(true);
      })
      .catch(() => {
        if (!cancelled) setFontReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const measure = () => {
      const stage = stageRef.current;
      if (stage) {
        hitLineRef.current = Math.max(HIT_LINE_MIN, stage.clientWidth * HIT_LINE_RATIO);
        centerYRef.current = stage.clientHeight / 2;
      }
    };
    measure();
    window.addEventListener('resize', measure);

    const nextWidth = Math.max(MIN_PHRASE_WIDTH, Math.ceil(window.innerWidth) + PHRASE_MARGIN);
    setPhraseWidth((current) => (nextWidth > current ? nextWidth : current));

    return () => window.removeEventListener('resize', measure);
  }, []);

  // Marquee + hit detection. The transform is written from JavaScript instead
  // of a CSS animation so the loop knows every note's exact position.
  useEffect(() => {
    const stage = stageRef.current;
    const track = trackRef.current;
    if (!stage || !track) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const offsetLimit = phrase.width;

    const resetHits = () => {
      for (const element of noteElements.current.values()) {
        element.classList.remove('is-hit');
        element.style.removeProperty('--note-color');
      }
      hitKeys.current.clear();
    };

    const spawnBurst = (x: number, y: number, color: string) => {
      const burst = document.createElement('div');
      burst.className = 'home-staff-burst';
      burst.style.left = `${x}px`;
      burst.style.top = `${y}px`;
      for (let i = 0; i < 9; i++) {
        const particle = document.createElement('span');
        particle.className = 'home-staff-particle';
        const angle = Math.random() * Math.PI * 2;
        const distance = 18 + Math.random() * 30;
        particle.style.background = color;
        particle.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
        particle.style.setProperty('--dy', `${Math.sin(angle) * distance - 10}px`);
        particle.style.setProperty('--delay', `${Math.random() * 40}ms`);
        burst.appendChild(particle);
      }
      stage.appendChild(burst);
      window.setTimeout(() => burst.remove(), 700);
    };

    const updateHits = (offset: number, wrapped: boolean) => {
      if (wrapped) resetHits();

      const hitLine = hitLineRef.current;
      const centerY = centerYRef.current;

      for (const item of noteIndex) {
        if (hitKeys.current.has(item.key)) continue;
        const screenX = item.x - offset;
        if (screenX > hitLine) continue;

        hitKeys.current.add(item.key);
        const element = noteElements.current.get(item.key);
        if (!element) continue;

        const color = colorForPitch(item.pitch);
        element.style.setProperty('--note-color', color);
        element.classList.add('is-hit');
        if (screenX > hitLine - BURST_WINDOW) {
          spawnBurst(hitLine, centerY + item.y, color);
        }
      }
    };

    resetHits();
    track.style.transform = 'translate3d(0, 0, 0)';

    let offset = 0;
    let last = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;

      const next = offset + (PX_PER_SECOND * dt) / 1000;
      const wrapped = next >= offsetLimit;
      offset = wrapped ? next - offsetLimit : next;

      track.style.transform = `translate3d(${-offset}px, 0, 0)`;
      updateHits(offset, wrapped);

      frame = requestAnimationFrame(tick);
    };

    // The first frame also colours the notes that already sit left of the line.
    updateHits(0, false);
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      for (const element of noteElements.current.values()) {
        element.classList.remove('is-hit');
        element.style.removeProperty('--note-color');
      }
      hitKeys.current.clear();
    };
  }, [noteIndex, phrase.width]);

  const staffHeight = STAFF_SPACE * 4;

  return (
    <div
      className={`home-staff${fontReady ? ' is-font-ready' : ''}`}
      ref={stageRef}
      aria-hidden="true"
    >
      {[0, 1, 2, 3, 4].map((line) => (
        <span
          key={line}
          className="home-staff-line"
          style={{ top: `calc(50% + ${(line - 2) * STAFF_SPACE}px)` }}
        />
      ))}

      <div className="home-staff-clip">
        <div className="home-staff-track" ref={trackRef}>
          {[0, phrase.width].map((offset) => (
            <span key={`copy-${offset}`}>
              {phrase.bars.map((bar) => (
                <span
                  key={`bar-${offset}-${bar}`}
                  className="home-staff-bar"
                  style={{
                    left: bar + offset,
                    top: `calc(50% - ${staffHeight / 2}px)`,
                    height: staffHeight,
                  }}
                />
              ))}
              {layout.map((group, groupIndex) =>
                group.notes.map((render) => {
                  const key = `${offset}:${render.note.key}`;
                  return (
                    <StaffNote
                      key={`${groupIndex}-${render.note.key}`}
                      render={render}
                      offsetX={offset}
                      elementRef={(element) => {
                        if (element) noteElements.current.set(key, element);
                        else noteElements.current.delete(key);
                      }}
                    />
                  );
                }),
              )}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
