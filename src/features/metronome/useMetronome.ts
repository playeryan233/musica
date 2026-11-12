import { useCallback, useEffect, useRef, useState } from 'react';
import type { TimbreId } from '../audio/timbres';
import { MetronomeEngine } from './MetronomeEngine';
import { WebAudioMetronomeOutput } from './WebAudioMetronomeOutput';
import { loadMetronomeSettings, saveMetronomeSettings } from './metronomePreferences';
import {
  clampBpm,
  clampVolume,
  cycleBeatState,
  resizePattern,
  resetBar as resetBarPattern,
  setBarBeats,
  setBeat,
} from './pattern';
import type {
  BeatState,
  BeatUnit,
  MetronomePattern,
  MetronomeSettings,
  NoteSpeed,
  Playhead,
  Subdivision,
} from './types';

const TAP_TIMEOUT_MS = 2000;
const TAP_MAX_SAMPLES = 8;
const SAVE_DEBOUNCE_MS = 200;

export interface MetronomeController {
  settings: MetronomeSettings;
  /** Settings the engine and the staff are actually using right now. */
  appliedSettings: MetronomeSettings;
  /** A pattern change is queued for a step that is still off screen. */
  pending: boolean;
  pendingPattern: MetronomePattern | null;
  pendingAtStep: number | null;
  /** Tell the engine how many upcoming steps the staff can show. */
  setVisibleSteps: (steps: number) => void;
  playing: boolean;
  playhead: Playhead | null;
  /** Fractional step position for the staff animation; null while stopped. */
  getPosition: () => number | null;
  start: () => Promise<void>;
  stop: () => void;
  toggle: () => void;
  setBpm: (bpm: number) => void;
  setVolume: (volume: number) => void;
  setTimbre: (timbre: TimbreId) => void;
  setNoteSpeed: (speed: NoteSpeed) => void;
  setBeatsPerBar: (beatsPerBar: number) => void;
  setBeatUnit: (beatUnit: BeatUnit) => void;
  setBars: (bars: number) => void;
  setSubdivision: (subdivision: Subdivision) => void;
  applyPreset: (beatsPerBar: number, beatUnit: BeatUnit) => void;
  cycleBeat: (beatIndex: number) => void;
  setBarState: (barIndex: number, state: BeatState) => void;
  resetBar: (barIndex: number) => void;
  tap: () => void;
}

/**
 * Binds the standalone metronome engine to React state, keyboard-free UI
 * commands and localStorage. The engine itself stays a plain class so the
 * scheduling logic can be tested without a DOM.
 */
