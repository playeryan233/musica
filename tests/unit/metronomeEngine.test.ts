import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TimbreId } from '../../src/features/audio/timbres';
import { MetronomeEngine } from '../../src/features/metronome/MetronomeEngine';
import { createDefaultSettings, createPattern, setBeat } from '../../src/features/metronome/pattern';
import type {
  ClickKind,
  MetronomeAudio,
  ScheduledClick,
} from '../../src/features/metronome/types';

interface FakeClick extends ScheduledClick {
  kind: ClickKind;
  canceled: boolean;
}

class FakeAudio implements MetronomeAudio {
  nowValue = 0;
  volume = -1;
  timbre: TimbreId | null = null;
  readonly clicks: FakeClick[] = [];

  now(): number {
    return this.nowValue;
  }

  async ensureRunning(): Promise<void> {
    /* already allowed */
  }

  play(at: number, kind: ClickKind): ScheduledClick {
    const click: FakeClick = {
      at,
      kind,
      canceled: false,
      cancel: () => {
        click.canceled = true;
      },
      onEnd: () => {
        /* the scheduler cleans up through cancel/stop in these tests */
      },
    };
    this.clicks.push(click);
    return click;
  }

  setVolume(volume: number): void {
    this.volume = volume;
  }

  setTimbre(timbre: TimbreId): void {
    this.timbre = timbre;
  }

  sounded(): FakeClick[] {
    return this.clicks.filter((click) => !click.canceled);
  }

  times(): number[] {
    return this.sounded().map((click) => Number(click.at.toFixed(3)));
  }

  kinds(): ClickKind[] {
    return this.sounded().map((click) => click.kind);
  }
}

