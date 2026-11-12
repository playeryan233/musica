import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { TIMBRE_IDS, TIMBRE_LABELS } from '../features/audio/timbres';
import { PatternEditor } from '../features/metronome/PatternEditor';
import { ScrollPicker, type PickerOption } from '../features/metronome/ScrollPicker';
import { StaffStage } from '../features/metronome/StaffStage';
import { useMetronome } from '../features/metronome/useMetronome';
import {
  BARS_MAX,
  BARS_MIN,
  BEATS_PER_BAR_MAX,
  BEATS_PER_BAR_MIN,
  BEAT_UNITS,
  BEAT_UNIT_LABELS,
  BEAT_UNIT_SYMBOLS,
  BPM_MAX,
  BPM_MIN,
  NOTE_SPEED_SCALE,
  SUBDIVISIONS,
  type BeatUnit,
  type NoteSpeed,
  type Subdivision,
} from '../features/metronome/types';

function range(min: number, max: number): number[] {
  return Array.from({ length: max - min + 1 }, (_, i) => min + i);
}

const BEAT_COUNT_OPTIONS = range(BEATS_PER_BAR_MIN, BEATS_PER_BAR_MAX).map((value) => ({
  value,
  label: String(value),
}));

const BEAT_UNIT_OPTIONS = BEAT_UNITS.map((value) => ({ value, label: String(value) }));

const BAR_OPTIONS = range(BARS_MIN, BARS_MAX).map((value) => ({ value, label: String(value) }));

const NOTE_VALUE_SHORT: Record<number, string> = {
  2: '二分',
  4: '四分',
  8: '八分',
  16: '十六分',
  32: '三十二分',
  64: '六十四分',
};

/** The note value produced by splitting one beat into `subdivision` parts. */
function subdivisionLabel(beatUnit: BeatUnit, subdivision: Subdivision): string {
  if (subdivision === 3) return '三连音';
  return NOTE_VALUE_SHORT[beatUnit * subdivision] ?? `${beatUnit * subdivision}分`;
}

const TIMBRE_OPTIONS = TIMBRE_IDS.map((value) => ({ value, label: TIMBRE_LABELS[value] }));

const NOTE_SPEED_OPTIONS: PickerOption<NoteSpeed>[] = [
  { value: 'slow', label: '慢' },
  { value: 'normal', label: '标准' },
  { value: 'fast', label: '快' },
  { value: 'fastest', label: '极快' },
];

function PlayIcon({ playing }: { playing: boolean }) {
  return playing ? (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
      <rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
      <path d="M8 5.2v13.6L19 12z" fill="currentColor" />
    </svg>
  );
}

function BpmField({ bpm, onChange }: { bpm: number; onChange: (bpm: number) => void }) {
  const [text, setText] = useState(String(bpm));

  useEffect(() => {
    setText(String(bpm));
  }, [bpm]);

  const commit = () => {
    const value = Number(text);
    if (text.trim() === '' || !Number.isFinite(value)) {
      setText(String(bpm));
      return;
    }
    const clamped = Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(value)));
    onChange(clamped);
    setText(String(clamped));
  };

  return (
    <div className="bpm-display">
      <input
        className="bpm-number"
        type="number"
        min={BPM_MIN}
        max={BPM_MAX}
        step={1}
        inputMode="numeric"
        aria-label="BPM（每分钟拍数）"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
        }}
      />
      <span className="bpm-caption">BPM</span>
    </div>
  );
}

