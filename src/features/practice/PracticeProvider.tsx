import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import type { ScoreView } from '../songs/types';
import { audioManager } from '../audio/audioManager';
import { MetronomeScheduler } from './MetronomeScheduler';
import { PracticeTransport } from './PracticeTransport';
import type { PracticeTimeline, ScoreStatus, TransportStatus } from './types';
import { BPM_MAX, BPM_MIN } from './types';

export interface PracticeState {
  scoreStatus: ScoreStatus;
  transportStatus: TransportStatus;
  currentBarIndex: number;
  bpm: number;
  metronomeEnabled: boolean;
  metronomeVolume: number;
  autoFollow: boolean;
  view: ScoreView;
  zoom: number;
  positionQuarter: number;
  durationQuarter: number;
  error: string | null;
}

const initialState: PracticeState = {
  scoreStatus: 'idle',
  transportStatus: 'stopped',
  currentBarIndex: 0,
  bpm: 60,
  metronomeEnabled: true,
  metronomeVolume: 0.3,
  autoFollow: true,
  view: 'standard',
  zoom: 1,
  positionQuarter: 0,
  durationQuarter: 0,
  error: null,
};

type Action =
  | { type: 'SCORE_STATUS'; status: ScoreStatus; error?: string | null }
  | { type: 'TRANSPORT_STATUS'; status: TransportStatus }
  | { type: 'BAR'; index: number }
  | { type: 'POSITION'; quarter: number }
  | { type: 'DURATION'; quarter: number }
  | { type: 'BPM'; bpm: number }
  | { type: 'METRONOME'; enabled: boolean }
  | { type: 'VOLUME'; volume: number }
  | { type: 'AUTOFOLLOW'; enabled: boolean }
  | { type: 'VIEW'; view: ScoreView }
  | { type: 'ZOOM'; zoom: number }
  | { type: 'INIT'; init: Partial<PracticeState> };

function reducer(state: PracticeState, action: Action): PracticeState {
  switch (action.type) {
    case 'SCORE_STATUS':
      return { ...state, scoreStatus: action.status, error: action.error ?? null };
    case 'TRANSPORT_STATUS':
      return { ...state, transportStatus: action.status };
    case 'BAR':
      return { ...state, currentBarIndex: action.index };
    case 'POSITION':
      return { ...state, positionQuarter: action.quarter };
    case 'DURATION':
      return { ...state, durationQuarter: action.quarter };
    case 'BPM':
      return { ...state, bpm: action.bpm };
    case 'METRONOME':
      return { ...state, metronomeEnabled: action.enabled };
    case 'VOLUME':
      return { ...state, metronomeVolume: action.volume };
    case 'AUTOFOLLOW':
      return { ...state, autoFollow: action.enabled };
    case 'VIEW':
      return { ...state, view: action.view };
    case 'ZOOM':
      return { ...state, zoom: action.zoom };
    case 'INIT':
      return {
        ...state,
        ...action.init,
        scoreStatus: 'idle',
        transportStatus: 'stopped',
        currentBarIndex: 0,
        positionQuarter: 0,
        durationQuarter: 0,
        error: null,
      };
    default:
      return state;
  }
}

export interface SongInit {
  bpm: number;
  view: ScoreView;
  zoom: number;
  metronomeEnabled: boolean;
  metronomeVolume: number;
  autoFollow: boolean;
}

interface PracticeContextValue {
  state: PracticeState;
  transport: PracticeTransport;
  scheduler: MetronomeScheduler;
  setTimeline: (timeline: PracticeTimeline) => void;
  setScoreStatus: (status: ScoreStatus, error?: string | null) => void;
  initForSong: (init: SongInit) => void;
  start: () => void;
  pause: () => void;
  stop: () => void;
  togglePlay: () => void;
  setBpm: (bpm: number) => void;
  setMetronomeEnabled: (enabled: boolean) => void;
  setMetronomeVolume: (volume: number) => void;
  setAutoFollow: (enabled: boolean) => void;
  setView: (view: ScoreView) => void;
  setZoom: (zoom: number) => void;
}

const PracticeContext = createContext<PracticeContextValue | null>(null);

