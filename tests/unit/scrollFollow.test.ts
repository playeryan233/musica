import { describe, expect, it } from 'vitest';
import { followTarget } from '../../src/features/practice/ScrollController';

const insets = { top: 24, bottom: 24 };

/** A viewport showing content 0..600, scrolled to `scrollTop`. */
function viewport(scrollTop: number, clientHeight = 600, scrollHeight = 2000) {
  return { scrollTop, clientHeight, scrollHeight };
}

function rect(y: number, height = 80) {
  return { x: 0, y, width: 400, height };
}

describe('followTarget', () => {
  it('does nothing when the bar is already readable', () => {
    expect(followTarget(rect(100), viewport(0), insets)).toBeNull();
    expect(followTarget(rect(400), viewport(300), insets)).toBeNull();
  });

  it('scrolls a bar below the window up to the top inset', () => {
    // 1000 - 24 top inset - 16 margin keeps the line and the next ones in view.
    expect(followTarget(rect(1000), viewport(0), insets)).toBe(960);
  });

  it('scrolls a bar above the window back down to the top inset', () => {
    expect(followTarget(rect(1000), viewport(1500), insets)).toBe(960);
  });

  it('never scrolls past the end of the content', () => {
    const nearEnd = viewport(1200, 600, 2000); // max scroll 1400
    expect(followTarget(rect(1900), nearEnd, insets)).toBe(1400);
  });

  it('never scrolls to a negative position', () => {
    expect(followTarget(rect(0), viewport(200), insets)).toBe(0);
  });

  it('keeps the bar exactly at the readable boundary without moving', () => {
    // top inset 24: rect at 24 is exactly on the top boundary, fully readable.
    expect(followTarget(rect(24, 80), viewport(0), insets)).toBeNull();
    // rect bottom + inset at 600 is exactly on the bottom boundary.
    expect(followTarget(rect(496, 80), viewport(0), insets)).toBeNull();
  });
});