export function MetronomePage() {
  const {
    settings,
    appliedSettings,
    pending,
    pendingPattern,
    pendingAtStep,
    setVisibleSteps,
    playing,
    playhead,
    getPosition,
    toggle,
    setBpm,
    setVolume,
    setTimbre,
    setNoteSpeed,
    setBeatsPerBar,
    setBeatUnit,
    setBars,
    setSubdivision,
    cycleBeat,
    setBarState,
    resetBar,
    tap,
  } = useMetronome();

  const pattern = settings.pattern;
  const appliedPattern = appliedSettings.pattern;
  const subdivisionOptions: PickerOption<Subdivision>[] = SUBDIVISIONS.map((value) => ({
    value,
    label: subdivisionLabel(pattern.beatUnit, value),
  }));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'SELECT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'BUTTON' ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  const summary = `${BEAT_UNIT_SYMBOLS[pattern.beatUnit]} = ${settings.bpm} · ${
    pattern.beatsPerBar
  }/${pattern.beatUnit} · 每拍 ${subdivisionLabel(pattern.beatUnit, pattern.subdivision)}`;

  const statusText = !playing
    ? '未开始'
    : playhead
      ? `第 ${playhead.bar + 1} 小节 · 第 ${playhead.beat + 1} 拍`
      : '准备中…';

  const fill = ((settings.bpm - BPM_MIN) / (BPM_MAX - BPM_MIN)) * 100;

  return (
    <main className="metronome-page">
      <header className="songs-topbar">
        <Link className="brand" to="/">
          Musica
        </Link>
        <nav className="songs-topbar-links">
          <Link to="/">首页</Link>
          <Link to="/songs">歌曲</Link>
          <Link to="/metronome" aria-current="page">
            节拍器
          </Link>
        </nav>
      </header>

      <div className="metronome-content">
        <section className="metronome-intro">
          <span className="metro-eyebrow">Metronome · 练习工具</span>
          <h1>独立节拍器</h1>
          <p className="muted">
            音符滑向节拍线，抵达时只有符头亮起并迸出粒子；重音不闪烁。速度、拍号、时值与音色在下方滚动切换。
          </p>
        </section>

        <StaffStage
          pattern={appliedPattern}
          pendingPattern={pendingPattern}
          pendingAtStep={pendingAtStep}
          playing={playing}
          playhead={playhead}
          getPosition={getPosition}
          noteSpeed={NOTE_SPEED_SCALE[appliedSettings.noteSpeed]}
          onVisibleSteps={setVisibleSteps}
        />

        <section className="metro-dashboard">
          <section className="dash-card dash-tempo" aria-label="速度">
            <div className="dash-head">
              <h2 className="dash-title">速度</h2>
              <span className="signature-chip">
                {pattern.beatsPerBar}/{pattern.beatUnit}
              </span>
            </div>

            <div className="bpm-row">
              <button
                type="button"
                className="step-btn"
                aria-label="降低 1 BPM"
                onClick={() => setBpm(settings.bpm - 1)}
              >
                −
              </button>
              <BpmField bpm={settings.bpm} onChange={setBpm} />
              <button
                type="button"
                className="step-btn"
                aria-label="提高 1 BPM"
                onClick={() => setBpm(settings.bpm + 1)}
              >
                +
              </button>
            </div>

            <div className="bpm-meta">
              <span className="bpm-note">
                {BEAT_UNIT_SYMBOLS[pattern.beatUnit]} = {settings.bpm}
              </span>
              <span className="muted">以{BEAT_UNIT_LABELS[pattern.beatUnit]}为一拍</span>
            </div>

            <input
              type="range"
              className="bpm-range"
              min={BPM_MIN}
              max={BPM_MAX}
              step={1}
              value={settings.bpm}
              aria-label="BPM 滑杆"
              style={{ '--fill': `${fill}%` } as CSSProperties}
              onChange={(e) => setBpm(Number(e.target.value))}
            />

            <div className="tempo-foot">
              <button type="button" className="tap-btn" onClick={tap}>
                <span className="tap-icon" aria-hidden="true">
                  ◎
                </span>
                点击测速
              </button>
              <span className="metronome-hint muted">连续点击自动定速</span>
            </div>
          </section>

          <section className="dash-card dash-signature" aria-label="拍号">
            <h2 className="dash-title">拍号</h2>
            <ScrollPicker
              label="每小节"
              ariaLabel="每小节拍数"
              options={BEAT_COUNT_OPTIONS}
              value={pattern.beatsPerBar}
              unit="拍"
              onChange={setBeatsPerBar}
            />
            <ScrollPicker
              label="单位"
              ariaLabel="拍号单位"
              options={BEAT_UNIT_OPTIONS}
              value={pattern.beatUnit}
              onChange={(value) => setBeatUnit(value as BeatUnit)}
            />
          </section>

          <section className="dash-card dash-rhythm" aria-label="循环与时值">
            <h2 className="dash-title">循环与时值</h2>
            <ScrollPicker
              label="循环"
              ariaLabel="循环小节数"
              options={BAR_OPTIONS}
              value={pattern.bars}
              unit="小节"
              onChange={setBars}
            />
            <ScrollPicker
              label="每拍时值"
              ariaLabel="每拍音符时值"
              options={subdivisionOptions}
              value={pattern.subdivision}
              onChange={(value) => setSubdivision(value as Subdivision)}
            />
          </section>

          <section className="dash-card dash-timbre" aria-label="谱面与音色">
            <h2 className="dash-title">谱面与音色</h2>
            <ScrollPicker
              label="音符速度"
              ariaLabel="音符移动速度"
              options={NOTE_SPEED_OPTIONS}
              value={settings.noteSpeed}
              onChange={setNoteSpeed}
              fit
            />
            <ScrollPicker
              label="点击音"
              ariaLabel="节拍器音色"
              options={TIMBRE_OPTIONS}
              value={settings.timbre}
              onChange={setTimbre}
            />
            <p className="dash-hint muted">音符速度只改变谱面观感，不改变节拍；音色从下一拍生效。</p>
          </section>
        </section>

        <details className="pattern-drawer">
          <summary>
            <span className="pattern-drawer-title">节奏图案</span>
            <span className="pattern-drawer-hint">重音 · 静音 · 重置</span>
          </summary>
          <div className="pattern-drawer-body">
            <p className="panel-hint muted">点击节拍切换状态；小节右侧可整节重音或静音。</p>
            <PatternEditor
              pattern={pattern}
              playing={playing}
              activeBar={playing && playhead ? playhead.bar : null}
              activeBeat={playing && playhead ? playhead.beat : null}
              onCycleBeat={cycleBeat}
              onBarState={setBarState}
              onResetBar={resetBar}
            />
          </div>
        </details>
      </div>

      <footer className="metronome-transport">
        <button
          type="button"
          className={`transport-play${playing ? ' is-playing' : ''}`}
          onClick={toggle}
        >
          <PlayIcon playing={playing} />
          <span>{playing ? '停止' : '开始'}</span>
        </button>
        <div className="transport-status">
          <strong>
            <span className={`status-dot${playing ? ' is-live' : ''}`} aria-hidden="true" />
            {statusText}
          </strong>
          <span className="muted">{summary}</span>
          {pending && pendingAtStep !== null && (
            <span className="pending-chip">
              谱面改动将在画面外生效 · 约{' '}
              {Math.max(
                1,
                Math.round(
                  (Math.max(0, pendingAtStep - (playhead?.step ?? 0)) * 60) /
                    settings.bpm /
                    Math.max(1, pattern.subdivision),
                ),
              )}{' '}
              秒
            </span>
          )}
        </div>
        <label className="volume-control">
          <span>音量</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={settings.volume}
            aria-label="节拍器音量"
            onChange={(e) => setVolume(Number(e.target.value))}
          />
        </label>
      </footer>
    </main>
  );
}
