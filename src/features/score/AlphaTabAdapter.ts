import * as alphaTab from '@coderline/alphatab';
import { resolveAssetUrl } from '../songs/songRepository';
import type { ScoreView } from '../songs/types';
import type { Rect, ScoreAdapter, TimelineSource, TimelineSourceBar } from './types';

/** alphaTab's internal ticks-per-quarter-note (MidiUtils.QuarterTime, not exported). */
const QUARTER_TICKS = 960;

/**
 * Wraps alphaTab behind the app's own {@link ScoreAdapter} interface. It owns
 * the engine instance, exposes bar-level timeline data and layout coordinates,
 * and translates view / zoom changes into re-renders.
 */
export class AlphaTabAdapter implements ScoreAdapter {
  private api: alphaTab.AlphaTabApi | null = null;
  private timelineSource: TimelineSource | null = null;
  private layoutListeners = new Set<() => void>();
  private offScoreLoaded: (() => void) | null = null;
  private offPostRenderFinished: (() => void) | null = null;
  private offError: (() => void) | null = null;
  private loadResolve: (() => void) | null = null;
  private loadReject: ((e: unknown) => void) | null = null;
  private scoreLoaded = false;
  private pendingView: ScoreView = 'standard';

  constructor(private element: HTMLElement) {}

  load(
    song: { scoreUrl: string; defaultTrackIndex: number },
    view: ScoreView,
    zoom: number,
    signal?: AbortSignal,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      const api = this.ensureApi();
      this.scoreLoaded = false;
      this.timelineSource = null;
      this.pendingView = view;
      this.loadResolve = resolve;
      this.loadReject = reject;

      // Zoom is a display setting and can be applied before the first render.
      api.settings.display.scale = zoom;

      const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
      signal?.addEventListener('abort', onAbort, { once: true });

      const started = api.load(resolveAssetUrl(song.scoreUrl), [song.defaultTrackIndex]);
      if (!started) {
        this.loadResolve = null;
        this.loadReject = null;
        signal?.removeEventListener('abort', onAbort);
        reject(new Error('无法解析该曲谱格式'));
      }
    });
  }

  async setView(view: ScoreView): Promise<void> {
    this.pendingView = view;
    if (this.applyViewFlags(view)) {
      this.api?.render();
    }
  }

  async setZoom(scale: number): Promise<void> {
    const api = this.api;
    if (!api) return;
    if (api.settings.display.scale === scale) return;
    api.settings.display.scale = scale;
    api.updateSettings();
    api.render();
  }

  resizeRender(): void {
    this.api?.renderer.resizeRender();
  }

  get hasScore(): boolean {
    return this.scoreLoaded;
  }

  getTimelineSource(): TimelineSource | null {
    return this.timelineSource;
  }

  getBarRect(barIndex: number): Rect | null {
    const api = this.api;
    if (!api || !api.boundsLookup) return null;
    const mb = api.boundsLookup.findMasterBarByIndex(barIndex);
    if (!mb) return null;
    const b = mb.realBounds;
    return { x: b.x, y: b.y, width: b.w, height: b.h };
  }

  onLayoutChanged(listener: () => void): () => void {
    this.layoutListeners.add(listener);
    return () => {
      this.layoutListeners.delete(listener);
    };
  }

  destroy(): void {
    this.offScoreLoaded?.();
    this.offPostRenderFinished?.();
    this.offError?.();
    this.offScoreLoaded = null;
    this.offPostRenderFinished = null;
    this.offError = null;
    this.loadResolve = null;
    this.loadReject = null;
    this.timelineSource = null;
    this.api?.destroy();
    this.api = null;
  }

  private ensureApi(): alphaTab.AlphaTabApi {
    if (this.api) return this.api;

    const api = new alphaTab.AlphaTabApi(this.element, {
      // alphaTab 默认从自身脚本所在目录推导字体路径。生产构建里它被打包到
      // `/assets/alphaTab.core-*.js`，推导结果会是 `/assets/font/`，而 Vite 插件
      // 把字库拷到了站点根 `font/`，于是谱面字体 404、渲染直接失败。
      // 显式按部署 base 指定，根目录与子路径部署都能命中。
      core: {
        fontDirectory: `${import.meta.env.BASE_URL}font/`,
      },
      display: {
        layoutMode: alphaTab.LayoutMode.Page,
        scale: 1,
      },
    });
    this.api = api;

    this.offScoreLoaded = api.scoreLoaded.on((score) => {
      this.scoreLoaded = true;
      this.timelineSource = this.buildTimelineSource(score);
      // Apply the view before the first render so standard/tab/both is correct.
      this.applyViewFlags(this.pendingView);
    });

    // `boundsLookup` is only populated during postRenderFinished (alphaTab
    // rebuilds it from the serialized bounds in that event), so the load must
    // resolve there — not on renderFinished — or getBarRect() returns null and
    // the highlight overlay never positions.
    this.offPostRenderFinished = api.postRenderFinished.on(() => {
      if (this.scoreLoaded && this.loadResolve) {
        const resolve = this.loadResolve;
        this.loadResolve = null;
        this.loadReject = null;
        resolve();
      }
      this.emitLayoutChanged();
    });

    this.offError = api.error.on((e) => {
      if (this.loadReject) {
        const reject = this.loadReject;
        this.loadResolve = null;
        this.loadReject = null;
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });

    return api;
  }

  private buildTimelineSource(score: alphaTab.model.Score): TimelineSource {
    const bars: TimelineSourceBar[] = [];
    let cursor = 0;
    score.masterBars.forEach((mb, i) => {
      const durationQuarter = mb.calculateDuration() / QUARTER_TICKS;
      bars.push({
        sourceBarIndex: i,
        startQuarter: cursor,
        durationQuarter,
        numerator: mb.timeSignatureNumerator,
        denominator: mb.timeSignatureDenominator,
        isAnacrusis: mb.isAnacrusis,
      });
      cursor += durationQuarter;
    });
    return { bars, durationQuarter: cursor };
  }

  /**
   * Toggle the standard / tablature staves directly on the model. This is the
   * non-deprecated replacement for the `staveProfile` display setting.
   */
  private applyViewFlags(view: ScoreView): boolean {
    const api = this.api;
    if (!api || !api.score) return false;
    const showStandard = view === 'standard' || view === 'both';
    const showTablature = view === 'tablature' || view === 'both';
    let changed = false;
    for (const track of api.score.tracks) {
      for (const staff of track.staves) {
        if (staff.showStandardNotation !== showStandard) {
          staff.showStandardNotation = showStandard;
          changed = true;
        }
        if (staff.showTablature !== showTablature) {
          staff.showTablature = showTablature;
          changed = true;
        }
      }
    }
    return changed;
  }

  private emitLayoutChanged(): void {
    for (const listener of this.layoutListeners) listener();
  }
}
