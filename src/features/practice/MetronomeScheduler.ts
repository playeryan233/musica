import { createClickVoice, type ClickVoice } from '../audio/click';
import { specFor } from '../audio/timbres';
import { audioManager } from '../audio/audioManager';
import { audioTimeFromAnchor } from './time';
import type { PracticeClick, TransportAnchor } from './types';

const LOOKAHEAD_SECONDS = 0.1;
const SCHEDULE_INTERVAL_MS = 25;
const LATE_TOLERANCE_SECONDS = 0.005;

/**
 * Schedules short synthesized metronome clicks on a shared AudioContext using a
 * look-ahead scheduler. It never plays a "this very instant" click from a timer
 * callback; it only schedules clicks slightly into the future.
 */
export class MetronomeScheduler {
  private clicks: PracticeClick[] = [];
  private anchor: TransportAnchor | null = null;
  private nextIndex = 0;
  private masterGain: GainNode | null = null;
  private volume = 0.3;
  private timer: ReturnType<typeof setInterval> | null = null;
  private session = 0;
  private scheduled = new Map<number, ClickVoice>();

  setClicks(clicks: PracticeClick[]): void {
    this.clicks = clicks;
  }

  setVolume(volume: number): void {
    this.volume = volume;
    if (this.masterGain && audioManager.context) {
      const now = audioManager.context.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(volume, now, 0.01);
    }
  }

  async start(anchor: TransportAnchor, fromIndex: number): Promise<void> {
    this.session++;
    await audioManager.ensureRunning();
    const ctx = audioManager.context;
    if (!ctx) return;
    if (!this.masterGain) {
      this.masterGain = ctx.createGain();
      this.masterGain.gain.value = this.volume;
      this.masterGain.connect(ctx.destination);
    }
    this.anchor = anchor;
    this.nextIndex = fromIndex;
    this.startLoop();
  }

  /** Re-anchor after a BPM change while playing; cancels future clicks only. */
  reschedule(anchor: TransportAnchor, fromIndex: number): void {
    this.cancelAllNodes();
    this.anchor = anchor;
    this.nextIndex = fromIndex;
  }

  stop(): void {
    this.session++;
    this.anchor = null;
    this.nextIndex = 0;
    this.clearTimer();
    this.cancelAllNodes();
  }

  private startLoop(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => this.check(), SCHEDULE_INTERVAL_MS);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private check(): void {
    if (!this.anchor) return;
    const ctx = audioManager.context;
    if (!ctx) return;
    const now = ctx.currentTime;
    const horizon = now + LOOKAHEAD_SECONDS;

    while (this.nextIndex < this.clicks.length) {
      const click = this.clicks[this.nextIndex];
      const at = audioTimeFromAnchor(this.anchor, click.quarter);
      if (at > horizon) break;
      if (at < now - LATE_TOLERANCE_SECONDS) {
        // Arrived too late; skip without catching up.
        this.nextIndex++;
        continue;
      }
      this.scheduleClick(click, at, this.nextIndex);
      this.nextIndex++;
    }
  }

  private scheduleClick(click: PracticeClick, at: number, index: number): void {
    const ctx = audioManager.context;
    if (!ctx || !this.masterGain) return;

    const session = this.session;
    // The practice metronome uses the shared "beep" recipe: same click voice as
    // the standalone metronome's default, so both never drift apart.
    const voice = createClickVoice(ctx, this.masterGain, at, specFor('beep', click.accent ? 'accent' : 'normal'));
    this.scheduled.set(index, voice);
    voice.onEnded(() => {
      if (session === this.session) this.scheduled.delete(index);
    });
  }

  private cancelAllNodes(): void {
    const ctx = audioManager.context;
    const now = ctx ? ctx.currentTime : 0;
    for (const voice of [...this.scheduled.values()]) voice.cancel(now);
    this.scheduled.clear();
  }
}
