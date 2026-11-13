import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  BRAVURA_FAMILY,
  MUSIC_GLYPHS,
  ensureBravuraFont,
  timeSigGlyph,
} from '../../shared/bravura';
import { buildPitchMap } from './pitch';
import { clickKindAtStep, stepCount } from './pattern';
import type { BeatUnit, ClickKind, MetronomePattern, Playhead, Subdivision } from './types';

interface StaffStageProps {
  pattern: MetronomePattern;
  pendingPattern: MetronomePattern | null;
  pendingAtStep: number | null;
  playing: boolean;
  playhead: Playhead | null;
  getPosition: () => number | null;
  noteSpeed: number;
  onVisibleSteps: (steps: number) => void;
}

interface Layout {
  spacing: number;
  lineX: number;
  count: number;
  /** Distance between two staff lines, in px. Scales the whole engraving. */
  space: number;
  metaLeft: number;
  metaRight: number;
  clefEm: number;
  sigEm: number;
  sigWidth: number;
  /** Centre of the time signature, relative to the staff's left edge. */
  sigCenter: number;
  showClef: boolean;
}

interface StaffNote {
  step: number;
  loopStep: number;
  patternId: 'A' | 'B';
  kind: ClickKind | null;
  pitch: number;
  /** Vertical offset from the middle staff line, in px. */
  y: number;
  /** Half notes use a hollow notehead. */
  hollow: boolean;
  rest: string | null;
  restTop: number;
  accent: boolean;
  barLine: boolean;
  /** Horizontal offset in px (rests sit at the centre of the muted beat). */
  shift: number;
  beamCount: number;
  /** Consecutive steps that share one beam, following the meter. */
  groupSteps: number;
  tuplet: boolean;
  // Stems and beams, in note-local px coordinates.
  stemUp: boolean;
  stemX: number;
  stemTop: number;
  stemHeight: number;
  beamDraw: boolean;
  beamTops: number[];
  beamSlope: number;
  flag: string | null;
  flagTop: number;
  tupletTop: number;
  accentTop: number;
  accentLeft: number;
}

const INITIAL_LAYOUT: Layout = {
  spacing: 52,
  lineX: 280,
  count: 46,
  space: 30,
  metaLeft: 48,
  metaRight: 150,
  clefEm: 88.8,
  sigEm: 93.6,
  sigWidth: 44.5,
  sigCenter: 96,
  showClef: true,
};

const WINDOW_MARGIN = 12;
const SHIFT_AFTER_STEPS = 6;

/** Fractions of one staff space (the distance between two staff lines). */
const MIN_SPACING_FACTOR = 1.35;
const MAX_SPACING_FACTOR = 3.5;
const NOTE_HEAD_SCALE = 0.9;
const STEM_WIDTH_FACTOR = 0.12;
const STEM_LENGTH_FACTOR = 3.4;
const MIN_STEM_FACTOR = 2.6;
const MAX_BEAM_SLOPE_FACTOR = 0.7;
const BEAM_THICKNESS_FACTOR = 0.46;
const BEAM_GAP_FACTOR = 0.72;
const TUPLET_EM_FACTOR = 3;
const ACCENT_EM_FACTOR = 3.6;

/** Glyph metrics in SMuFL units (one unit = one staff space). */
const CLEF_WIDTH_FACTOR = 2.684;
const CLEF_GAP_FACTOR = 0.42;
const SIG_DIGIT_WIDTH_FACTOR = 1.9;
const SHOW_CLEF_MIN_WIDTH = 340;
/**
 * A full-size treble clef is seven staff spaces tall, which would dominate the
 * animated strip. These scales keep the engraving recognisable without letting
 * the fixed clef/signature eat the whole runway.
 */
const CLEF_SCALE = 0.74;
const SIG_SCALE = 0.78;

function staffSpaceFor(width: number): number {
  if (width < 520) return 21;
  if (width < 900) return 25;
  return 30;
}

interface MetaMetrics {
  metaLeft: number;
  metaRight: number;
  clefEm: number;
  sigEm: number;
  sigWidth: number;
  sigCenter: number;
}

