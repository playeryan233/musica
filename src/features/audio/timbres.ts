import type { ClickVoiceSpec } from './click';

/**
 * The audio vocabulary of a click. Kept here (not in the metronome feature) so
 * the practice metronome and the standalone metronome share one definition.
 */
export type ClickKind = 'accent' | 'normal' | 'sub';

/** Selectable timbres for the metronome click. */
export type TimbreId = 'beep' | 'woodblock' | 'shaker' | 'mechanical' | 'cowbell';

export const DEFAULT_TIMBRE: TimbreId = 'beep';

export const TIMBRE_IDS: TimbreId[] = [
  'beep',
  'woodblock',
  'shaker',
  'mechanical',
  'cowbell',
];

export const TIMBRE_LABELS: Record<TimbreId, string> = {
  beep: '电子音',
  woodblock: '木鱼',
  shaker: '沙锤',
  mechanical: '机械',
  cowbell: '牛铃',
};

export function isTimbreId(value: unknown): value is TimbreId {
  return typeof value === 'string' && (TIMBRE_IDS as string[]).includes(value);
}

/**
 * Recipe for each timbre. Every preset names its own accent / normal / sub
 * click so the accent stays clearly louder and brighter than a plain beat, and
 * the subdivision stays soft — regardless of which timbre is selected.
 *
 * Gains are normalized by ear per timbre: a noise burst or a square wave is far
 * louder than a sine at the same peak, so they use a lower `peakGain`.
 */
const TIMBRE_SPECS: Record<TimbreId, Record<ClickKind, ClickVoiceSpec>> = {
  // Clean sine beep: the original sound, strongest pitch contrast.
  beep: {
    accent: { frequency: 1000, peakGain: 1, durationSeconds: 0.045 },
    normal: { frequency: 700, peakGain: 0.8, durationSeconds: 0.04 },
    sub: { frequency: 520, peakGain: 0.3, durationSeconds: 0.03 },
  },

  // Wooden "tok": a fundamental plus an inharmonic partial, very short decay.
  woodblock: {
    accent: {
      waveform: 'triangle',
      frequency: 560,
      partial: { ratio: 2.71, gain: 0.32 },
      peakGain: 0.9,
      durationSeconds: 0.055,
      attackSeconds: 0.002,
    },
    normal: {
      waveform: 'triangle',
      frequency: 440,
      partial: { ratio: 2.71, gain: 0.28 },
      peakGain: 0.7,
      durationSeconds: 0.045,
      attackSeconds: 0.002,
    },
    sub: {
      waveform: 'triangle',
      frequency: 360,
      partial: { ratio: 2.71, gain: 0.22 },
      peakGain: 0.28,
      durationSeconds: 0.03,
      attackSeconds: 0.002,
    },
  },

  // Shaker: a band-passed noise burst with a faint tonal body.
  shaker: {
    accent: {
      frequency: 1800,
      peakGain: 0.75,
      durationSeconds: 0.045,
      noise: { filterHz: 5200, q: 0.9, gain: 1 },
    },
    normal: {
      frequency: 1400,
      peakGain: 0.55,
      durationSeconds: 0.035,
      noise: { filterHz: 4200, q: 1, gain: 1 },
    },
    sub: {
      frequency: 1000,
      peakGain: 0.25,
      durationSeconds: 0.02,
      noise: { filterHz: 3200, q: 1.2, gain: 1 },
    },
  },

  // Mechanical tick: a short tonal click with a noisy attack.
  mechanical: {
    accent: {
      waveform: 'triangle',
      frequency: 1500,
      peakGain: 0.7,
      durationSeconds: 0.02,
      noise: { filterHz: 2600, q: 1.4, gain: 0.9 },
    },
    normal: {
      waveform: 'triangle',
      frequency: 1150,
      peakGain: 0.5,
      durationSeconds: 0.016,
      noise: { filterHz: 2200, q: 1.4, gain: 0.7 },
    },
    sub: {
      waveform: 'triangle',
      frequency: 900,
      peakGain: 0.22,
      durationSeconds: 0.012,
      noise: { filterHz: 1800, q: 1.6, gain: 0.5 },
    },
  },

  // Cowbell: two detuned squares through a low-pass, longer ring.
  cowbell: {
    accent: {
      waveform: 'square',
      frequency: 540,
      partial: { ratio: 1.48, gain: 0.7, waveform: 'square' },
      peakGain: 0.42,
      durationSeconds: 0.085,
      lowpassHz: 3200,
    },
    normal: {
      waveform: 'square',
      frequency: 460,
      partial: { ratio: 1.48, gain: 0.6, waveform: 'square' },
      peakGain: 0.32,
      durationSeconds: 0.07,
      lowpassHz: 2800,
    },
    sub: {
      waveform: 'square',
      frequency: 380,
      partial: { ratio: 1.48, gain: 0.4, waveform: 'square' },
      peakGain: 0.14,
      durationSeconds: 0.045,
      lowpassHz: 2400,
    },
  },
};

/** The voice recipe for one click of the given timbre. */
export function specFor(timbre: TimbreId, kind: ClickKind): ClickVoiceSpec {
  return TIMBRE_SPECS[timbre][kind];
}
