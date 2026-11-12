import type { MetronomeScheduler } from './MetronomeScheduler';
import { findBarIndex, findNextClickIndex } from './TimelineBuilder';
import { quarterFromAnchor } from './time';
import type { PracticeTimeline, TransportAnchor, TransportStatus } from './types';
import { BPM_MAX, BPM_MIN } from './types';

const EPS = 1e-6;

export interface TransportDeps {
  /** Monotonic clock in seconds; must match the metronome's audio clock. */
  now: () => number;
  ensureRunning: () => Promise<void>;
  scheduler: MetronomeScheduler;
}

type Listener<T> = (value: T) => void;

class Emitter<T> {
  private listeners = new Set<Listener<T>>();
  on(listener: Listener<T>): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  emit(value: T): void {
    for (const listener of this.listeners) listener(value);
  }
}

/**
 * The single source of truth for practice progress. Holds the music position,
 * the anchor used to convert between music and audio time, and the playing
 * status. It never advances time by counting React renders.
 */
export class PracticeTransport {
  readonly statusChange = new Emitter<TransportStatus>();
  readonly barChange = new Emitter<number>();
  readonly progress = new Emitter<number>();

  private timeline: PracticeTimeline | null = null;
  private anchor: TransportAnchor | null = null;
  private position = 0;
  private status: TransportStatus = 'stopped';
  private bpm: number;
  private metronomeEnabled = true;
  private rafId: number | null = null;
  private lastBarIndex = -1;
  private session = 0;

  constructor(
    private deps: TransportDeps,
    initialBpm: number,
  ) {
    this.bpm = initialBpm;
  }

  get currentStatus(): TransportStatus {
    return this.status;
  }

  get currentBpm(): number {
    return this.bpm;
  }

  get isMetronomeEnabled(): boolean {
    return this.metronomeEnabled;
  }

  get durationQuarter(): number {
    return this.timeline?.durationQuarter ?? 0;
  }

  /** Current music position in quarters, at the given clock time. */
  getQuarter(now: number = this.deps.now()): number {
    if (this.anchor) return quarterFromAnchor(this.anchor, now);
    return this.position;
  }

  setTimeline(timeline: PracticeTimeline): void {
    this.session++;
    this.timeline = timeline;
    this.deps.scheduler.setClicks(timeline.clicks);
    this.position = 0;
    this.anchor = null;
    this.lastBarIndex = -1;
    this.stopRaf();
    this.deps.scheduler.stop();
    this.setStatus('stopped');
    this.barChange.emit(0);
    this.progress.emit(0);
  }

  async start(): Promise<void> {
    if (!this.timeline || this.status === 'playing') return;
    if (this.status === 'finished' || this.position >= this.timeline.durationQuarter - EPS) {
      this.position = 0;
    }
    const session = ++this.session;
    await this.deps.ensureRunning();
    if (session !== this.session) return; // superseded by stop/switch

    const now = this.deps.now();
    this.anchor = { audioTime: now, quarter: this.position, bpm: this.bpm };
    this.setStatus('playing');
    if (this.metronomeEnabled) {
      const from = findNextClickIndex(this.timeline.clicks, this.position);
      await this.deps.scheduler.start(this.anchor, from);
    }
    this.startRaf();
  }

  pause(): void {
    if (this.status !== 'playing') return;
    this.position = this.getQuarter();
    this.anchor = null;
    this.deps.scheduler.stop();
    this.stopRaf();
    this.setStatus('paused');
  }

  /** Return to the beginning (回到开头). */
  stop(): void {
    this.session++;
    this.position = 0;
    this.anchor = null;
    this.deps.scheduler.stop();
    this.stopRaf();
    this.lastBarIndex = -1;
    this.setStatus('stopped');
    this.barChange.emit(0);
    this.progress.emit(0);
  }

  setBpm(bpm: number): void {
    const clamped = Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(bpm)));
    if (clamped === this.bpm) return;
    this.bpm = clamped;
    if (this.status === 'playing' && this.timeline) {
      const now = this.deps.now();
      const q = this.getQuarter(now);
      this.anchor = { audioTime: now, quarter: q, bpm: clamped };
      if (this.metronomeEnabled) {
        const from = findNextClickIndex(this.timeline.clicks, q);
        this.deps.scheduler.reschedule(this.anchor, from);
      }
    }
  }

  setMetronomeEnabled(enabled: boolean): void {
    if (this.metronomeEnabled === enabled) return;
    this.metronomeEnabled = enabled;
    if (this.status !== 'playing' || !this.timeline) return;
    if (enabled) {
      const now = this.deps.now();
      const q = this.getQuarter(now);
      this.anchor = { audioTime: now, quarter: q, bpm: this.bpm };
      const from = findNextClickIndex(this.timeline.clicks, q);
      void this.deps.scheduler.start(this.anchor, from);
    } else {
      this.deps.scheduler.stop();
    }
  }

  dispose(): void {
    this.session++;
    this.stopRaf();
    this.deps.scheduler.stop();
  }

  private startRaf(): void {
    if (this.rafId !== null) return;
    this.rafId = requestAnimationFrame(this.tick);
  }

  private stopRaf(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private tick = (): void => {
    if (this.status !== 'playing' || !this.anchor || !this.timeline) return;
    const now = this.deps.now();
    const q = quarterFromAnchor(this.anchor, now);

    if (q >= this.timeline.durationQuarter) {
      this.position = this.timeline.durationQuarter;
      this.anchor = null;
      this.deps.scheduler.stop();
      this.stopRaf();
      this.setStatus('finished');
      this.progress.emit(this.position);
      const last = this.timeline.bars.length - 1;
      if (last !== this.lastBarIndex && last >= 0) {
        this.lastBarIndex = last;
        this.barChange.emit(last);
      }
      return;
    }

    this.progress.emit(q);
    const idx = findBarIndex(this.timeline.bars, q);
    if (idx !== this.lastBarIndex) {
      this.lastBarIndex = idx;
      this.barChange.emit(idx);
    }
    this.rafId = requestAnimationFrame(this.tick);
  };

  private setStatus(status: TransportStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.statusChange.emit(status);
  }
}