/** Fixed clef + time-signature block at the left of the staff, in px. */
function metaMetricsFor(
  width: number,
  space: number,
  beatsPerBar: number,
  beatUnit: number,
  showClef: boolean,
): MetaMetrics {
  const metaLeft = Math.round(width * 0.04) + 6;
  const clefEm = 4 * space * CLEF_SCALE;
  const clefWidth = showClef ? CLEF_WIDTH_FACTOR * (clefEm / 4) : 0;
  const gap = showClef ? CLEF_GAP_FACTOR * space : 0;
  const sigEm = 4 * space * SIG_SCALE;
  const sigDigits = Math.max(String(beatsPerBar).length, String(beatUnit).length);
  const sigWidth = SIG_DIGIT_WIDTH_FACTOR * (sigEm / 4) * sigDigits;
  return {
    metaLeft,
    metaRight: metaLeft + clefWidth + gap + sigWidth,
    clefEm,
    sigEm,
    sigWidth,
    sigCenter: clefWidth + gap + sigWidth / 2,
  };
}

function geometryFor(space: number) {
  const headEm = space * 4 * NOTE_HEAD_SCALE;
  return {
    headEm,
    // Bravura noteheadBlack is 1.18 × 1.0 staff spaces.
    headHalfWidth: 0.1475 * headEm,
    headAttach: 0.042 * headEm,
    stemWidth: STEM_WIDTH_FACTOR * space,
    stemLength: STEM_LENGTH_FACTOR * space,
    minStem: MIN_STEM_FACTOR * space,
    maxBeamSlope: MAX_BEAM_SLOPE_FACTOR * space,
    beamThickness: BEAM_THICKNESS_FACTOR * space,
    beamGap: BEAM_GAP_FACTOR * space,
    flagEm: 4 * space,
    restEm: 4 * space,
    tupletEm: TUPLET_EM_FACTOR * space,
    accentEm: ACCENT_EM_FACTOR * space,
  };
}
type Geometry = ReturnType<typeof geometryFor>;

interface BuildContext {
  pattern: MetronomePattern;
  pitchMap: number[];
  pendingPattern: MetronomePattern | null;
  pendingPitchMap: number[] | null;
  pendingAtStep: number | null;
  space: number;
  spacing: number;
}

function beamCountFor(beatUnit: BeatUnit, subdivision: Subdivision): number {
  const value = subdivision === 3 ? beatUnit * 2 : beatUnit * subdivision;
  return Math.min(3, Math.max(0, Math.round(Math.log2(value / 4))));
}

function noteValueFor(beatUnit: BeatUnit, subdivision: Subdivision): number {
  return subdivision === 3 ? beatUnit * 2 : beatUnit * subdivision;
}

/**
 * How many consecutive steps share one beam. Compound meters beam eighths or
 * sixteenths in threes (6/8, 9/8, 12/8); simple meters beam inside one beat.
 */
function beamGroupSteps(pattern: MetronomePattern): number {
  const { beatsPerBar, beatUnit, subdivision } = pattern;
  const value = noteValueFor(beatUnit, subdivision);
  if (value <= 4) return Math.max(1, subdivision);

  let beatsPerGroup = 1;
  if (beatUnit === 8) {
    beatsPerGroup = beatsPerBar % 3 === 0 ? 3 : beatsPerBar % 2 === 0 ? 2 : 1;
  } else if (beatUnit === 16) {
    beatsPerGroup = beatsPerBar % 4 === 0 ? 4 : beatsPerBar % 2 === 0 ? 2 : 1;
  }
  return Math.max(1, beatsPerGroup * subdivision);
}

/**
 * Rest glyph for a muted beat. `top` positions the glyph's line box so the
 * rest is optically centred on the middle staff line.
 */
function restFor(beatUnit: BeatUnit, space: number): { glyph: string; top: number } {
  switch (beatUnit) {
    case 2:
      return { glyph: MUSIC_GLYPHS.restHalf, top: -2 * space };
    case 8:
      return { glyph: MUSIC_GLYPHS.rest8th, top: -2.16 * space };
    case 16:
      return { glyph: MUSIC_GLYPHS.rest16th, top: -2.65 * space };
    default:
      return { glyph: MUSIC_GLYPHS.restQuarter, top: -2 * space };
  }
}

function flagFor(beamCount: number, stemUp: boolean): string {
  if (beamCount >= 3) {
    return stemUp ? MUSIC_GLYPHS.flag32ndUp : MUSIC_GLYPHS.flag32ndDown;
  }
  if (beamCount === 2) {
    return stemUp ? MUSIC_GLYPHS.flag16thUp : MUSIC_GLYPHS.flag16thDown;
  }
  return stemUp ? MUSIC_GLYPHS.flag8thUp : MUSIC_GLYPHS.flag8thDown;
}

