import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TIMBRE,
  TIMBRE_IDS,
  TIMBRE_LABELS,
  isTimbreId,
  specFor,
  type ClickKind,
} from '../../src/features/audio/timbres';
import { createDefaultSettings, sanitizeSettings } from '../../src/features/metronome/pattern';

const KINDS: ClickKind[] = ['accent', 'normal', 'sub'];

describe('timbre recipes', () => {
  it('defines a playable voice for every timbre and click kind', () => {
    for (const timbre of TIMBRE_IDS) {
      expect(TIMBRE_LABELS[timbre]).toBeTruthy();
      for (const kind of KINDS) {
        const spec = specFor(timbre, kind);
        expect(spec.frequency).toBeGreaterThan(0);
        expect(spec.peakGain).toBeGreaterThan(0);
        expect(spec.peakGain).toBeLessThanOrEqual(1);
        expect(spec.durationSeconds).toBeGreaterThan(0);
        expect(spec.durationSeconds).toBeLessThan(0.2);
      }
    }
  });

  it('keeps the subdivision click softer than the plain beat', () => {
    for (const timbre of TIMBRE_IDS) {
      expect(specFor(timbre, 'sub').peakGain).toBeLessThan(specFor(timbre, 'normal').peakGain);
    }
  });

  it('makes the accent at least as loud as the plain beat', () => {
    for (const timbre of TIMBRE_IDS) {
      expect(specFor(timbre, 'accent').peakGain).toBeGreaterThanOrEqual(
        specFor(timbre, 'normal').peakGain,
      );
    }
  });

  it('uses narrower, higher-filtered noise for softer clicks', () => {
    for (const timbre of TIMBRE_IDS) {
      const accent = specFor(timbre, 'accent').noise;
      const sub = specFor(timbre, 'sub').noise;
      if (!accent || !sub) continue;
      expect(sub.filterHz).toBeLessThan(accent.filterHz);
    }
  });

  it('accepts only known timbre ids', () => {
    for (const timbre of TIMBRE_IDS) expect(isTimbreId(timbre)).toBe(true);
    expect(isTimbreId('piano')).toBe(false);
    expect(isTimbreId(null)).toBe(false);
    expect(isTimbreId(undefined)).toBe(false);
  });
});

describe('timbre persistence', () => {
  it('defaults to the beep timbre', () => {
    expect(createDefaultSettings().timbre).toBe(DEFAULT_TIMBRE);
  });

  it('keeps a stored valid timbre', () => {
    expect(sanitizeSettings({ timbre: 'shaker' }).timbre).toBe('shaker');
  });

  it('falls back to the default for an unknown or missing timbre', () => {
    expect(sanitizeSettings({ timbre: 'piano' }).timbre).toBe(DEFAULT_TIMBRE);
    expect(sanitizeSettings({}).timbre).toBe(DEFAULT_TIMBRE);
    expect(sanitizeSettings(null).timbre).toBe(DEFAULT_TIMBRE);
  });
});
