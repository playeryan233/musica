import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PracticeProvider, usePractice, type SongInit } from '../features/practice/PracticeProvider';
import { PracticeControls } from '../features/practice/PracticeControls';
import { BPM_MAX, BPM_MIN } from '../features/practice/types';
import { ScoreToolbar } from '../features/score/ScoreToolbar';
import { ScoreViewer } from '../features/score/ScoreViewer';
import { preferenceRepository } from '../features/preferences/preferenceRepository';
import { SongRepository } from '../features/songs/songRepository';
import { SongList } from '../features/songs/SongList';
import { SongSearch } from '../features/songs/SongSearch';
import type { ScoreView, SongManifest, SongMetadata } from '../features/songs/types';
import { useSpaceToggle } from '../shared/useSpaceToggle';

/** Coalesce rapid slider changes into one localStorage write. */
const PREFERENCE_SAVE_DEBOUNCE_MS = 200;

export function SongsPage() {
  const [manifest, setManifest] = useState<SongManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    SongRepository.fetchManifest()
      .then((m) => {
        if (!cancelled) setManifest(m);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '曲库加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadNonce]);

  if (loading) {
    return (
      <main className="page page-centered">
        <p className="muted">正在加载曲库…</p>
      </main>
    );
  }

  if (error || !manifest) {
    return (
      <main className="page page-centered">
        <p className="error-text">{error ?? '曲库加载失败'}</p>
        <button type="button" className="btn" onClick={() => setReloadNonce((n) => n + 1)}>
          重试
        </button>
      </main>
    );
  }

  return (
    <PracticeProvider>
      <SongPractice manifest={manifest} />
    </PracticeProvider>
  );
}

function SongPractice({ manifest }: { manifest: SongManifest }) {
  const { songId } = useParams<{ songId: string }>();
  const navigate = useNavigate();
  const {
    state,
    transport,
    initForSong,
    setTimeline,
    setScoreStatus,
    setAutoFollow,
    setView,
    setZoom,
    setBpm,
    togglePlay,
  } = usePractice();

  const [query, setQuery] = useState('');

  const song = songId ? (SongRepository.findById(manifest, songId) ?? null) : null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return manifest.songs;
    return manifest.songs.filter(
      (s) => s.title.toLowerCase().includes(q) || (s.artist ?? '').toLowerCase().includes(q),
    );
  }, [manifest, query]);

  // Initialize settings for the current song (handles both selection and direct URL).
  useEffect(() => {
    if (!song) return;
    const prefs = preferenceRepository.load();
    const saved = prefs.songs[song.id];
    const init: SongInit = {
      bpm: saved?.bpm ?? song.defaultBpm,
      view:
        saved && song.availableViews.includes(saved.view)
          ? saved.view
          : (song.availableViews[0] ?? 'standard'),
      zoom: saved?.zoom ?? 1,
      metronomeEnabled: prefs.global.metronomeEnabled,
      metronomeVolume: prefs.global.metronomeVolume,
      autoFollow: prefs.global.autoFollow,
    };
    initForSong(init);
    // Persist the resolved settings immediately so the entry always holds the
    // current values (idempotent; safe under Strict Mode double-invocation).
    preferenceRepository.updateSong(song.id, { bpm: init.bpm, view: init.view, zoom: init.zoom });
    preferenceRepository.setLastSong(song.id);
  }, [song, initForSong]);

  // Global settings are saved on a short debounce: dragging the volume slider
  // fires dozens of changes and each one would otherwise hit localStorage. The
  // latest values are flushed on unmount so a quick navigation never loses the
  // last edit. `initForSong` already persists the per-song entry.
  const latestGlobal = useRef({
    metronomeEnabled: state.metronomeEnabled,
    metronomeVolume: state.metronomeVolume,
    autoFollow: state.autoFollow,
  });

  // Declared before the debounce effect so it runs first in the same commit and
  // the timeout always reads the values of the current render.
  useEffect(() => {
    latestGlobal.current = {
      metronomeEnabled: state.metronomeEnabled,
      metronomeVolume: state.metronomeVolume,
      autoFollow: state.autoFollow,
    };
  }, [state.metronomeEnabled, state.metronomeVolume, state.autoFollow]);

  const persistGlobal = useCallback((global: typeof latestGlobal.current) => {
    const prefs = preferenceRepository.load();
    prefs.global.metronomeEnabled = global.metronomeEnabled;
    prefs.global.metronomeVolume = global.metronomeVolume;
    prefs.global.autoFollow = global.autoFollow;
    preferenceRepository.save(prefs);
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => persistGlobal(latestGlobal.current), PREFERENCE_SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [state.metronomeEnabled, state.metronomeVolume, state.autoFollow, persistGlobal]);

  useEffect(() => () => persistGlobal(latestGlobal.current), [persistGlobal]);

  // Space toggles play/pause; it never steals the key from a focused control.
  useSpaceToggle(togglePlay);

  const selectSong = useCallback(
    (s: SongMetadata) => {
      navigate(`/songs/${s.id}`);
    },
    [navigate],
  );

  const resumeFollow = useCallback(() => setAutoFollow(true), [setAutoFollow]);

  const handleView = useCallback(
    (v: ScoreView) => {
      setView(v);
      if (song) preferenceRepository.updateSong(song.id, { view: v });
    },
    [setView, song],
  );

  const handleZoom = useCallback(
    (z: number) => {
      setZoom(z);
      if (song) preferenceRepository.updateSong(song.id, { zoom: z });
    },
    [setZoom, song],
  );

  const handleBpm = useCallback(
    (bpm: number) => {
      const clamped = Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(bpm)));
      setBpm(clamped);
      if (song) preferenceRepository.updateSong(song.id, { bpm: clamped });
    },
    [setBpm, song],
  );

  return (
    <main className="songs-layout">
      <header className="songs-topbar">
        <Link className="brand" to="/">
          Musica
        </Link>
        <nav className="songs-topbar-links">
          <Link to="/">首页</Link>
          <Link to="/songs">歌曲</Link>
          <Link to="/metronome">节拍器</Link>
        </nav>
      </header>

      <div className="songs-body">
        <aside className="songs-sidebar">
          <SongSearch value={query} onChange={setQuery} />
          <SongList songs={filtered} activeId={song?.id} onSelect={selectSong} />
        </aside>

        <section className="songs-main">
          {!song ? (
            <div className="score-empty">
              {songId ? (
                <>
                  <p className="error-text">未找到歌曲</p>
                  <Link className="btn" to="/songs">
                    返回歌曲列表
                  </Link>
                </>
              ) : (
                <p className="muted">从左侧选择一首歌曲开始练习</p>
              )}
            </div>
          ) : (
            <>
              <header className="songs-main-header">
                <h1>{song.title}</h1>
                <p className="muted">
                  {song.artist ?? '未知作者'} · 原速 ♩ = {song.defaultBpm}
                </p>
                <ScoreToolbar
                  availableViews={song.availableViews}
                  view={state.view}
                  zoom={state.zoom}
                  onViewChange={handleView}
                  onZoomChange={handleZoom}
                />
              </header>

              {state.error ? (
                <div className="score-empty">
                  <p className="error-text">曲谱加载失败：{state.error}</p>
                  <p className="muted">请返回列表选择其他歌曲。</p>
                </div>
              ) : (
                <ScoreViewer
                  key={song.id}
                  song={song}
                  view={state.view}
                  zoom={state.zoom}
                  autoFollow={state.autoFollow}
                  transport={transport}
                  status={state.scoreStatus}
                  onTimeline={setTimeline}
                  onScoreStatus={setScoreStatus}
                  onManualScroll={() => setAutoFollow(false)}
                  onResumeFollow={resumeFollow}
                />
              )}
            </>
          )}
        </section>
      </div>

      <footer className="songs-controls">
        <PracticeControls onBpmChange={handleBpm} />
      </footer>
    </main>
  );
}