/** Move the fake audio clock and the fake interval timers together. */
function advance(audio: FakeAudio, ms: number, stepMs = 25): void {
  for (let elapsed = 0; elapsed < ms; elapsed += stepMs) {
    audio.nowValue += stepMs / 1000;
    vi.advanceTimersByTime(stepMs);
  }
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('MetronomeEngine', () => {
  it('loops the default 4/4 at 80 BPM with an accent on beat 1', async () => {
    const audio = new FakeAudio();
    const engine = new MetronomeEngine(audio, createDefaultSettings());

    await engine.start();
    expect(engine.isPlaying).toBe(true);
    expect(audio.times()).toEqual([0.05]);

    advance(audio, 3100);
    // 0.75 s per beat, so the loop of 4 beats comes back to the accent at 3.05 s.
    expect(audio.times()).toEqual([0.05, 0.8, 1.55, 2.3, 3.05]);
    expect(audio.kinds()).toEqual(['accent', 'normal', 'normal', 'normal', 'accent']);
  });

  it('does not schedule clicks for skipped beats but keeps the playhead moving', async () => {
    const audio = new FakeAudio();
    const settings = createDefaultSettings();
    settings.pattern = setBeat(settings.pattern, 1, 'skip');

    const engine = new MetronomeEngine(audio, settings);
    await engine.start();
    advance(audio, 2300);

    expect(audio.times()).toEqual([0.05, 1.55, 2.3]);
    expect(audio.kinds()).toEqual(['accent', 'normal', 'normal']);
    expect(engine.getPlayhead()?.beat).toBe(3);
  });

  it('adds subdivisions at one half / third / quarter of a beat', async () => {
    const audio = new FakeAudio();
    const settings = createDefaultSettings();
    settings.pattern = createPattern(4, 4, 1, 2);

    const engine = new MetronomeEngine(audio, settings);
    await engine.start();
    advance(audio, 1000);

    expect(audio.times()).toEqual([0.05, 0.425, 0.8]);
    expect(audio.kinds()).toEqual(['accent', 'sub', 'normal']);
  });

  it('derives the playhead from the audio clock, not from render counts', async () => {
    const audio = new FakeAudio();
    const engine = new MetronomeEngine(audio, createDefaultSettings());
    await engine.start();

    expect(engine.getPlayhead()?.beat).toBe(0);

    audio.nowValue = 0.85;
    const playhead = engine.getPlayhead();
    expect(playhead?.step).toBe(1);
    expect(playhead?.bar).toBe(0);
    expect(playhead?.beat).toBe(1);

    // 3.9 s is step 5 of the loop, i.e. beat 2 of bar 1 (left-closed windows).
    audio.nowValue = 3.9;
    expect(engine.getPlayhead()?.loopStep).toBe(1);
    expect(engine.getPlayhead()?.bar).toBe(0);
    expect(engine.getPlayhead()?.beat).toBe(1);
  });

  it('reports a fractional position for smooth visual tracking', async () => {
    const audio = new FakeAudio();
    const engine = new MetronomeEngine(audio, createDefaultSettings());
    await engine.start();

    // The start lead-in is 50 ms; a beat lasts 0.75 s at 80 BPM and 4/4.
    expect(engine.getPosition()).toBeCloseTo(-0.05 / 0.75, 6);
    audio.nowValue = 0.425; // halfway through the first beat
    expect(engine.getPosition()).toBeCloseTo(0.5, 6);
    audio.nowValue = 0.8;
    expect(engine.getPosition()).toBeCloseTo(1, 6);

    engine.stop();
    expect(engine.getPosition()).toBeNull();
  });

  it('applies a BPM change from the next step without dropping the beat', async () => {
    const audio = new FakeAudio();
    const engine = new MetronomeEngine(audio, createDefaultSettings());
    await engine.start();
    advance(audio, 1000);
    expect(audio.times()).toEqual([0.05, 0.8]);

    engine.setSettings({ ...createDefaultSettings(), bpm: 120 });
    advance(audio, 1100);

    // Step 2 keeps its old time (1.55 s); following steps use 0.5 s per beat.
    expect(audio.times()).toEqual([0.05, 0.8, 1.55, 2.05]);
    expect(audio.kinds()).toEqual(['accent', 'normal', 'normal', 'normal']);
  });

  it('queues accent edits for the off-screen transition', async () => {
    const audio = new FakeAudio();
    const settings = createDefaultSettings();
    const engine = new MetronomeEngine(audio, settings);
    await engine.start();
    advance(audio, 1000);

    const edited = { ...settings, pattern: setBeat(settings.pattern, 2, 'accent') };
    engine.setSettings(edited);

    // 4/4 -> 4/4: the transition is the next loop at step 4, still ahead.
    expect(engine.getPending()?.atStep).toBe(4);
    advance(audio, 600); // 1.6 s; beat 3 at 1.55 s still uses the old pattern
    const click = audio.sounded().find((c) => Math.abs(c.at - 1.55) < 1e-6);
    expect(click?.kind).toBe('normal');

    advance(audio, 3000); // past the 3.05 s hand-over
    expect(engine.getPending()).toBeNull();
    expect(engine.currentSettings.pattern.beats[2]).toBe('accent');
    const after = audio.sounded().find((c) => Math.abs(c.at - 4.55) < 1e-6);
    expect(after?.kind).toBe('accent');
  });

  it('cancels a queued pattern when the draft reverts to the running one', async () => {
    const audio = new FakeAudio();
    const settings = createDefaultSettings();
    const engine = new MetronomeEngine(audio, settings);
    await engine.start();
    advance(audio, 1000);

    engine.setSettings({ ...settings, pattern: setBeat(settings.pattern, 2, 'accent') });
    expect(engine.getPending()).not.toBeNull();

    engine.setSettings(settings);
    expect(engine.getPending()).toBeNull();
    expect(engine.currentSettings.pattern.beats[2]).toBe('normal');
  });

  it('pushes the transition beyond the reported visible steps', async () => {
    const audio = new FakeAudio();
    const engine = new MetronomeEngine(audio, createDefaultSettings());
    await engine.start();
    advance(audio, 1000);

    engine.setDeferSteps(10);
    engine.setSettings({ ...createDefaultSettings(), pattern: createPattern(3, 4) });
    // lcm(4, 3) = 12; position + 10 + 2 rounds up to 24.
    expect(engine.getPending()?.atStep).toBe(24);
    engine.setDeferSteps(20);
    expect(engine.getPending()?.atStep).toBe(24);
    engine.setDeferSteps(30);
    expect(engine.getPending()?.atStep).toBe(36);
  });

  it('moves a time-signature change to an off-screen common boundary', async () => {
    const audio = new FakeAudio();
    const settings = createDefaultSettings();
    const engine = new MetronomeEngine(audio, settings);
    await engine.start();
    advance(audio, 1000);

    engine.setSettings({ ...settings, pattern: createPattern(3, 4) });
    // lcm(4, 3) = 12, i.e. the hand-over happens at 9.05 s and the new 3/4
    // loop starts there without resetting the step numbering.
    expect(engine.getPending()?.atStep).toBe(12);
    expect(engine.currentSettings.pattern.beatsPerBar).toBe(4);

    advance(audio, 8100);
    expect(engine.currentSettings.pattern.beatsPerBar).toBe(3);
    expect(engine.getPending()).toBeNull();
    // Exactly one click lands on the hand-over beat.
    expect(audio.times().filter((time) => Math.abs(time - 9.05) < 1e-6)).toHaveLength(1);
    expect(engine.getPlayhead()?.step).toBe(12);
  });

  it('applies a structural change immediately while stopped', () => {
    const audio = new FakeAudio();
    const engine = new MetronomeEngine(audio, createDefaultSettings());
    engine.setSettings({ ...createDefaultSettings(), pattern: createPattern(3, 4) });
    expect(engine.currentSettings.pattern.beatsPerBar).toBe(3);
  });

  it('stops scheduling and reports no playhead after stop()', async () => {
    const audio = new FakeAudio();
    const engine = new MetronomeEngine(audio, createDefaultSettings());
    await engine.start();
    advance(audio, 1000);

    engine.stop();
    const countAfterStop = audio.clicks.length;
    advance(audio, 2000);

    expect(engine.isPlaying).toBe(false);
    expect(engine.getPlayhead()).toBeNull();
    expect(audio.clicks.length).toBe(countAfterStop);
  });

  it('drops clicks that arrive too late instead of replaying them', async () => {
    const audio = new FakeAudio();
    const engine = new MetronomeEngine(audio, createDefaultSettings());
    await engine.start();
    const before = audio.clicks.length;

    // Jump the clock forward without running the interval callbacks: everything
    // before now is late and must be skipped, not scheduled in a burst.
    audio.nowValue = 5;
    vi.advanceTimersByTime(25);
    expect(audio.clicks.length).toBe(before);

    // The scheduler resumes with the next click after the current time.
    advance(audio, 200);
    const scheduledAfterJump = audio.times().filter((time) => time >= 4.995);
    expect(scheduledAfterJump[0]).toBeGreaterThanOrEqual(5);
  });

  it('forwards the selected timbre to the audio layer', () => {
    const audio = new FakeAudio();
    const settings = createDefaultSettings();
    settings.timbre = 'woodblock';
    const engine = new MetronomeEngine(audio, settings);
    expect(audio.timbre).toBe('woodblock');

    // Changing timbre must not restart the loop or drop queued clicks.
    engine.setSettings({ ...settings, timbre: 'cowbell' });
    expect(audio.timbre).toBe('cowbell');
  });
});
