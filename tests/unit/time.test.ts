import { describe, expect, it } from 'vitest';
import { audioTimeFromAnchor, quarterFromAnchor, secondsPerQuarter } from '../../src/features/practice/time';
import type { TransportAnchor } from '../../src/features/practice/types';

describe('time conversion', () => {
  it('computes seconds per quarter', () => {
    expect(secondsPerQuarter(60)).toBe(1);
    expect(secondsPerQuarter(120)).toBe(0.5);
  });

  it('converts between quarters and audio time in both directions', () => {
    const anchor: TransportAnchor = { audioTime: 10, quarter: 2, bpm: 60 };
    expect(quarterFromAnchor(anchor, 11)).toBe(3);
    expect(audioTimeFromAnchor(anchor, 3)).toBe(11);
  });

  it('round-trips for a 120 BPM 3/4 bar (1.5 s)', () => {
    const anchor: TransportAnchor = { audioTime: 0, quarter: 0, bpm: 120 };
    const end = audioTimeFromAnchor(anchor, 3);
    expect(end).toBe(1.5);
    expect(quarterFromAnchor(anchor, end)).toBe(3);
  });

  it('applies a tempo change without jumping position', () => {
    const before: TransportAnchor = { audioTime: 5, quarter: 4, bpm: 60 };
    // At audio time 6 the position under the old tempo is quarter 5.
    const q = quarterFromAnchor(before, 6);
    expect(q).toBe(5);
    const after: TransportAnchor = { audioTime: 6, quarter: q, bpm: 120 };
    // A quarter after the change at the new tempo is 0.5 s later.
    expect(quarterFromAnchor(after, 6.5)).toBe(6);
  });
});