function buildNotes(context: BuildContext, base: number, count: number): StaffNote[] {
  const { pattern, pitchMap, pendingPattern, pendingPitchMap, pendingAtStep, space, spacing } =
    context;
  const notes: StaffNote[] = [];
  const stepY = space / 2;

  for (let i = 0; i < count; i++) {
    const step = base + i;
    const usePending =
      pendingPattern !== null &&
      pendingPitchMap !== null &&
      pendingAtStep !== null &&
      step >= pendingAtStep;
    const chosen = usePending ? pendingPattern! : pattern;
    const pitches = usePending ? pendingPitchMap! : pitchMap;
    const loopLength = Math.max(1, stepCount(chosen));
    const subdivision = Math.max(1, chosen.subdivision) as Subdivision;
    const loopStep = ((step % loopLength) + loopLength) % loopLength;
    const kind = clickKindAtStep(chosen, loopStep);
    const isBeatStart = loopStep % subdivision === 0;
    // A muted beat is drawn as one rest; its subdivisions stay empty.
    if (kind === null && !isBeatStart) continue;

    const pitch = pitches[loopStep] ?? 0;
    const rest = kind === null ? restFor(chosen.beatUnit, space) : null;
    notes.push({
      step,
      loopStep,
      patternId: usePending ? 'B' : 'A',
      kind,
      pitch,
      // Rests sit on the middle line regardless of the pitch the walk chose.
      y: kind === null ? 0 : -pitch * stepY,
      hollow: noteValueFor(chosen.beatUnit, subdivision) <= 2,
      rest: rest?.glyph ?? null,
      restTop: rest?.top ?? 0,
      accent: kind === 'accent',
      barLine: loopStep % Math.max(1, chosen.beatsPerBar * subdivision) === 0,
      // One rest represents the whole muted beat; centre it over the beat's
      // subdivisions instead of leaving it hanging on the first one.
      shift: kind === null ? ((subdivision - 1) / 2) * spacing : 0,
      beamCount: kind === null ? 0 : beamCountFor(chosen.beatUnit, subdivision),
      groupSteps: beamGroupSteps(chosen),
      tuplet: kind !== null && subdivision === 3 && loopStep % subdivision === 1,
      stemUp: false,
      stemX: 0,
      stemTop: 0,
      stemHeight: 0,
      beamDraw: false,
      beamTops: [],
      beamSlope: 0,
      flag: null,
      flagTop: 0,
      tupletTop: 0,
      accentTop: 0,
      accentLeft: 0,
    });
  }

  decorateNotes(notes, geometryFor(space), space);
  return notes;
}

function decorateNotes(notes: StaffNote[], geo: Geometry, space: number): void {
  const beatKey = (note: StaffNote) =>
    `${note.patternId}:${Math.floor(note.step / Math.max(1, note.groupSteps))}`;

  let index = 0;
  while (index < notes.length) {
    const key = beatKey(notes[index]);
    let end = index + 1;
    while (end < notes.length && beatKey(notes[end]) === key) end++;

    // A rest breaks the beam; each remaining run gets its own stem/beam line.
    let runStart = -1;
    for (let cursor = index; cursor <= end; cursor++) {
      const playable = cursor < end && notes[cursor].kind !== null;
      if (playable && runStart < 0) runStart = cursor;
      if (!playable && runStart >= 0) {
        decorateRun(notes, runStart, cursor - 1, geo, space);
        runStart = -1;
      }
    }
    index = end;
  }

  for (const note of notes) {
    if (!note.accent) continue;
    // Child coordinates are relative to the note anchor, not to the staff
    // centre. Sit the articulation about half a space above the notehead.
    note.accentTop = -0.85 * space - 0.5 * geo.accentEm;
    // The stem rises from one side of the head; nudge the accent the other way
    // so the chevron tip clears it.
    note.accentLeft = (note.stemUp ? -0.1 : 0.1) * space;
  }
}

