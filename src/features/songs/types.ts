export type ScoreView = 'standard' | 'tablature' | 'both';

export type ScoreFormat = 'musicxml' | 'guitar-pro';

export interface SongMetadata {
  id: string;
  title: string;
  artist?: string;
  scoreUrl: string;
  format: ScoreFormat;
  defaultBpm: number;
  defaultTrackIndex: number;
  availableViews: ScoreView[];
  practiceStructure: 'linear';
}

export interface SongManifest {
  schemaVersion: 1;
  songs: SongMetadata[];
}

export const SCORE_VIEWS: ScoreView[] = ['standard', 'tablature', 'both'];

export const VIEW_LABELS: Record<ScoreView, string> = {
  standard: '五线谱',
  tablature: '六线谱',
  both: '双谱',
};
