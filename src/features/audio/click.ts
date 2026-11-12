/**
 * A short synthesized click shared by every metronome in the app. The basic
 * voice is a sine burst with a very short attack and an exponential decay, so
 * the waveform is never cut abruptly (which would produce an audible pop).
 * Optional layers turn it into other timbres: an inharmonic partial, a low-pass
 * filter, or a band-passed noise burst.
 *
 * The caller owns the destination node (usually a master gain) and decides when
 * the voice is cancelled.
 */
export interface ClickVoiceSpec {
  frequency: number;
  peakGain: number;
  durationSeconds: number;
  attackSeconds?: number;
  /** Waveform of the tonal layer; defaults to sine. */
  waveform?: OscillatorType;
  /** Second, inharmonic oscillator for wooden / metallic timbres. */
  partial?: { ratio: number; gain: number; waveform?: OscillatorType };
  /** Low-pass cutoff for the tonal layer; tames square waves. */
  lowpassHz?: number;
  /** Band-passed noise burst mixed under the tonal layer (shaker, tick). */
  noise?: { filterHz: number; q?: number; gain: number };
}

export interface ClickVoice {
  /** Audio-clock time the click was scheduled at. */
  readonly at: number;
  /** Register a one-shot listener fired when the voice ends or is cancelled. */
  onEnded(listener: () => void): void;
  /** Fade out, stop and disconnect immediately. Safe to call twice. */
  cancel(now: number): void;
  /** Disconnect without touching the scheduled envelope. Safe to call twice. */
  dispose(): void;
}

const SILENCE = 0.0001;
const CANCEL_FADE_SECONDS = 0.005;
const NOISE_SECONDS = 0.25;

/** One white-noise buffer per AudioContext, reused by every noise click. */
const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const cached = noiseBuffers.get(ctx);
  if (cached) return cached;
  const length = Math.ceil(ctx.sampleRate * NOISE_SECONDS);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffers.set(ctx, buffer);
  return buffer;
}

export function createClickVoice(
  ctx: BaseAudioContext,
  destination: AudioNode,
  at: number,
  spec: ClickVoiceSpec,
): ClickVoice {
  const attack = spec.attackSeconds ?? 0.003;
  const peak = Math.max(SILENCE * 2, spec.peakGain);
  const end = at + spec.durationSeconds + attack;

  const nodes: AudioNode[] = [];
  const sources: AudioScheduledSourceNode[] = [];

  // Shared amplitude envelope: every layer fades out together.
  const env = ctx.createGain();
  env.gain.setValueAtTime(SILENCE, at);
  env.gain.exponentialRampToValueAtTime(peak, at + attack);
  env.gain.exponentialRampToValueAtTime(SILENCE, at + spec.durationSeconds);
  env.connect(destination);
  nodes.push(env);

  let toneTarget: AudioNode = env;
  if (spec.lowpassHz !== undefined) {
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = spec.lowpassHz;
    lowpass.Q.value = 0.7;
    lowpass.connect(env);
    nodes.push(lowpass);
    toneTarget = lowpass;
  }

  const addTone = (
    frequency: number,
    waveform: OscillatorType,
    gainValue: number,
  ): OscillatorNode => {
    const osc = ctx.createOscillator();
    osc.type = waveform;
    osc.frequency.value = frequency;
    if (gainValue === 1) {
      osc.connect(toneTarget);
    } else {
      const gain = ctx.createGain();
      gain.gain.value = gainValue;
      osc.connect(gain);
      gain.connect(toneTarget);
      nodes.push(gain);
    }
    osc.start(at);
    osc.stop(end);
    nodes.push(osc);
    sources.push(osc);
    return osc;
  };

  const main = addTone(spec.frequency, spec.waveform ?? 'sine', 1);
  if (spec.partial) {
    addTone(
      spec.frequency * spec.partial.ratio,
      spec.partial.waveform ?? spec.waveform ?? 'sine',
      spec.partial.gain,
    );
  }

  if (spec.noise) {
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(ctx);
    source.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = spec.noise.filterHz;
    band.Q.value = spec.noise.q ?? 1;
    const gain = ctx.createGain();
    gain.gain.value = spec.noise.gain;
    source.connect(band);
    band.connect(gain);
    gain.connect(env);
    source.start(at);
    source.stop(end);
    nodes.push(source, band, gain);
    sources.push(source);
  }

  let ended = false;
  let listener: (() => void) | null = null;

  const finish = () => {
    if (ended) return;
    ended = true;
    for (const node of nodes) {
      try {
        node.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    listener?.();
  };

  // The main oscillator always ends with the voice; use it as the end signal.
  main.onended = finish;

  return {
    at,
    onEnded(next) {
      if (ended) next();
      else listener = next;
    },
    cancel(now) {
      if (ended) return;
      try {
        env.gain.cancelScheduledValues(now);
        env.gain.setValueAtTime(SILENCE, now);
      } catch {
        /* ignore */
      }
      for (const source of sources) {
        try {
          source.stop(now + CANCEL_FADE_SECONDS);
        } catch {
          /* already stopped */
        }
      }
      finish();
    },
    dispose: finish,
  };
}
