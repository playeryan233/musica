/**
 * Owns the single shared AudioContext used both as the unified audio clock and
 * as the metronome output. There must be exactly one per app session; buttons
 * must not each create their own context.
 */
class AudioManager {
  private _ctx: AudioContext | null = null;

  get context(): AudioContext | null {
    return this._ctx;
  }

  /** Monotonic clock in seconds. Matches the AudioContext timeline once created. */
  now(): number {
    return this._ctx ? this._ctx.currentTime : performance.now() / 1000;
  }

  async ensureRunning(): Promise<AudioContext> {
    if (!this._ctx) {
      const Ctor: typeof AudioContext =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this._ctx = new Ctor();
    }
    if (this._ctx.state === 'suspended') {
      await this._ctx.resume();
    }
    return this._ctx;
  }

  async suspend(): Promise<void> {
    if (this._ctx && this._ctx.state === 'running') {
      await this._ctx.suspend();
    }
  }
}

export const audioManager = new AudioManager();
