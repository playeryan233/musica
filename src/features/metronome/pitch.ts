import { stepCount } from './pattern';
import type { MetronomePattern } from './types';

/** Staff steps relative to the middle line. 0 = middle line, 1 = space above. */
export const PITCH_MIN = -4;
export const PITCH_MAX = 4;

/** A whole tone is one staff step; these are the user-facing limits. */
export const MAX_STEP_IN_BEAT = 1;
export const MAX_STEP_BETWEEN_BEATS = 3;

function hashPattern(pattern: MetronomePattern): number {
  // Accents must not re-roll the melody, only structure does.
  let h = 2166136261;
  const values = [
    pattern.beatsPerBar,
    pattern.beatUnit,
    pattern.bars,
    pattern.subdivision,
  ];
  for (const value of values) {
    h ^= value;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Small deterministic PRNG so the same pattern always gets the same melody. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}


/**
 * Deterministic pitch for every step of one loop, in staff steps.
 *
 * Rules (from the practice spec):
 * - adjacent notes inside one beat move by at most one whole tone;
 * - the last note of a beat and the first note of the next beat differ by at
 *   most three whole tones (the loop wrap counts as a beat boundary);
 * - pitches stay on/inside the five staff lines.
 */
/** One random walk. May violate the loop wrap, so the caller validates it. */
function generatePitches(pattern: MetronomePattern, seed: number): number[] {
  const length = Math.max(1, stepCount(pattern));
  const subdivision = Math.max(1, pattern.subdivision);
  const random = mulberry32(seed);
  const pitches: number[] = [Math.floor(random() * (PITCH_MAX - PITCH_MIN + 1)) + PITCH_MIN];

  for (let i = 1; i < length; i++) {
    const maxStep = i % subdivision === 0 ? MAX_STEP_BETWEEN_BEATS : MAX_STEP_IN_BEAT;
    const options: number[] = [];
    for (let delta = -maxStep; delta <= maxStep; delta++) {
      if (delta === 0) continue;
      const next = pitches[i - 1] + delta;
      if (next >= PITCH_MIN && next <= PITCH_MAX) options.push(delta);
    }
    // Mostly move, occasionally repeat, so the line looks like a melody.
    const delta =
      options.length > 0 && random() > 0.12
        ? options[Math.floor(random() * options.length)]
        : 0;
    pitches.push(pitches[i - 1] + delta);
  }
  return pitches;
}

function isValid(pitches: number[], subdivision: number): boolean {
  const length = pitches.length;
  if (length > 1 && Math.abs(pitches[0] - pitches[length - 1]) > MAX_STEP_BETWEEN_BEATS) {
    return false;
  }
  for (let i = 1; i < length; i++) {
    const maxStep = i % subdivision === 0 ? MAX_STEP_BETWEEN_BEATS : MAX_STEP_IN_BEAT;
    if (Math.abs(pitches[i] - pitches[i - 1]) > maxStep) return false;
  }
  return true;
}

/**
 * Deterministic pitch for every step of one loop, in staff steps.
 *
 * Rules (from the practice spec):
 * - adjacent notes inside one beat move by at most one whole tone;
 * - the last note of a beat and the first note of the next beat differ by at
 *   most three whole tones (the loop wrap counts as a beat boundary);
 * - pitches stay on/inside the five staff lines.
 */
export function buildPitchMap(pattern: MetronomePattern): number[] {
  const subdivision = Math.max(1, pattern.subdivision);
  const seed = hashPattern(pattern);
  for (let attempt = 0; attempt < 100; attempt++) {
    const pitches = generatePitches(pattern, (seed + attempt * 0x9e3779b9) >>> 0);
    if (isValid(pitches, subdivision)) return pitches;
  }
  // Degenerate fallback: a flat line is always legal.
  return new Array(Math.max(1, stepCount(pattern))).fill(0);
}
