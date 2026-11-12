import type { TransportAnchor } from './types';

/** Seconds per quarter note at the given BPM. */
export function secondsPerQuarter(bpm: number): number {
  return 60 / bpm;
}

/** Musical position (quarters) at the given audio time, given an anchor. */
export function quarterFromAnchor(anchor: TransportAnchor, audioTime: number): number {
  return anchor.quarter + (audioTime - anchor.audioTime) * (anchor.bpm / 60);
}

/** Audio time at the given musical position (quarters), given an anchor. */
export function audioTimeFromAnchor(anchor: TransportAnchor, quarter: number): number {
  return anchor.audioTime + (quarter - anchor.quarter) * (60 / anchor.bpm);
}