export function PracticeProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const schedulerRef = useRef<MetronomeScheduler | null>(null);
  if (!schedulerRef.current) schedulerRef.current = new MetronomeScheduler();
  const scheduler = schedulerRef.current;

  const transportRef = useRef<PracticeTransport | null>(null);
  if (!transportRef.current) {
    transportRef.current = new PracticeTransport(
      {
        now: () => audioManager.now(),
        ensureRunning: () => audioManager.ensureRunning().then(() => undefined),
        scheduler,
      },
      initialState.bpm,
    );
  }
  const transport = transportRef.current;

  useEffect(() => {
    const offStatus = transport.statusChange.on((status) =>
      dispatch({ type: 'TRANSPORT_STATUS', status }),
    );
    const offBar = transport.barChange.on((index) => dispatch({ type: 'BAR', index }));
    let lastPosAt = 0;
    const offProgress = transport.progress.on((quarter) => {
      const now = performance.now();
      if (now - lastPosAt > 200) {
        lastPosAt = now;
        dispatch({ type: 'POSITION', quarter });
      }
    });
    return () => {
      offStatus();
      offBar();
      offProgress();
    };
  }, [transport]);

  useEffect(() => {
    return () => {
      transport.dispose();
      scheduler.stop();
    };
  }, [transport, scheduler]);

  const setTimeline = useCallback(
    (timeline: PracticeTimeline) => {
      transport.setTimeline(timeline);
      dispatch({ type: 'DURATION', quarter: timeline.durationQuarter });
      dispatch({ type: 'SCORE_STATUS', status: 'ready' });
    },
    [transport],
  );

  const setScoreStatus = useCallback((status: ScoreStatus, error?: string | null) => {
    dispatch({ type: 'SCORE_STATUS', status, error });
  }, []);

  const initForSong = useCallback(
    (init: SongInit) => {
      transport.stop();
      transport.setBpm(init.bpm);
      transport.setMetronomeEnabled(init.metronomeEnabled);
      scheduler.setVolume(init.metronomeVolume);
      dispatch({
        type: 'INIT',
        init: {
          bpm: init.bpm,
          view: init.view,
          zoom: init.zoom,
          metronomeEnabled: init.metronomeEnabled,
          metronomeVolume: init.metronomeVolume,
          autoFollow: init.autoFollow,
        },
      });
    },
    [transport, scheduler],
  );

  const start = useCallback(() => {
    void transport.start();
  }, [transport]);

  const pause = useCallback(() => transport.pause(), [transport]);

  const stop = useCallback(() => transport.stop(), [transport]);

  const togglePlay = useCallback(() => {
    if (transport.currentStatus === 'playing') transport.pause();
    else void transport.start();
  }, [transport]);

  const setBpm = useCallback(
    (bpm: number) => {
      const clamped = Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(bpm)));
      transport.setBpm(clamped);
      dispatch({ type: 'BPM', bpm: clamped });
    },
    [transport],
  );

  const setMetronomeEnabled = useCallback(
    (enabled: boolean) => {
      transport.setMetronomeEnabled(enabled);
      dispatch({ type: 'METRONOME', enabled });
    },
    [transport],
  );

  const setMetronomeVolume = useCallback(
    (volume: number) => {
      scheduler.setVolume(volume);
      dispatch({ type: 'VOLUME', volume });
    },
    [scheduler],
  );

  const setAutoFollow = useCallback((enabled: boolean) => {
    dispatch({ type: 'AUTOFOLLOW', enabled });
  }, []);

  const setView = useCallback(
    (view: ScoreView) => {
      if (transport.currentStatus === 'playing') transport.pause();
      dispatch({ type: 'VIEW', view });
    },
    [transport],
  );

  const setZoom = useCallback(
    (zoom: number) => {
      if (transport.currentStatus === 'playing') transport.pause();
      dispatch({ type: 'ZOOM', zoom });
    },
    [transport],
  );

  const value = useMemo<PracticeContextValue>(
    () => ({
      state,
      transport,
      scheduler,
      setTimeline,
      setScoreStatus,
      initForSong,
      start,
      pause,
      stop,
      togglePlay,
      setBpm,
      setMetronomeEnabled,
      setMetronomeVolume,
      setAutoFollow,
      setView,
      setZoom,
    }),
    [
      state,
      transport,
      scheduler,
      setTimeline,
      setScoreStatus,
      initForSong,
      start,
      pause,
      stop,
      togglePlay,
      setBpm,
      setMetronomeEnabled,
      setMetronomeVolume,
      setAutoFollow,
      setView,
      setZoom,
    ],
  );

  return <PracticeContext.Provider value={value}>{children}</PracticeContext.Provider>;
}

export function usePractice(): PracticeContextValue {
  const ctx = useContext(PracticeContext);
  if (!ctx) throw new Error('usePractice must be used within PracticeProvider');
  return ctx;
}
