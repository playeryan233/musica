import { describe, expect, it } from 'vitest';
import { buildPitchMap, PITCH_MAX, PITCH_MIN } from '../../src/features/metronome/pitch';
import { createPattern, stepCount } from '../../src/features/metronome/pattern';
import type { MetronomePattern } from '../../src/features/metronome/types';

const PATTERNS: MetronomePattern[] = [
  createPattern(4, 4, 1, 1),
  createPattern(4, 4, 1, 2),
  createPattern(4, 4, 1, 3),
  createPattern(4, 4, 2, 4),
  createPattern(3, 4, 1, 2),
  createPattern(6, 8, 2, 3),
  createPattern(5, 4, 1, 1),
];

describe('buildPitchMap', () => {
  it('produces one pitch per step inside the staff range', () => {
    for (const pattern of PATTERNS) {
      const pitches = buildPitchMap(pattern);
      expect(pitches).toHaveLength(stepCount(pattern));
      for (const pitch of pitches) {
        expect(pitch).toBeGreaterThanOrEqual(PITCH_MIN);
        expect(pitch).toBeLessThanOrEqual(PITCH_MAX);
      }
    }
  });

  it('moves at most one whole tone between notes of the same beat', () => {
    for (const pattern of PATTERNS) {
      const pitches = buildPitchMap(pattern);
      for (let i = 1; i < pitches.length; i++) {
        if (i % pattern.subdivision !== 0) {
          expect(Math.abs(pitches[i] - pitches[i - 1])).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('moves at most three whole tones between adjacent beats, including the loop wrap', () => {
    for (const pattern of PATTERNS) {
      const pitches = buildPitchMap(pattern);
      for (let i = 1; i < pitches.length; i++) {
        if (i % pattern.subdivision === 0) {
          expect(Math.abs(pitches[i] - pitches[i - 1])).toBeLessThanOrEqual(3);
        }
      }
      if (pitches.length > 1) {
        expect(Math.abs(pitches[0] - pitches[pitches.length - 1])).toBeLessThanOrEqual(3);
      }
    }
  });

  it('is deterministic and ignores accent edits', () => {
    const pattern = createPattern(4, 4, 1, 2);
    const first = buildPitchMap(pattern);
    expect(buildPitchMap(pattern)).toEqual(first);
    const accented = {
      ...pattern,
      beats: pattern.beats.map((state) => (state === 'normal' ? 'accent' : state)),
    } as MetronomePattern;
    expect(buildPitchMap(accented)).toEqual(first);
  });
});
