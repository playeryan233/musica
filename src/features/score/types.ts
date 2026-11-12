import type { ScoreView } from '../songs/types';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Bar-level data exported from the score engine, independent of engine types. */
export interface TimelineSourceBar {
  sourceBarIndex: number;
  startQuarter: number;
  durationQuarter: number;
  numerator: number;
  denominator: number;
  isAnacrusis: boolean;
}

export interface TimelineSource {
  bars: TimelineSourceBar[];
  durationQuarter: number;
}

export interface ScoreAdapter {
  load(
    song: { scoreUrl: string; defaultTrackIndex: number },
    view: ScoreView,
    zoom: number,
    signal?: AbortSignal,
  ): Promise<void>;
  setView(view: ScoreView): Promise<void>;
  setZoom(scale: number): Promise<void>;
  resizeRender(): void;
  getTimelineSource(): TimelineSource | null;
  getBarRect(barIndex: number): Rect | null;
  onLayoutChanged(listener: () => void): () => void;
  destroy(): void;
}
