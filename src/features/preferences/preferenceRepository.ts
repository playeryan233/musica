import type { ScoreView } from '../songs/types';

export interface StoredPreferences {
  version: 1;
  lastSongId?: string;
  global: {
    metronomeEnabled: boolean;
    metronomeVolume: number;
    autoFollow: boolean;
  };
  songs: Record<string, { bpm: number; view: ScoreView; zoom: number; updatedAt: number }>;
}

const STORAGE_KEY = 'musica.preferences.v1';

const DEFAULT_PREFERENCES: StoredPreferences = {
  version: 1,
  global: {
    metronomeEnabled: true,
    metronomeVolume: 0.3,
    autoFollow: true,
  },
  songs: {},
};

function isScoreView(v: unknown): v is ScoreView {
  return v === 'standard' || v === 'tablature' || v === 'both';
}

function clampZoom(z: unknown): number {
  const n = typeof z === 'number' ? z : Number(z);
  if (!Number.isFinite(n)) return 1;
  return Math.min(2, Math.max(0.5, n));
}

function clampVolume(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return 0.3;
  return Math.min(1, Math.max(0, n));
}

function sanitize(raw: unknown): StoredPreferences {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_PREFERENCES };
  const r = raw as Partial<StoredPreferences>;
  const songs: StoredPreferences['songs'] = {};
  if (r.songs && typeof r.songs === 'object') {
    for (const [id, entry] of Object.entries(r.songs as Record<string, unknown>)) {
      if (typeof entry !== 'object' || entry === null) continue;
      const e = entry as Record<string, unknown>;
      if (typeof e.bpm !== 'number' || !isScoreView(e.view)) continue;
      songs[id] = {
        bpm: e.bpm,
        view: e.view,
        zoom: clampZoom(e.zoom),
        updatedAt: typeof e.updatedAt === 'number' ? e.updatedAt : Date.now(),
      };
    }
  }
  const g = r.global as Partial<StoredPreferences['global']> | undefined;
  return {
    version: 1,
    lastSongId: typeof r.lastSongId === 'string' ? r.lastSongId : undefined,
    global: {
      metronomeEnabled: g?.metronomeEnabled !== false,
      metronomeVolume: clampVolume(g?.metronomeVolume),
      autoFollow: g?.autoFollow !== false,
    },
    songs,
  };
}

export class PreferenceRepository {
  private cache: StoredPreferences | null = null;

  load(): StoredPreferences {
    if (this.cache) return this.cache;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      this.cache = raw ? sanitize(JSON.parse(raw)) : { ...DEFAULT_PREFERENCES };
    } catch {
      this.cache = { ...DEFAULT_PREFERENCES };
    }
    return this.cache;
  }

  save(prefs: StoredPreferences): void {
    this.cache = prefs;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // Writing failed; keep using in-memory state, don't block practice.
    }
  }

  getSong(id: string): StoredPreferences['songs'][string] | undefined {
    return this.load().songs[id];
  }

  updateSong(id: string, patch: { bpm?: number; view?: ScoreView; zoom?: number }): StoredPreferences {
    const prefs = this.load();
    const existing = prefs.songs[id] ?? { bpm: 0, view: 'standard' as ScoreView, zoom: 1, updatedAt: 0 };
    prefs.songs[id] = {
      bpm: patch.bpm ?? existing.bpm,
      view: patch.view ?? existing.view,
      zoom: patch.zoom ?? existing.zoom,
      updatedAt: Date.now(),
    };
    this.save(prefs);
    return prefs;
  }

  setLastSong(id: string): void {
    const prefs = this.load();
    prefs.lastSongId = id;
    this.save(prefs);
  }
}

export const preferenceRepository = new PreferenceRepository();
