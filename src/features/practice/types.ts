import type { ScoreView } from '../songs/types';

export type ScoreStatus = 'idle' | 'loading' | 'ready' | 'error';
export type TransportStatus = 'stopped' | 'playing' | 'paused' | 'finished';

export interface PracticeClick {
  id: string;
  /** Absolute musical position across the whole song, in quarter-note units. */
  quarter: number;
  accent: boolean;
}

export interface PracticeBar {
  id: string;
  sourceBarIndex: number;
  startQuarter: number;
  durationQuarter: number;
  numerator: number;
  denominator: number;
  clicks: PracticeClick[];
}

export interface PracticeTimeline {
  bars: PracticeBar[];
  /** Flattened, sorted list of all metronome clicks. */
  clicks: PracticeClick[];
  durationQuarter: number;
}

export interface TransportAnchor {
  audioTime: number;
  quarter: number;
  bpm: number;
}

export interface PracticeSettings {
  bpm: number;
  metronomeEnabled: boolean;
  metronomeVolume: number; // 0..1
  autoFollow: boolean;
  view: ScoreView;
  zoom: number;
}

export const BPM_MIN = 30;
export const BPM_MAX = 240;
