import { createClickVoice, type ClickVoice } from '../audio/click';
import { DEFAULT_TIMBRE, specFor, type TimbreId } from '../audio/timbres';
import { audioManager } from '../audio/audioManager';
import type { ClickKind, MetronomeAudio, ScheduledClick } from './types';

/**
 * The Web Audio implementation of the metronome's audio boundary. All
 * metronome instances share the app's single AudioContext (and therefore a
 * single clock); only the master gain belongs to this output.
 */
export class WebAudioMetronomeOutput implements MetronomeAudio {
  private master: GainNode | null = null;
  private volume = 0.5;
  private timbre: TimbreId = DEFAULT_TIMBRE;
  private voices = new Set<ClickVoice>();

  now(): number {
    return audioManager.now();
  }

  async ensureRunning(): Promise<void> {
    const ctx = await audioManager.ensureRunning();
    if (!this.master) {
      this.master = ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(ctx.destination);
    }
  }

  play(at: number, kind: ClickKind): ScheduledClick | null {
    const ctx = audioManager.context;
    const master = this.master;
    if (!ctx || !master) return null;

    const voice = createClickVoice(ctx, master, at, specFor(this.timbre, kind));
    this.voices.add(voice);

    let ended = false;
    let endListener: (() => void) | null = null;
    voice.onEnded(() => {
      ended = true;
      this.voices.delete(voice);
      endListener?.();
    });

    return {
      at,
      cancel: () => {
        this.voices.delete(voice);
        voice.cancel(audioManager.now());
      },
      onEnd: (listener) => {
        // The voice is very short; cover the case where it already ended.
        if (ended) listener();
        else endListener = listener;
      },
    };
  }

  setVolume(volume: number): void {
    this.volume = volume;
    const ctx = audioManager.context;
    if (!this.master || !ctx) return;
    this.master.gain.cancelScheduledValues(ctx.currentTime);
    this.master.gain.setTargetAtTime(volume, ctx.currentTime, 0.01);
  }

  /**
   * Clicks already handed to the audio thread cannot change, so a new timbre
   * applies from the next scheduled click (at most one look-ahead window away).
   */
  setTimbre(timbre: TimbreId): void {
    this.timbre = timbre;
  }

  dispose(): void {
    const now = audioManager.now();
    for (const voice of [...this.voices]) voice.cancel(now);
    this.voices.clear();
  }
}
