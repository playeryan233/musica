import type {
  MetronomeAudio,
  MetronomePattern,
  MetronomeSettings,
  Playhead,
  ScheduledClick,
} from './types';
import { clickKindAtStep, stepCount, stepSeconds } from './pattern';

export interface MetronomeEngineOptions {
  /** How far ahead clicks are scheduled, in seconds. */
  lookAheadSeconds?: number;
  /** How often the scheduler wakes up, in milliseconds. */
  checkIntervalMs?: number;
  /** Extra delay before the first click so the audio clock is ready. */
  startLeadSeconds?: number;
  /** Clicks later than this are skipped instead of played off-grid. */
  lateToleranceSeconds?: number;
}

const DEFAULT_OPTIONS: Required<MetronomeEngineOptions> = {
  lookAheadSeconds: 0.1,
  checkIntervalMs: 25,
  startLeadSeconds: 0.05,
  lateToleranceSeconds: 0.005,
};

/**
 * Looping metronome scheduler. It owns the playhead mapping (audio time ->
 * musical step) and a look-ahead click queue; it knows nothing about React,
 * the DOM or the score viewer, and the audio layer is injected.
 */
export class MetronomeEngine {
  private settings: MetronomeSettings;
  private readonly options: Required<MetronomeEngineOptions>;
  private playing = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private session = 0;
  private anchorAudio = 0;
  private anchorStep = 0;
  private nextStep = 0;
  private stepSecondsValue = 0.5;
  private loopSteps = 1;
  private scheduled = new Map<number, ScheduledClick>();
  /**
   * A pattern change that waits until the new pattern is still outside the
   * visible staff (a loop boundary far enough ahead). When those notes reach
   * the beat line the audio switches, so the user never sees the current view
   * change.
   */
  private pending: { settings: MetronomeSettings; atStep: number; lcm: number } | null = null;
  /** How many steps ahead must stay untouched (the visible window). */
  private deferSteps = 0;

  constructor(
    private audio: MetronomeAudio,
    settings: MetronomeSettings,
    options: MetronomeEngineOptions = {},
  ) {
    this.settings = settings;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.audio.setVolume(settings.volume);
    this.audio.setTimbre(settings.timbre);
    this.applyTempo();
  }