function decorateRun(
  notes: StaffNote[],
  start: number,
  end: number,
  geo: Geometry,
  space: number,
): void {
  const run = notes.slice(start, end + 1);
  const beamCount = run[0].beamCount;
  const beamed = run.length > 1 && beamCount > 0;

  if (!beamed) {
    for (const note of run) {
      const stemUp = note.pitch <= 0;
      const attach = note.y + (stemUp ? -geo.headAttach : geo.headAttach);
      const tip = note.y + (stemUp ? -geo.stemLength : geo.stemLength);
      note.stemUp = stemUp;
      note.stemX = stemUp ? geo.headHalfWidth : -geo.headHalfWidth;
      note.stemTop = Math.min(attach, tip) - note.y;
      note.stemHeight = Math.abs(attach - tip);
      note.beamDraw = false;
      note.beamTops = [];
      note.beamSlope = 0;
      if (beamCount > 0) {
        note.flag = flagFor(beamCount, stemUp);
        note.flagTop = tip - 0.5 * geo.flagEm - note.y;
      }
    }
    decorateTuplets(run, geo, space, null);
    return;
  }

  const down = run.reduce((sum, note) => sum + note.pitch, 0) / run.length > 0;
  const ideal = run.map((note) => note.y + (down ? geo.stemLength : -geo.stemLength));

  // Fit a beam line through the ideal stem tips, then clamp its slope and
  // shift it vertically so every stem keeps a usable length.
  const n = run.length;
  const meanX = (n - 1) / 2;
  const meanY = ideal.reduce((sum, value) => sum + value, 0) / n;
  let covariance = 0;
  let variance = 0;
  ideal.forEach((value, i) => {
    covariance += (i - meanX) * (value - meanY);
    variance += (i - meanX) ** 2;
  });
  const rawSlope = variance > 0 ? covariance / variance : 0;
  const slope = Math.max(-geo.maxBeamSlope, Math.min(geo.maxBeamSlope, rawSlope));
  let line = ideal.map((_, i) => meanY + slope * (i - meanX));

  let shift = 0;
  for (let i = 0; i < n; i++) {
    const bound = run[i].y + (down ? geo.minStem : -geo.minStem);
    shift = down ? Math.max(shift, bound - line[i]) : Math.min(shift, bound - line[i]);
  }
  line = line.map((value) => value + shift);

  run.forEach((note, i) => {
    const beamY = line[i];
    const attach = note.y + (down ? geo.headAttach : -geo.headAttach);
    note.stemUp = !down;
    note.stemX = down ? -geo.headHalfWidth : geo.headHalfWidth;
    note.stemTop = Math.min(attach, beamY) - note.y;
    note.stemHeight = Math.max(4, Math.abs(attach - beamY));
    note.beamDraw = i < n - 1;
    note.beamSlope = i < n - 1 ? line[i + 1] - line[i] : 0;
    const primaryTop = down ? beamY : beamY - geo.beamThickness;
    note.beamTops = Array.from({ length: beamCount }, (_, level) =>
      (down ? primaryTop - level * geo.beamGap : primaryTop + level * geo.beamGap) - note.y,
    );
    note.flag = null;
  });

  decorateTuplets(run, geo, space, { down, line });
}

/**
 * Centre the tuplet "3" above the group: above the beam for up-stems, and above
 * the highest notehead when the beams sit below the notes.
 */
function decorateTuplets(
  run: StaffNote[],
  geo: Geometry,
  space: number,
  beams: { down: boolean; line: number[] } | null,
): void {
  const marked = run.filter((note) => note.tuplet);
  if (marked.length === 0) return;

  let baseline: number;
  if (beams) {
    if (beams.down) {
      baseline = Math.min(...run.map((note) => note.y)) - 1.9 * space;
    } else {
      baseline = Math.min(...beams.line) - geo.beamThickness - 0.2 * space;
    }
  } else {
    const note = marked[0];
    baseline = note.stemUp ? note.y - geo.stemLength - 0.45 * space : note.y - 1.9 * space;
  }

  for (const note of marked) {
    note.tupletTop = baseline - 0.5 * geo.tupletEm - note.y;
  }
}

