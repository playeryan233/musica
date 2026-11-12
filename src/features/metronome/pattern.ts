import type {
  BeatState,
  BeatUnit,
  ClickKind,
  MetronomePattern,
  MetronomeSettings,
  Subdivision,
} from './types';
import { DEFAULT_TIMBRE, isTimbreId } from '../audio/timbres';
import {
  BARS_MAX,
  BARS_MIN,
  BEATS_PER_BAR_MAX,
  BEATS_PER_BAR_MIN,
  BPM_MAX,
  BPM_MIN,
  isBeatState,
  isBeatUnit,
  isNoteSpeed,
  isSubdivision,
} from './types';

export const DEFAULT_BPM = 80;
export const DEFAULT_VOLUME = 0.5;

/** Default pattern: 4/4, one bar, accent only on the first beat. */
export function createPattern(
  beatsPerBar = 4,
  beatUnit: BeatUnit = 4,
  bars = 1,
  subdivision: Subdivision = 1,
): MetronomePattern {
  return {
    beatsPerBar,
    beatUnit,
    bars,
    subdivision,
    beats: buildDefaultBeats(beatsPerBar, bars),
  };
}

export function createDefaultSettings(): MetronomeSettings {
  return {
    bpm: DEFAULT_BPM,
    volume: DEFAULT_VOLUME,
    timbre: DEFAULT_TIMBRE,
    noteSpeed: 'normal',
    pattern: createPattern(),
  };
}

/** Every bar's first beat is accented, the rest are plain beats. */
function buildDefaultBeats(beatsPerBar: number, bars: number): BeatState[] {
  const beats: BeatState[] = [];
  for (let bar = 0; bar < bars; bar++) {
    for (let beat = 0; beat < beatsPerBar; beat++) {
      beats.push(beat === 0 ? 'accent' : 'normal');
    }
  }
  return beats;
}

export function clampBpm(bpm: unknown): number {
  const n = typeof bpm === 'number' ? bpm : Number(bpm);
  if (!Number.isFinite(n)) return DEFAULT_BPM;
  return Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(n)));
}

