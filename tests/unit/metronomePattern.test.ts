import { describe, expect, it } from 'vitest';
import {
  clickKindAtStep,
  createDefaultSettings,
  createPattern,
  cycleBeatState,
  loopDurationSeconds,
  resizePattern,
  sanitizeSettings,
  setBarBeats,
  setBeat,
  stepCount,
  stepSeconds,
} from '../../src/features/metronome/pattern';

describe('metronome pattern defaults', () => {
  it('defaults to 4/4 at 80 BPM with an accent only on beat 1', () => {
    const settings = createDefaultSettings();
    expect(settings.bpm).toBe(80);
    expect(settings.pattern.beatsPerBar).toBe(4);
    expect(settings.pattern.beatUnit).toBe(4);
    expect(settings.pattern.bars).toBe(1);
    expect(settings.pattern.subdivision).toBe(1);
    expect(settings.pattern.beats).toEqual(['accent', 'normal', 'normal', 'normal']);
    expect(settings.volume).toBeGreaterThan(0);
  });

  it('computes the loop duration from BPM and the beat count', () => {
    const settings = createDefaultSettings();
    expect(stepSeconds(settings.bpm, settings.pattern)).toBeCloseTo(0.75);
    expect(stepCount(settings.pattern)).toBe(4);
    expect(loopDurationSeconds(settings.bpm, settings.pattern)).toBeCloseTo(3);
  });
});

describe('beat states', () => {
  it('cycles normal -> accent -> skip -> normal', () => {
    expect(cycleBeatState('normal')).toBe('accent');
    expect(cycleBeatState('accent')).toBe('skip');
    expect(cycleBeatState('skip')).toBe('normal');
  });

  it('mutes a skipped beat together with its subdivisions', () => {
    const pattern = setBeat(createPattern(4, 4, 1, 2), 1, 'skip');
    const kinds = [0, 1, 2, 3, 4, 5, 6, 7].map((step) => clickKindAtStep(pattern, step));
    expect(kinds).toEqual(['accent', 'sub', null, null, 'normal', 'sub', 'normal', 'sub']);
  });

  it('marks only the beat start as accented, not the subdivisions', () => {
    const pattern = createPattern(3, 4, 1, 3);
    const kinds = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((step) => clickKindAtStep(pattern, step));
    expect(kinds).toEqual(['accent', 'sub', 'sub', 'normal', 'sub', 'sub', 'normal', 'sub', 'sub']);
  });

  it('can set a whole bar to accent or silence', () => {
    const twoBars = createPattern(4, 4, 2);
    const skipped = setBarBeats(twoBars, 1, 'skip');
    expect(skipped.beats.slice(4)).toEqual(['skip', 'skip', 'skip', 'skip']);
    expect(skipped.beats.slice(0, 4)).toEqual(['accent', 'normal', 'normal', 'normal']);

    const accented = setBarBeats(twoBars, 0, 'accent');
    expect(accented.beats.slice(0, 4)).toEqual(['accent', 'accent', 'accent', 'accent']);
  });
});

describe('resizePattern', () => {
  it('adds new bars with an accented downbeat', () => {
    const pattern = resizePattern(createPattern(4, 4, 1), { bars: 2 });
    expect(pattern.beats).toEqual([
      'accent',
      'normal',
      'normal',
      'normal',
      'accent',
      'normal',
      'normal',
      'normal',
    ]);
  });

  it('keeps edits that still fit after shrinking the bar length', () => {
    const edited = setBeat(createPattern(4, 4, 1), 2, 'accent');
    const pattern = resizePattern(edited, { beatsPerBar: 3 });
    expect(pattern.beats).toEqual(['accent', 'normal', 'accent']);
  });

  it('clamps bar count and beat count to the supported ranges', () => {
    const pattern = resizePattern(createPattern(), { beatsPerBar: 99, bars: -3 });
    expect(pattern.beatsPerBar).toBe(12);
    expect(pattern.bars).toBe(1);
    expect(pattern.beats).toHaveLength(12);
  });
});

describe('sanitizeSettings', () => {
  it('falls back to defaults for corrupted storage', () => {
    const settings = sanitizeSettings({
      bpm: 'fast',
      volume: 3,
      pattern: { beatsPerBar: 99, beatUnit: 3, bars: -1, subdivision: 9, beats: [] },
    });
    expect(settings.bpm).toBe(80);
    expect(settings.volume).toBe(1);
    expect(settings.pattern.beatsPerBar).toBe(12);
    expect(settings.pattern.beatUnit).toBe(4);
    expect(settings.pattern.bars).toBe(1);
    expect(settings.pattern.subdivision).toBe(1);
    expect(settings.pattern.beats).toHaveLength(12);
    expect(settings.pattern.beats[0]).toBe('accent');
  });

  it('keeps valid stored beats and clamps the BPM', () => {
    const settings = sanitizeSettings({
      bpm: 900,
      volume: 0.4,
      pattern: {
        beatsPerBar: 3,
        beatUnit: 8,
        bars: 2,
        subdivision: 2,
        beats: ['accent', 'skip', 'normal', 'accent', 'normal', 'normal'],
      },
    });
    expect(settings.bpm).toBe(300);
    expect(settings.pattern.beatUnit).toBe(8);
    expect(settings.pattern.beats).toEqual([
      'accent',
      'skip',
      'normal',
      'accent',
      'normal',
      'normal',
    ]);
  });

  it('rejects a beats array whose length does not match the pattern', () => {
    const settings = sanitizeSettings({
      pattern: { beatsPerBar: 4, bars: 1, beats: ['accent'] },
    });
    expect(settings.pattern.beats).toHaveLength(4);
    expect(settings.pattern.beats).toEqual(['accent', 'normal', 'normal', 'normal']);
  });

  it('handles non-object input', () => {
    expect(sanitizeSettings(null).pattern.beats).toHaveLength(4);
    expect(sanitizeSettings(undefined).bpm).toBe(80);
  });

  it('keeps a valid note speed and falls back for unknown values', () => {
    expect(createDefaultSettings().noteSpeed).toBe('normal');
    expect(sanitizeSettings({ noteSpeed: 'fast' }).noteSpeed).toBe('fast');
    expect(sanitizeSettings({ noteSpeed: 'ludicrous' }).noteSpeed).toBe('normal');
    expect(sanitizeSettings({}).noteSpeed).toBe('normal');
  });
});
