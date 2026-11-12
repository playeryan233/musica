import type { ClickKind, TimbreId } from '../audio/timbres';

/** Everything the audio layer can actually play; `skip` beats produce nothing. */
export type { ClickKind };

export type BeatState = 'accent' | 'normal' | 'skip';

export type BeatUnit = 2 | 4 | 8 | 16;
export type Subdivision = 1 | 2 | 3 | 4;

/** Visual note-travel speed. Never changes the click schedule or the timing. */
export type NoteSpeed = 'slow' | 'normal' | 'fast' | 'fastest';

/** Staff spacing multiplier for each visual speed. */
export const NOTE_SPEED_SCALE: Record<NoteSpeed, number> = {
  slow: 0.7,
  normal: 1,
  fast: 1.35,
  fastest: 1.75,
};

export interface MetronomePattern {
  /** Number of beats per bar (the time-signature numerator). */
  beatsPerBar: number;
  /** Note value that receives one beat (the time-signature denominator). */
  beatUnit: BeatUnit;
  /** How many bars make up one loop of the pattern. */
  bars: number;
  /** Clicks per beat: 1 = plain beat, 2/3/4 = subdivisions. */
  subdivision: Subdivision;
  /** Flattened beat states, length = beatsPerBar * bars. */
  beats: BeatState[];
}

export interface MetronomeSettings {
  /** Beats per minute of the beat unit above. */
  bpm: number;
  /** Master volume, 0..1. */
  volume: number;
  /** Click timbre. */
  timbre: TimbreId;
  /** Visual speed of the notes on the staff; audio timing is unaffected. */
  noteSpeed: NoteSpeed;
  pattern: MetronomePattern;
}

/** Where the playhead sits inside the looping pattern. */
export interface Playhead {
  /** Absolute step index since playback started. */
  step: number;
  /** Step index inside one loop, 0..stepCount-1. */
  loopStep: number;
  /** 0-based bar inside the loop. */
  bar: number;
  /** 0-based beat inside the bar. */
  beat: number;
  /** 0-based subdivision inside the beat. */
  subdivisionIndex: number;
  state: BeatState | 'sub';
}

/** A click already handed to the audio layer. */
export interface ScheduledClick {
  readonly at: number;
  cancel(): void;
  onEnd(listener: () => void): void;
}

/**
 * The audio boundary of the metronome engine. Keeping it behind an interface
 * lets the engine be unit-tested with a fake clock and a fake click sink.
 */
export interface MetronomeAudio {
  now(): number;
  ensureRunning(): Promise<void>;
  /** Try to schedule a click; returns null while audio is unavailable. */
  play(at: number, kind: ClickKind): ScheduledClick | null;
  setVolume(volume: number): void;
  /** Choose the timbre used by clicks scheduled from now on. */
  setTimbre(timbre: TimbreId): void;
}

export const BPM_MIN = 30;
export const BPM_MAX = 300;

export const BEATS_PER_BAR_MIN = 1;
export const BEATS_PER_BAR_MAX = 12;

export const BARS_MIN = 1;
export const BARS_MAX = 8;

export const BEAT_UNITS: BeatUnit[] = [2, 4, 8, 16];
export const SUBDIVISIONS: Subdivision[] = [1, 2, 3, 4];

export const BEAT_UNIT_LABELS: Record<BeatUnit, string> = {
  2: '二分音符',
  4: '四分音符',
  8: '八分音符',
  16: '十六分音符',
};

/** Note glyphs for the "one beat equals …" readout. */
export const BEAT_UNIT_SYMBOLS: Record<BeatUnit, string> = {
  2: '1/2',
  4: '♩',
  8: '♪',
  16: '1/16',
};

export function isBeatState(value: unknown): value is BeatState {
  return value === 'accent' || value === 'normal' || value === 'skip';
}

export function isBeatUnit(value: unknown): value is BeatUnit {
  return value === 2 || value === 4 || value === 8 || value === 16;
}

export function isSubdivision(value: unknown): value is Subdivision {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

export function isNoteSpeed(value: unknown): value is NoteSpeed {
  return value === 'slow' || value === 'normal' || value === 'fast' || value === 'fastest';
}
