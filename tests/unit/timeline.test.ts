import { describe, expect, it } from 'vitest';
import { buildTimeline, findBarIndex, findNextClickIndex } from '../../src/features/practice/TimelineBuilder';
import type { TimelineSource } from '../../src/features/score/types';

function source(
  bars: Array<{ num: number; den: number; dur?: number; anacrusis?: boolean }>,
): TimelineSource {
  let cursor = 0;
  const out: TimelineSource = { bars: [], durationQuarter: 0 };
  for (const b of bars) {
    const full = (b.num * 4) / b.den;
    const durationQuarter = b.dur ?? full;
    out.bars.push({
      sourceBarIndex: out.bars.length,
      startQuarter: cursor,
      durationQuarter,
      numerator: b.num,
      denominator: b.den,
      isAnacrusis: b.anacrusis ?? false,
    });
    cursor += durationQuarter;
  }
  out.durationQuarter = cursor;
  return out;
}

describe('buildTimeline', () => {
  it('builds 4/4 bars with one accent and four quarter clicks', () => {
    const t = buildTimeline(source([{ num: 4, den: 4 }, { num: 4, den: 4 }]));
    expect(t.bars).toHaveLength(2);
    expect(t.bars[0].clicks).toHaveLength(4);
    expect(t.bars[0].clicks.map((c) => c.quarter)).toEqual([0, 1, 2, 3]);
    expect(t.bars[0].clicks[0].accent).toBe(true);
    expect(t.bars[0].clicks.slice(1).every((c) => !c.accent)).toBe(true);
    expect(t.bars[1].clicks.map((c) => c.quarter)).toEqual([4, 5, 6, 7]);
    expect(t.durationQuarter).toBe(8);
  });

  it('builds 3/4 bars with three clicks', () => {
    const t = buildTimeline(source([{ num: 3, den: 4 }]));
    expect(t.bars[0].clicks.map((c) => c.quarter)).toEqual([0, 1, 2]);
    expect(t.durationQuarter).toBe(3);
  });

  it('builds 6/8 bars on the eighth-note grid (quarter units)', () => {
    const t = buildTimeline(source([{ num: 6, den: 8 }]));
    expect(t.bars[0].clicks.map((c) => c.quarter)).toEqual([0, 0.5, 1, 1.5, 2, 2.5]);
    expect(t.durationQuarter).toBe(3);
  });

  it('places a pickup bar at its actual position without a strong beat', () => {
    // 4/4 with only one pickup beat (actual duration 1 quarter).
    const t = buildTimeline(source([{ num: 4, den: 4, dur: 1, anacrusis: true }]));
    expect(t.bars[0].clicks).toHaveLength(1);
    expect(t.bars[0].clicks[0].quarter).toBe(0);
    expect(t.bars[0].clicks[0].accent).toBe(false);
    expect(t.durationQuarter).toBe(1);
  });

  it('flattens clicks in sorted order across bars', () => {
    const t = buildTimeline(source([{ num: 4, den: 4 }, { num: 3, den: 4 }]));
    expect(t.clicks.map((c) => c.quarter)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

describe('findBarIndex', () => {
  const t = buildTimeline(source([{ num: 4, den: 4 }, { num: 4, den: 4 }]));

  it('uses left-closed, right-open bar boundaries', () => {
    expect(findBarIndex(t.bars, 0)).toBe(0);
    expect(findBarIndex(t.bars, 3.999)).toBe(0);
    expect(findBarIndex(t.bars, 4)).toBe(1);
    expect(findBarIndex(t.bars, 7.999)).toBe(1);
  });
});

describe('findNextClickIndex', () => {
  const t = buildTimeline(source([{ num: 4, den: 4 }, { num: 4, den: 4 }]));

  it('finds the first click at or after a position', () => {
    expect(findNextClickIndex(t.clicks, 0)).toBe(0);
    expect(findNextClickIndex(t.clicks, 1)).toBe(1);
    expect(findNextClickIndex(t.clicks, 2.5)).toBe(3);
    expect(findNextClickIndex(t.clicks, 8)).toBe(t.clicks.length);
  });
});