export function clampVolume(volume: unknown): number {
  const n = typeof volume === 'number' ? volume : Number(volume);
  if (!Number.isFinite(n)) return DEFAULT_VOLUME;
  return Math.min(1, Math.max(0, n));
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function stepCount(pattern: MetronomePattern): number {
  return pattern.beatsPerBar * pattern.bars * pattern.subdivision;
}

/**
 * Seconds per subdivision step. BPM counts the beat unit (the denominator), so
 * a beat always lasts 60 / bpm seconds and each subdivision divides it.
 */
export function stepSeconds(bpm: number, pattern: MetronomePattern): number {
  return 60 / bpm / pattern.subdivision;
}

export function loopDurationSeconds(bpm: number, pattern: MetronomePattern): number {
  return stepCount(pattern) * stepSeconds(bpm, pattern);
}

/**
 * What should sound on this step of the loop. Skipped beats also mute their
 * subdivisions; off-beat subdivision steps always play the quiet "sub" click.
 */
export function clickKindAtStep(
  pattern: MetronomePattern,
  loopStep: number,
): ClickKind | null {
  const beatIndex = Math.floor(loopStep / pattern.subdivision);
  const beat = pattern.beats[beatIndex] ?? 'normal';
  if (beat === 'skip') return null;
  const isBeatStart = loopStep % pattern.subdivision === 0;
  return isBeatStart ? beat : 'sub';
}

export function cycleBeatState(state: BeatState): BeatState {
  if (state === 'normal') return 'accent';
  if (state === 'accent') return 'skip';
  return 'normal';
}

export function setBeat(
  pattern: MetronomePattern,
  beatIndex: number,
  state: BeatState,
): MetronomePattern {
  if (beatIndex < 0 || beatIndex >= pattern.beats.length) return pattern;
  if (pattern.beats[beatIndex] === state) return pattern;
  const beats = pattern.beats.slice();
  beats[beatIndex] = state;
  return { ...pattern, beats };
}

/** Set every beat of one bar (used by the 重音 / 静音 bar actions). */
export function setBarBeats(
  pattern: MetronomePattern,
  barIndex: number,
  state: BeatState,
): MetronomePattern {
  if (barIndex < 0 || barIndex >= pattern.bars) return pattern;
  const start = barIndex * pattern.beatsPerBar;
  const beats = pattern.beats.slice();
  let changed = false;
  for (let i = start; i < start + pattern.beatsPerBar; i++) {
    if (beats[i] !== state) {
      beats[i] = state;
      changed = true;
    }
  }
  return changed ? { ...pattern, beats } : pattern;
}

/** Back to one accented downbeat and plain beats for the rest of the bar. */
export function resetBar(pattern: MetronomePattern, barIndex: number): MetronomePattern {
  if (barIndex < 0 || barIndex >= pattern.bars) return pattern;
  const start = barIndex * pattern.beatsPerBar;
  const beats = pattern.beats.slice();
  for (let i = start; i < start + pattern.beatsPerBar; i++) {
    beats[i] = i === start ? 'accent' : 'normal';
  }
  return { ...pattern, beats };
}

/**
 * Change the pattern length while keeping as many edited beats as possible.
 * Beats that do not exist in the old pattern fall back to the default: the
 * first beat of each bar is accented.
 */
export function resizePattern(
  pattern: MetronomePattern,
  next: Partial<Pick<MetronomePattern, 'beatsPerBar' | 'beatUnit' | 'bars' | 'subdivision'>>,
): MetronomePattern {
  const beatsPerBar = clampInt(next.beatsPerBar ?? pattern.beatsPerBar, BEATS_PER_BAR_MIN, BEATS_PER_BAR_MAX, 4);
  const bars = clampInt(next.bars ?? pattern.bars, BARS_MIN, BARS_MAX, 1);
  const beatUnit = isBeatUnit(next.beatUnit) ? next.beatUnit : pattern.beatUnit;
  const subdivision = isSubdivision(next.subdivision) ? next.subdivision : pattern.subdivision;

  const beats: BeatState[] = [];
  for (let bar = 0; bar < bars; bar++) {
    for (let beat = 0; beat < beatsPerBar; beat++) {
      const oldIndex = bar * pattern.beatsPerBar + beat;
      const exists = bar < pattern.bars && beat < pattern.beatsPerBar;
      const old = exists ? pattern.beats[oldIndex] : undefined;
      beats.push(old ?? (beat === 0 ? 'accent' : 'normal'));
    }
  }

  return { beatsPerBar, beatUnit, bars, subdivision, beats };
}

/** Validate whatever came out of localStorage; never trust stored data. */
export function sanitizeSettings(raw: unknown): MetronomeSettings {
  if (typeof raw !== 'object' || raw === null) return createDefaultSettings();
  const r = raw as Record<string, unknown>;
  const rawPattern = (typeof r.pattern === 'object' && r.pattern !== null ? r.pattern : {}) as Record<
    string,
    unknown
  >;

  const beatsPerBar = clampInt(rawPattern.beatsPerBar, BEATS_PER_BAR_MIN, BEATS_PER_BAR_MAX, 4);
  const bars = clampInt(rawPattern.bars, BARS_MIN, BARS_MAX, 1);
  const beatUnit = isBeatUnit(rawPattern.beatUnit) ? rawPattern.beatUnit : 4;
  const subdivision = isSubdivision(rawPattern.subdivision) ? rawPattern.subdivision : 1;

  const expected = beatsPerBar * bars;
  const rawBeats = rawPattern.beats;
  const beats =
    Array.isArray(rawBeats) && rawBeats.length === expected && rawBeats.every(isBeatState)
      ? rawBeats.slice()
      : buildDefaultBeats(beatsPerBar, bars);

  return {
    bpm: clampBpm(r.bpm),
    volume: clampVolume(r.volume),
    timbre: isTimbreId(r.timbre) ? r.timbre : DEFAULT_TIMBRE,
    noteSpeed: isNoteSpeed(r.noteSpeed) ? r.noteSpeed : 'normal',
    pattern: { beatsPerBar, beatUnit, bars, subdivision, beats },
  };
}
