import { useEffect, useState } from 'react';
import { usePractice } from './PracticeProvider';
import { BPM_MAX, BPM_MIN } from './types';

function BpmInput({ onChange }: { onChange: (bpm: number) => void }) {
  const { state } = usePractice();
  const [text, setText] = useState(String(state.bpm));

  useEffect(() => {
    setText(String(state.bpm));
  }, [state.bpm]);

  const commit = () => {
    const n = Number(text);
    if (!Number.isFinite(n) || text.trim() === '') {
      setText(String(state.bpm));
      return;
    }
    const clamped = Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(n)));
    onChange(clamped);
    setText(String(clamped));
  };

  return (
    <label className="bpm-control">
      <span className="bpm-symbol" aria-hidden="true">
        ♩
      </span>
      <input
        className="bpm-input"
        type="number"
        min={BPM_MIN}
        max={BPM_MAX}
        step={1}
        value={text}
        inputMode="numeric"
        aria-label="BPM（每分钟四分音符数）"
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
        }}
      />
      <span className="bpm-unit">BPM</span>
    </label>
  );
}

export function PracticeControls({ onBpmChange }: { onBpmChange: (bpm: number) => void }) {
  const { state, togglePlay, stop, setMetronomeEnabled, setMetronomeVolume } = usePractice();

  const ready = state.scoreStatus === 'ready';

  const playLabel =
    state.transportStatus === 'playing'
      ? '暂停'
      : state.transportStatus === 'paused'
        ? '继续'
        : '开始练习';

  return (
    <div className="practice-controls" role="toolbar" aria-label="练习控制">
      <button
        type="button"
        className="btn btn-primary"
        disabled={!ready}
        onClick={togglePlay}
      >
        {playLabel}
      </button>
      <button type="button" className="btn" disabled={!ready} onClick={stop}>
        回到开头
      </button>

      <BpmInput onChange={onBpmChange} />

      <div className="practice-controls-spacer" />

      <label className="toggle">
        <input
          type="checkbox"
          checked={state.metronomeEnabled}
          onChange={(e) => setMetronomeEnabled(e.target.checked)}
        />
        <span>节拍器</span>
      </label>

      <label className="volume-control">
        <span>音量</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={state.metronomeVolume}
          aria-label="节拍器音量"
          disabled={!state.metronomeEnabled}
          onChange={(e) => setMetronomeVolume(Number(e.target.value))}
        />
      </label>
    </div>
  );
}