  get currentSettings(): MetronomeSettings {
    return this.settings;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  /** Total length of one loop, in seconds. */
  get loopDurationSeconds(): number {
    return this.loopSteps * this.stepSecondsValue;
  }

  async start(settings: MetronomeSettings = this.settings): Promise<void> {
    this.setSettings(settings);
    if (this.playing) return;

    const session = ++this.session;
    await this.audio.ensureRunning();
    if (session !== this.session) return; // stopped or superseded while resuming

    this.playing = true;
    this.nextStep = 0;
    this.anchorStep = 0;
    this.anchorAudio = this.audio.now() + this.options.startLeadSeconds;
    this.applyTempo();
    this.startTimer();
    this.check();
  }

  stop(): void {
    this.session++;
    this.playing = false;
    this.pending = null;
    this.clearTimer();
    this.cancelAll();
    this.nextStep = 0;
  }

  dispose(): void {
    this.stop();
  }

  /**
   * Apply new settings without interrupting playback when possible:
   * - volume changes only touch the master gain;
   * - accent/skip edits are picked up by the next scheduled click;
   * - BPM changes take effect from the next not-yet-sounded step;
   * - pattern changes (time signature, bars, subdivision, beat unit) are held
   *   back until the next loop start, so the staff can scroll the new pattern
   *   in at a musical boundary instead of being replaced mid-phrase.
   */
  setSettings(next: MetronomeSettings): void {
    const prev = this.settings;

    if (next.volume !== prev.volume) this.audio.setVolume(next.volume);
    // A new timbre only affects clicks scheduled from now on; already queued
    // clicks keep their recipe, which is at most one look-ahead window of lag.
    if (next.timbre !== prev.timbre) this.audio.setTimbre(next.timbre);

    if (!this.playing) {
      this.settings = next;
      this.pending = null;
      this.applyTempo();
      return;
    }

    const patternChanged = !samePattern(next.pattern, prev.pattern);
    if (!patternChanged) {
      // The draft now matches what is playing (e.g. the user reverted an
      // edit), so any queued transition is obsolete.
      this.settings = next;
      this.pending = null;
      if (next.bpm !== prev.bpm) this.reanchor(next.bpm);
      return;
    }

    // Queue the pattern for a boundary that is still off screen. Never move an
    // existing transition earlier: edits made while it is pending are folded
    // into the same off-screen hand-over.
    const oldLoop = this.loopSteps;
    const newLoop = Math.max(1, stepCount(next.pattern));
    const lcm = Math.round((oldLoop * newLoop) / gcd(oldLoop, newLoop));
    const position = this.getPosition() ?? 0;
    const candidate = this.alignTransition(position + this.deferSteps + 2, lcm);
    const atStep =
      this.pending && this.pending.atStep >= candidate
        ? this.alignTransition(this.pending.atStep, lcm)
        : candidate;
    this.pending = { settings: next, atStep, lcm };

    // Keep the running pattern; only the pattern-independent fields change now.
    this.settings = {
      ...this.settings,
      bpm: next.bpm,
      volume: next.volume,
      timbre: next.timbre,
      noteSpeed: next.noteSpeed,
    };
    if (next.bpm !== prev.bpm) this.reanchor(next.bpm);
  }

  /** Tell the engine how many upcoming steps are visible on screen. */
  setDeferSteps(steps: number): void {
    this.deferSteps = Math.max(0, Math.round(steps));
    if (!this.playing || !this.pending) return;
    const position = this.getPosition() ?? 0;
    const next = this.alignTransition(position + this.deferSteps + 2, this.pending.lcm);
    if (next > this.pending.atStep) this.pending.atStep = next;
  }

  /** The queued pattern and the step at which it takes over, if any. */
  getPending(): { settings: MetronomeSettings; atStep: number } | null {
    return this.pending;
  }

  private alignTransition(minStep: number, lcm: number): number {
    const step = Math.max(1, Math.ceil(minStep), this.nextStep + 1);
    return Math.ceil(step / lcm) * lcm;
  }

  /** Re-anchor at the next unscheduled step, keeping the music position. */
  private reanchor(bpm: number): void {
    const now = this.audio.now();
    const boundary = this.rewindToFuture(now);
    const boundaryTime = this.timeOfStep(boundary);

    this.nextStep = boundary;
    this.anchorStep = boundary;
    this.anchorAudio = boundaryTime;
    this.stepSecondsValue = stepSeconds(bpm, this.settings.pattern);
    this.check();
  }

  /** Where the playhead is right now, or null while stopped. */
  getPlayhead(now: number = this.audio.now()): Playhead | null {
    if (!this.playing) return null;

    const elapsed = now - this.anchorAudio;
    const step =
      elapsed < 0
        ? this.anchorStep
        : this.anchorStep + Math.floor(elapsed / this.stepSecondsValue + 1e-9);
    const loopStep = ((step % this.loopSteps) + this.loopSteps) % this.loopSteps;
    const { beatsPerBar, subdivision, beats } = this.settings.pattern;
    const beatIndex = Math.floor(loopStep / subdivision);
    const beat = beatIndex % beatsPerBar;
    const bar = Math.floor(beatIndex / beatsPerBar);
    const subdivisionIndex = loopStep % subdivision;
    const beatState = beats[beatIndex] ?? 'normal';

    return {
      step,
      loopStep,
      bar,
      beat,
      subdivisionIndex,
      state: subdivisionIndex > 0 && beatState !== 'skip' ? 'sub' : beatState,
    };
  }

  /**
   * Fractional absolute step at the given time, for smooth visual tracking.
   * Step 0 is the first click; the value is negative during the start lead-in.
   * Null while stopped.
   */
  getPosition(now: number = this.audio.now()): number | null {
    if (!this.playing) return null;
    return this.anchorStep + (now - this.anchorAudio) / this.stepSecondsValue;
  }

  private applyTempo(): void {
    this.stepSecondsValue = stepSeconds(this.settings.bpm, this.settings.pattern);
    this.loopSteps = Math.max(1, stepCount(this.settings.pattern));
  }

  private timeOfStep(step: number): number {
    return this.anchorAudio + (step - this.anchorStep) * this.stepSecondsValue;
  }

  private startTimer(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(this.check, this.options.checkIntervalMs);
  }

  private clearTimer(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private check = (): void => {
    if (!this.playing) return;

    const now = this.audio.now();
    const horizon = now + this.options.lookAheadSeconds;

    // Bounded loop: even at 300 BPM with 4 subdivisions this schedules at most
    // a handful of clicks per wake-up.
    for (let guard = 0; guard < 1024; guard++) {
      // The pending pattern takes over exactly at its precomputed step, before
      // that step is scheduled. The new pattern is already visible off screen.
      if (this.pending && this.nextStep >= this.pending.atStep) {
        this.applyPending();
      }

      const at = this.timeOfStep(this.nextStep);
      if (at > horizon) return;

      if (at < now - this.options.lateToleranceSeconds) {
        // The main thread was busy; drop the beat instead of catching up.
        this.nextStep++;
        continue;
      }

      this.scheduleStep(this.nextStep, at);
      this.nextStep++;
    }
  };

  private applyPending(): void {
    const pending = this.pending;
    if (!pending) return;
    // Keep the absolute step numbering: the transition is a multiple of both
    // loops, so the new pattern starts on its own step 0 without resetting the
    // staff coordinates. Re-anchor the clock at the transition time so the new
    // step duration takes over without a jump.
    const at = this.timeOfStep(pending.atStep);
    this.pending = null;
    this.settings = pending.settings;
    this.applyTempo();
    this.anchorAudio = at;
    this.anchorStep = pending.atStep;
    this.nextStep = pending.atStep;
  }

  private scheduleStep(step: number, at: number): void {
    const loopStep = ((step % this.loopSteps) + this.loopSteps) % this.loopSteps;
    const kind = clickKindAtStep(this.settings.pattern, loopStep);
    if (!kind) return; // skipped beat: the playhead still advances

    const click = this.audio.play(at, kind);
    if (!click) return;

    this.scheduled.set(step, click);
    click.onEnd(() => {
      if (this.scheduled.get(step) === click) this.scheduled.delete(step);
    });
  }

  /** Cancel every future click and return the earliest step that was rewound. */
  private rewindToFuture(now: number): number {
    let boundary = this.nextStep;
    for (const [step, click] of this.scheduled) {
      if (click.at > now + 0.0005) {
        click.cancel();
        this.scheduled.delete(step);
        if (step < boundary) boundary = step;
      }
    }
    return boundary;
  }

  private cancelAll(): void {
    for (const click of [...this.scheduled.values()]) click.cancel();
    this.scheduled.clear();
  }

}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x || 1;
}

function samePattern(a: MetronomePattern, b: MetronomePattern): boolean {
  if (
    a.beatsPerBar !== b.beatsPerBar ||
    a.beatUnit !== b.beatUnit ||
    a.bars !== b.bars ||
    a.subdivision !== b.subdivision ||
    a.beats.length !== b.beats.length
  ) {
    return false;
  }
  return a.beats.every((state, index) => state === b.beats[index]);
}
