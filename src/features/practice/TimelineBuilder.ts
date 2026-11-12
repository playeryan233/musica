import type { TimelineSource } from '../score/types';
import type { PracticeBar, PracticeClick, PracticeTimeline } from './types';

const EPS = 1e-6;

/**
 * Builds the practice timeline (bars + metronome clicks, in quarter units) from
 * the engine-exported bar model. This is pure and does not touch the DOM.
 */
export function buildTimeline(source: TimelineSource): PracticeTimeline {
  const bars: PracticeBar[] = [];
  const clicks: PracticeClick[] = [];

  for (const src of source.bars) {
    const beatQuarter = 4 / src.denominator;
    const barClicks: PracticeClick[] = [];

    // Generate beats on the bar's grid, covering only the notes actually present.
    // For a normal bar this yields `numerator` beats; for a pickup (anacrusis) bar
    // it yields only the actual beats, and none of them is marked as the downbeat.
    for (let k = 0; ; k++) {
      const q = src.startQuarter + k * beatQuarter;
      if (q >= src.startQuarter + src.durationQuarter - EPS) break;
      const click: PracticeClick = {
        id: `${src.sourceBarIndex}:${k}`,
        quarter: q,
        accent: k === 0 && !src.isAnacrusis,
      };
      barClicks.push(click);
      clicks.push(click);
    }

    bars.push({
      id: `bar-${src.sourceBarIndex}`,
      sourceBarIndex: src.sourceBarIndex,
      startQuarter: src.startQuarter,
      durationQuarter: src.durationQuarter,
      numerator: src.numerator,
      denominator: src.denominator,
      clicks: barClicks,
    });
  }

  clicks.sort((a, b) => a.quarter - b.quarter);
  return { bars, clicks, durationQuarter: source.durationQuarter };
}

/** Find the index of the bar containing the given quarter position (left-closed, right-open). */
export function findBarIndex(bars: PracticeBar[], quarter: number): number {
  let lo = 0;
  let hi = bars.length - 1;
  let result = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const bar = bars[mid];
    if (bar.startQuarter <= quarter) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}

/** Find the index of the first click at or after the given quarter. */
export function findNextClickIndex(clicks: PracticeClick[], quarter: number): number {
  let lo = 0;
  let hi = clicks.length - 1;
  let result = clicks.length;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (clicks[mid].quarter + EPS >= quarter) {
      result = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return result;
}
