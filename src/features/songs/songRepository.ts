import type { ScoreView, SongManifest, SongMetadata } from './types';

const SCHEMA_VERSION = 1;

/** Resolve a manifest-relative or app-relative URL against the deployment base. */
export function resolveAssetUrl(url: string, base: string = import.meta.env.BASE_URL): string {
  // Absolute URLs (CDN-hosted scores) pass through untouched.
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//')) return url;
  const relative = url.replace(/^\/+/, '');
  if (/^https?:\/\//i.test(base)) return new URL(relative, base).toString();
  return `${base}${relative}`.replace(/\/{2,}/g, '/');
}

function isScoreView(value: unknown): value is ScoreView {
  return value === 'standard' || value === 'tablature' || value === 'both';
}

function validateSong(raw: unknown): raw is SongMetadata {
  if (typeof raw !== 'object' || raw === null) return false;
  const s = raw as Record<string, unknown>;
  return (
    typeof s.id === 'string' &&
    typeof s.title === 'string' &&
    typeof s.scoreUrl === 'string' &&
    (s.format === 'musicxml' || s.format === 'guitar-pro') &&
    typeof s.defaultBpm === 'number' &&
    Number.isFinite(s.defaultBpm) &&
    typeof s.defaultTrackIndex === 'number' &&
    Array.isArray(s.availableViews) &&
    s.availableViews.every(isScoreView) &&
    s.practiceStructure === 'linear'
  );
}

export class SongRepository {
  static async fetchManifest(signal?: AbortSignal): Promise<SongManifest> {
    const url = resolveAssetUrl('songs/index.json');
    const res = await fetch(url, { signal });
    if (!res.ok) {
      throw new Error(`曲库清单加载失败（HTTP ${res.status}）`);
    }
    const json: unknown = await res.json();
    return SongRepository.parseManifest(json);
  }

  static parseManifest(json: unknown): SongManifest {
    if (typeof json !== 'object' || json === null) {
      throw new Error('曲库清单格式错误');
    }
    const m = json as Record<string, unknown>;
    if (m.schemaVersion !== SCHEMA_VERSION || !Array.isArray(m.songs)) {
      throw new Error('曲库清单版本不受支持');
    }
    if (!m.songs.every(validateSong)) {
      throw new Error('曲库清单包含无效的歌曲条目');
    }
    return { schemaVersion: SCHEMA_VERSION, songs: m.songs as SongMetadata[] };
  }

  static findById(manifest: SongManifest, id: string): SongMetadata | null {
    return manifest.songs.find((s) => s.id === id) ?? null;
  }
}