export function StaffStage({
  pattern,
  pendingPattern,
  pendingAtStep,
  playing,
  playhead,
  getPosition,
  noteSpeed,
  onVisibleSteps,
}: StaffStageProps) {
  const stageRef = useRef<HTMLElement>(null);
  const [layout, setLayout] = useState<Layout>(INITIAL_LAYOUT);
  const [base, setBase] = useState(0);
  const [fontReady, setFontReady] = useState(() => {
    if (typeof document === 'undefined' || !document.fonts) return false;
    return document.fonts.check(`16px ${BRAVURA_FAMILY}`);
  });

  const baseRef = useRef(0);
  const layoutRef = useRef(layout);
  const spacingRef = useRef(INITIAL_LAYOUT.spacing);
  const positionRef = useRef(0);
  const noteElements = useRef(new Map<number, HTMLElement>());
  const noteShifts = useRef(new Map<number, number>());
  const barElements = useRef(new Map<number, HTMLElement>());
  const lastHit = useRef<number | null>(null);

  layoutRef.current = layout;

  const geo = useMemo(() => geometryFor(layout.space), [layout.space]);
  const pitchMap = useMemo(() => buildPitchMap(pattern), [pattern]);
  const pendingPitchMap = useMemo(
    () => (pendingPattern ? buildPitchMap(pendingPattern) : null),
    [pendingPattern],
  );

  const notes = useMemo(
    () =>
      buildNotes(
        {
          pattern,
          pitchMap,
          pendingPattern,
          pendingPitchMap,
          pendingAtStep,
          space: layout.space,
          spacing: layout.spacing,
        },
        base,
        layout.count,
      ),
    [
      pattern,
      pitchMap,
      pendingPattern,
      pendingPitchMap,
      pendingAtStep,
      base,
      layout.count,
      layout.space,
      layout.spacing,
    ],
  );

  const barLines = notes.filter((note) => note.barLine);
  const staffHeight = layout.space * 4;

  // Load the music font once, then reveal the glyphs. Until it is ready the
  // score is hidden instead of flashing fallback characters.
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

  const applyTransforms = useCallback((position: number) => {
    const spacing = spacingRef.current;
    const stage = stageRef.current;
    if (!stage) return;
    const { lineX, metaRight } = layoutRef.current;
    const width = stage.clientWidth;
    // Notes fade in just before the beat line and out at the far right. Doing
    // this in JS instead of a CSS mask keeps the opacity off composited child
    // layers, where Chromium applies the mask inconsistently.
    const fadeStart = metaRight + 6;
    const fadeEnd = Math.max(fadeStart + 8, lineX - 18);
    const rightStart = width * 0.96;
    const opacityFor = (x: number): number => {
      let alpha =
        x <= fadeStart ? 0 : x >= fadeEnd ? 1 : (x - fadeStart) / (fadeEnd - fadeStart);
      if (x > rightStart) {
        alpha = Math.min(alpha, Math.max(0, 1 - (x - rightStart) / (width - rightStart)));
      }
      return alpha;
    };

    stage.style.setProperty('--beam-width', `${spacing}px`);
    for (const [step, element] of noteElements.current) {
      const offset = (step - position) * spacing;
      const x = lineX + (noteShifts.current.get(step) ?? 0) + offset;
      element.style.transform = `translate3d(${offset}px, 0, 0)`;
      element.style.opacity = `${opacityFor(x)}`;
    }
    for (const [step, element] of barElements.current) {
      const offset = (step - position) * spacing;
      element.style.transform = `translate3d(${offset}px, 0, 0)`;
      element.style.opacity = `${opacityFor(lineX + offset)}`;
    }
  }, []);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const width = stage.clientWidth;
      if (!width) return;

      const space = staffSpaceFor(width);
      const showClef = width >= SHOW_CLEF_MIN_WIDTH;
      const meta = metaMetricsFor(
        width,
        space,
        pattern.beatsPerBar,
        pattern.beatUnit,
        showClef,
      );

      const minSpacing = MIN_SPACING_FACTOR * space;
      const spacing = Math.min(
        MAX_SPACING_FACTOR * space,
        Math.max(minSpacing, (width / 22) * noteSpeed),
      );
      // Keep the beat line clear of the clef and time signature.
      const lineX = Math.max(Math.round(width * 0.27), Math.round(meta.metaRight + 34));

      setLayout({
        spacing,
        lineX,
        count: Math.ceil(width / minSpacing) + WINDOW_MARGIN,
        space,
        ...meta,
        showClef,
      });
      // Only the area right of the beat line is ahead of the user.
      onVisibleSteps(Math.ceil((width - lineX) / spacing) + 1);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [noteSpeed, onVisibleSteps, pattern.beatsPerBar, pattern.beatUnit]);

  // Ease the rendering spacing towards the target so speed changes glide.
  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const target = layout.spacing;
    const step = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      const k = 1 - Math.exp(-dt / 90);
      spacingRef.current += (target - spacingRef.current) * k;
      if (Math.abs(target - spacingRef.current) < 0.2) spacingRef.current = target;
      applyTransforms(positionRef.current);
      if (spacingRef.current !== target) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [layout.spacing, applyTransforms]);

  useLayoutEffect(() => {
    applyTransforms(positionRef.current);
  }, [applyTransforms, layout, base, notes]);

  // After a transition the engine keeps absolute step numbers, so the window
  // needs no reset; only a stop/restart rewinds it.
  useEffect(() => {
    if (positionRef.current < baseRef.current) {
      baseRef.current = 0;
      setBase(0);
    }
  }, [pattern]);

  const spawnBurst = useCallback((y: number) => {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }
    const stage = stageRef.current;
    if (!stage) return;
    const burst = document.createElement('div');
    burst.className = 'staff-burst';
    burst.style.left = `${layoutRef.current.lineX}px`;
    burst.style.top = `${y}px`;
    for (let i = 0; i < 10; i++) {
      const particle = document.createElement('span');
      particle.className = 'staff-particle';
      const angle = Math.random() * Math.PI * 2;
      const distance = 24 + Math.random() * 40;
      particle.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
      particle.style.setProperty('--dy', `${Math.sin(angle) * distance - 12}px`);
      particle.style.setProperty('--delay', `${Math.random() * 40}ms`);
      burst.appendChild(particle);
    }
    stage.appendChild(burst);
    window.setTimeout(() => burst.remove(), 700);
  }, []);

  const triggerHit = useCallback(
    (step: number) => {
      if (step < 0) {
        lastHit.current = step;
        return;
      }
      const previous = lastHit.current;
      if (previous !== null) noteElements.current.get(previous)?.classList.remove('is-hit');

      const note = noteElements.current.get(step);
      // Only ordinary noteheads light up. Accented beats and rests stay still.
      if (note && !note.classList.contains('is-accent') && !note.classList.contains('is-skip')) {
        note.classList.remove('is-hit');
        void note.offsetWidth;
        note.classList.add('is-hit');
        spawnBurst(note.offsetTop);
      }
      lastHit.current = step;
    },
    [spawnBurst],
  );

  useEffect(() => {
    if (!playing) {
      positionRef.current = 0;
      baseRef.current = 0;
      setBase(0);
      applyTransforms(0);
      lastHit.current = null;
      for (const element of noteElements.current.values()) element.classList.remove('is-hit');
      return;
    }

    let frame = 0;
    const tick = () => {
      const position = getPosition();
      if (position !== null) {
        positionRef.current = position;
        applyTransforms(position);

        const currentBase = baseRef.current;
        if (
          position >= 0 &&
          (position < currentBase || position - currentBase >= SHIFT_AFTER_STEPS)
        ) {
          const nextBase = Math.max(0, Math.floor(position) - 2);
          baseRef.current = nextBase;
          setBase(nextBase);
        }

        const step = Math.floor(position);
        if (step !== lastHit.current) triggerHit(step);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, getPosition, applyTransforms, triggerHit]);

  const placeOnTrack = (element: HTMLElement, step: number) => {
    const spacing = spacingRef.current;
    element.style.transform = `translate3d(${(step - positionRef.current) * spacing}px, 0, 0)`;
  };

  const registerNote = (step: number, shift: number) => (element: HTMLElement | null) => {
    if (!element) {
      noteElements.current.delete(step);
      noteShifts.current.delete(step);
      return;
    }
    noteElements.current.set(step, element);
    noteShifts.current.set(step, shift);
    placeOnTrack(element, step);
  };

  const registerBar = (step: number) => (element: HTMLElement | null) => {
    if (!element) {
      barElements.current.delete(step);
      return;
    }
    barElements.current.set(step, element);
    placeOnTrack(element, step);
  };

  const liveBeat = playing && playhead ? playhead.beat + 1 : 1;
  const hint = playing ? `第 ${(playhead?.bar ?? 0) + 1} 小节` : '点击开始';

  const clefTop = layout.space - layout.clefEm / 2;
  const numeratorTop = -layout.space - layout.sigEm / 2;
  const denominatorTop = layout.space - layout.sigEm / 2;
  const numeratorDigits = String(pattern.beatsPerBar).split('').map(Number);
  const denominatorDigits = String(pattern.beatUnit).split('').map(Number);

  return (
    <section
      className={`staff-stage${playing ? ' is-live' : ''}${fontReady ? ' is-font-ready' : ''}`}
      ref={stageRef}
      aria-hidden="true"
    >
      <div className="staff-paper">
        {[0, 1, 2, 3, 4].map((line) => (
          <span
            key={line}
            className="staff-line"
            style={{ top: `calc(50% + ${(line - 2) * layout.space}px)` }}
          />
        ))}
        <span
          className="staff-system-line"
          style={{ top: `calc(50% - ${staffHeight / 2}px)`, height: staffHeight }}
        />

        <div className="staff-meta" style={{ left: layout.metaLeft }}>
          {layout.showClef && (
            <span className="staff-clef" style={{ fontSize: layout.clefEm, top: clefTop }}>
              {MUSIC_GLYPHS.gClef}
            </span>
          )}
          <span className="staff-timesig" style={{ left: layout.sigCenter }}>
            <span
              className="staff-timesig-row"
              style={{ top: numeratorTop, fontSize: layout.sigEm }}
            >
              {numeratorDigits.map((digit, i) => (
                <span key={i}>{timeSigGlyph(digit)}</span>
              ))}
            </span>
            <span
              className="staff-timesig-row"
              style={{ top: denominatorTop, fontSize: layout.sigEm }}
            >
              {denominatorDigits.map((digit, i) => (
                <span key={i}>{timeSigGlyph(digit)}</span>
              ))}
            </span>
          </span>
        </div>
      </div>

      <div className="staff-track" data-pending-step={pendingAtStep ?? ''}>
        {barLines.map((note) => (
          <span
            key={`bar-${note.step}`}
            ref={registerBar(note.step)}
            className="staff-barline"
            style={{
              left: layout.lineX,
              top: `calc(50% - ${staffHeight / 2}px)`,
              height: staffHeight,
            }}
          />
        ))}

        {notes.map((note) => (
          <span
            key={note.step}
            data-step={note.step}
            ref={registerNote(note.step, note.shift)}
            className={`staff-note${note.accent ? ' is-accent' : ''}${
              note.rest ? ' is-skip' : ''
            }`}
            style={{ left: layout.lineX + note.shift, top: `calc(50% + ${note.y}px)` }}
          >
            {note.rest ? (
              <span className="staff-rest" style={{ fontSize: geo.restEm, top: note.restTop }}>
                {note.rest}
              </span>
            ) : (
              <>
                <span className="staff-note-head" style={{ fontSize: geo.headEm }}>
                  {note.hollow ? MUSIC_GLYPHS.noteheadHalf : MUSIC_GLYPHS.noteheadBlack}
                </span>
                <span
                  className="staff-stem"
                  style={{
                    left: note.stemX,
                    top: note.stemTop,
                    height: note.stemHeight,
                    width: geo.stemWidth,
                  }}
                />
                {note.beamDraw &&
                  note.beamTops.map((top, level) => (
                    <span
                      key={level}
                      className="staff-beam"
                      style={
                        {
                          left: note.stemX,
                          top,
                          height: geo.beamThickness,
                          '--beam-skew': `${Math.atan2(note.beamSlope, layout.spacing)}rad`,
                        } as CSSProperties
                      }
                    />
                  ))}
                {note.flag && (
                  <span
                    className="staff-flag"
                    style={{ fontSize: geo.flagEm, left: note.stemX, top: note.flagTop }}
                  >
                    {note.flag}
                  </span>
                )}
                {note.accent && (
                  <span
                    className="staff-accent"
                    style={{
                      fontSize: geo.accentEm,
                      top: note.accentTop,
                      left: note.accentLeft,
                    }}
                  >
                    {MUSIC_GLYPHS.accentAbove}
                  </span>
                )}
                {note.tuplet && (
                  <span className="staff-tuplet" style={{ fontSize: geo.tupletEm, top: note.tupletTop }}>
                    {MUSIC_GLYPHS.tuplet3}
                  </span>
                )}
              </>
            )}
          </span>
        ))}
      </div>

      <div className="beat-line" style={{ left: layout.lineX }} />

      <div className="staff-hud" style={{ left: layout.lineX }}>
        <span className="staff-beat" key={playhead?.step ?? 'idle'}>
          {liveBeat}
        </span>
        <span className="staff-bar">{hint}</span>
      </div>
    </section>
  );
}
