import { useCallback, useEffect, useRef } from 'react';
import type { ScoreView, SongMetadata } from '../songs/types';
import { buildTimeline } from '../practice/TimelineBuilder';
import { HighlightController } from '../practice/HighlightController';
import { ScrollController } from '../practice/ScrollController';
import type { PracticeTransport } from '../practice/PracticeTransport';
import type { PracticeTimeline, ScoreStatus } from '../practice/types';
import { AlphaTabAdapter } from './AlphaTabAdapter';

interface ScoreViewerProps {
  song: SongMetadata;
  view: ScoreView;
  zoom: number;
  autoFollow: boolean;
  transport: PracticeTransport;
  onTimeline: (timeline: PracticeTimeline) => void;
  onScoreStatus: (status: ScoreStatus, error?: string | null) => void;
  onManualScroll: () => void;
  onResumeFollow: () => void;
}

export function ScoreViewer({
  song,
  view,
  zoom,
  autoFollow,
  transport,
  onTimeline,
  onScoreStatus,
  onManualScroll,
  onResumeFollow,
}: ScoreViewerProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const alphaTabRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const adapterRef = useRef<AlphaTabAdapter | null>(null);
  const highlightRef = useRef<HighlightController | null>(null);
  const scrollRef = useRef<ScrollController | null>(null);
  const offsetRef = useRef({ x: 0, y: 0 });
  const currentBarRef = useRef(0);
  const loadedRef = useRef(false);

  const viewRef = useRef(view);
  const zoomRef = useRef(zoom);
  const onManualScrollRef = useRef(onManualScroll);
  useEffect(() => {
    viewRef.current = view;
    zoomRef.current = zoom;
    onManualScrollRef.current = onManualScroll;
  });

  const computeOffset = useCallback(() => {
    const canvas = alphaTabRef.current?.querySelector('canvas');
    const stage = stageRef.current;
    if (!canvas || !stage) {
      offsetRef.current = { x: 0, y: 0 };
      return;
    }
    const s = stage.getBoundingClientRect();
    const c = canvas.getBoundingClientRect();
    offsetRef.current = { x: c.left - s.left, y: c.top - s.top };
  }, []);

  const applyBar = useCallback((index: number) => {
    currentBarRef.current = index;
    const adapter = adapterRef.current;
    const rect = adapter?.getBarRect(index) ?? null;
    if (rect) {
      const o = offsetRef.current;
      const r = { x: rect.x + o.x, y: rect.y + o.y, width: rect.width, height: rect.height };
      highlightRef.current?.show(r);
      scrollRef.current?.follow(r);
    } else {
      highlightRef.current?.clear();
    }
  }, []);

  // Mount once: create adapter + controllers, subscribe, observe resize.
  useEffect(() => {
    const adapter = new AlphaTabAdapter(alphaTabRef.current!);
    const highlight = new HighlightController(overlayRef.current!);
    const scroll = new ScrollController(viewportRef.current!, {
      onManualScroll: () => onManualScrollRef.current(),
    });
    adapterRef.current = adapter;
    highlightRef.current = highlight;
    scrollRef.current = scroll;

    const offLayout = adapter.onLayoutChanged(() => {
      computeOffset();
      applyBar(currentBarRef.current);
    });
    const offBar = transport.barChange.on((index) => applyBar(index));

    const ro = new ResizeObserver(() => adapter.resizeRender());
    if (stageRef.current) ro.observe(stageRef.current);

    return () => {
      offLayout();
      offBar();
      ro.disconnect();
      highlight.clear();
      adapter.destroy();
      adapterRef.current = null;
      highlightRef.current = null;
      scrollRef.current = null;
      loadedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load the score once per song, then apply the current view/zoom.
  useEffect(() => {
    const adapter = adapterRef.current;
    if (!adapter) return;
    let cancelled = false;
    const ac = new AbortController();
    loadedRef.current = false;
    onScoreStatus('loading');

    adapter
      .load(song, viewRef.current, zoomRef.current, ac.signal)
      .then(async () => {
        if (cancelled) return;
        // Finalize view/zoom in case settings changed while loading.
        await adapter.setView(viewRef.current);
        await adapter.setZoom(zoomRef.current);
        const source = adapter.getTimelineSource();
        if (!source) {
          onScoreStatus('error', '无法解析音乐时间轴');
          return;
        }
        loadedRef.current = true;
        onTimeline(buildTimeline(source));
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : '曲谱加载失败';
        onScoreStatus('error', msg);
      });

    return () => {
      cancelled = true;
      ac.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song.id]);

  useEffect(() => {
    if (loadedRef.current) void adapterRef.current?.setView(view);
  }, [view]);

  useEffect(() => {
    if (loadedRef.current) void adapterRef.current?.setZoom(zoom);
  }, [zoom]);

  useEffect(() => {
    scrollRef.current?.setAutoFollow(autoFollow);
    if (autoFollow) applyBar(currentBarRef.current);
  }, [autoFollow, applyBar]);

  return (
    <div className="score-viewport" ref={viewportRef}>
      <div className="score-stage" ref={stageRef}>
        <div className="score-canvas" ref={alphaTabRef} />
        <div className="score-highlight" ref={overlayRef} aria-hidden="true" />
      </div>
      {!autoFollow && (
        <button type="button" className="resume-follow" onClick={onResumeFollow}>
          恢复跟随
        </button>
      )}
    </div>
  );
}