export function useMetronome(): MetronomeController {
  const [settings, setSettings] = useState<MetronomeSettings>(() => loadMetronomeSettings());
  const [applied, setApplied] = useState<MetronomeSettings>(settings);
  const [pendingState, setPendingState] = useState<{
    pattern: MetronomePattern;
    atStep: number;
  } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState<Playhead | null>(null);

  const outputRef = useRef<WebAudioMetronomeOutput | null>(null);
  const engineRef = useRef<MetronomeEngine | null>(null);
  if (!outputRef.current) outputRef.current = new WebAudioMetronomeOutput();
  if (!engineRef.current) engineRef.current = new MetronomeEngine(outputRef.current, settings);

  const output = outputRef.current;
  const engine = engineRef.current;

  const latest = useRef(settings);
  latest.current = settings;
  const appliedRef = useRef(applied);
  const pendingRef = useRef<{ settings: MetronomeSettings; atStep: number } | null>(null);
  const visibilitySteps = useRef(24);

  const taps = useRef<number[]>([]);

  const syncEngineState = useCallback(() => {
    const active = engine.currentSettings;
    if (active !== appliedRef.current) {
      appliedRef.current = active;
      setApplied(active);
    }
    const queued = engine.getPending();
    if (queued !== pendingRef.current) {
      pendingRef.current = queued;
      setPendingState(
        queued ? { pattern: queued.settings.pattern, atStep: queued.atStep } : null,
      );
    }
  }, [engine]);

  // Keep the engine in sync with React state (also applies the very first
  // settings, so localStorage values are used before the first click).
  useEffect(() => {
    engine.setSettings(settings);
    // While stopped every change applies immediately; while playing the engine
    // holds pattern changes until the new notes are still off screen.
    if (!engine.isPlaying) {
      appliedRef.current = engine.currentSettings;
      pendingRef.current = null;
      setApplied(engine.currentSettings);
      setPendingState(null);
    }
  }, [engine, settings]);

  useEffect(() => {
    const id = setTimeout(() => saveMetronomeSettings(latest.current), SAVE_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [settings]);

  useEffect(() => {
    return () => {
      engine.dispose();
      output.dispose();
      saveMetronomeSettings(latest.current);
    };
  }, [engine, output]);

  // Poll the audio-driven playhead at animation rate, but only re-render when
  // the current beat changes (not on every frame or subdivision).
  useEffect(() => {
    if (!playing) {
      setPlayhead(null);
      return;
    }
    let raf = 0;
    let lastKey = -1;
    const tick = () => {
      syncEngineState();
      const next = engine.getPlayhead();
      if (next) {
        // Step index of the current beat's start: unique across loops, so the
        // beat pulse animation can restart even when bar/beat repeat.
        const key = next.step - next.subdivisionIndex;
        if (key !== lastKey) {
          lastKey = key;
          setPlayhead(next);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [engine, playing, syncEngineState]);

  const start = useCallback(async () => {
    await engine.start(latest.current);
    syncEngineState();
    setPlaying(engine.isPlaying);
  }, [engine, syncEngineState]);

  const getPosition = useCallback(() => engine.getPosition(), [engine]);

  const setVisibleSteps = useCallback(
    (steps: number) => {
      visibilitySteps.current = Math.max(1, Math.round(steps));
      engine.setDeferSteps(visibilitySteps.current + 2);
      syncEngineState();
    },
    [engine, syncEngineState],
  );

  const stop = useCallback(() => {
    engine.stop();
    // Now that playback is stopped, apply any queued pattern immediately.
    engine.setSettings(latest.current);
    appliedRef.current = engine.currentSettings;
    pendingRef.current = null;
    setApplied(engine.currentSettings);
    setPendingState(null);
    setPlaying(false);
  }, [engine]);

  const toggle = useCallback(() => {
    if (engine.isPlaying) stop();
    else void start();
  }, [engine, start, stop]);

  const setBpm = useCallback((bpm: number) => {
    setSettings((s) => {
      const next = clampBpm(bpm);
      return next === s.bpm ? s : { ...s, bpm: next };
    });
  }, []);

  const setVolume = useCallback((volume: number) => {
    setSettings((s) => {
      const next = clampVolume(volume);
      return next === s.volume ? s : { ...s, volume: next };
    });
  }, []);

  const setTimbre = useCallback((timbre: TimbreId) => {
    setSettings((s) => (s.timbre === timbre ? s : { ...s, timbre }));
  }, []);

  const setNoteSpeed = useCallback((noteSpeed: NoteSpeed) => {
    setSettings((s) => (s.noteSpeed === noteSpeed ? s : { ...s, noteSpeed }));
  }, []);

  const updatePattern = useCallback((update: (pattern: MetronomePattern) => MetronomePattern) => {
    setSettings((s) => {
      const pattern = update(s.pattern);
      return pattern === s.pattern ? s : { ...s, pattern };
    });
  }, []);

  const setBeatsPerBar = useCallback(
    (beatsPerBar: number) => updatePattern((p) => resizePattern(p, { beatsPerBar })),
    [updatePattern],
  );

  const setBeatUnit = useCallback(
    (beatUnit: BeatUnit) => updatePattern((p) => resizePattern(p, { beatUnit })),
    [updatePattern],
  );

  const setBars = useCallback(
    (bars: number) => updatePattern((p) => resizePattern(p, { bars })),
    [updatePattern],
  );

  const setSubdivision = useCallback(
    (subdivision: Subdivision) => updatePattern((p) => resizePattern(p, { subdivision })),
    [updatePattern],
  );

  const applyPreset = useCallback(
    (beatsPerBar: number, beatUnit: BeatUnit) =>
      updatePattern((p) => resizePattern(p, { beatsPerBar, beatUnit })),
    [updatePattern],
  );

  const cycleBeat = useCallback(
    (beatIndex: number) =>
      updatePattern((p) => {
        const state = p.beats[beatIndex];
        return state ? setBeat(p, beatIndex, cycleBeatState(state)) : p;
      }),
    [updatePattern],
  );

  const setBarState = useCallback(
    (barIndex: number, state: BeatState) => updatePattern((p) => setBarBeats(p, barIndex, state)),
    [updatePattern],
  );

  const resetBar = useCallback(
    (barIndex: number) => updatePattern((p) => resetBarPattern(p, barIndex)),
    [updatePattern],
  );

  const tap = useCallback(() => {
    const now = performance.now();
    const recent = taps.current.filter((t) => now - t <= TAP_TIMEOUT_MS);
    recent.push(now);
    taps.current = recent.slice(-TAP_MAX_SAMPLES);
    if (recent.length < 2) return;

    let total = 0;
    for (let i = 1; i < recent.length; i++) total += recent[i] - recent[i - 1];
    const average = total / (recent.length - 1);
    if (average <= 0) return;
    setBpm(Math.round(60000 / average));
  }, [setBpm]);

  return {
    settings,
    appliedSettings: applied,
    pending: pendingState !== null,
    pendingPattern: pendingState?.pattern ?? null,
    pendingAtStep: pendingState?.atStep ?? null,
    setVisibleSteps,
    playing,
    playhead,
    getPosition,
    start,
    stop,
    toggle,
    setBpm,
    setVolume,
    setTimbre,
    setNoteSpeed,
    setBeatsPerBar,
    setBeatUnit,
    setBars,
    setSubdivision,
    applyPreset,
    cycleBeat,
    setBarState,
    resetBar,
    tap,
  };
}
