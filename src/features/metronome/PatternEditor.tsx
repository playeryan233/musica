import type { BeatState, MetronomePattern } from './types';

const STATE_LABELS: Record<BeatState, string> = {
  accent: '重音',
  normal: '普通',
  skip: '跳过',
};

const STATE_MARKS: Record<BeatState, string> = {
  accent: '▸',
  normal: '',
  skip: '×',
};

interface PatternEditorProps {
  pattern: MetronomePattern;
  playing: boolean;
  activeBar: number | null;
  activeBeat: number | null;
  onCycleBeat: (beatIndex: number) => void;
  onBarState: (barIndex: number, state: BeatState) => void;
  onResetBar: (barIndex: number) => void;
}

/**
 * Editable grid of the looping rhythm. Each cell cycles through
 * normal -> accent -> skip; the bar actions apply a state to a whole bar.
 */
export function PatternEditor({
  pattern,
  playing,
  activeBar,
  activeBeat,
  onCycleBeat,
  onBarState,
  onResetBar,
}: PatternEditorProps) {
  return (
    <div className="pattern-grid">
      {Array.from({ length: pattern.bars }, (_, barIndex) => {
        const barStart = barIndex * pattern.beatsPerBar;
        return (
          <div className="pattern-bar" key={barIndex}>
            <div className="pattern-bar-header">
              <span className="pattern-bar-index">
                第 <span className="bar-badge">{barIndex + 1}</span> 小节
              </span>
              <div className="pattern-bar-actions">
                <button
                  type="button"
                  className="mini-btn"
                  onClick={() => onBarState(barIndex, 'accent')}
                  title="把本小节每一拍都设为重音"
                >
                  重音本小节
                </button>
                <button
                  type="button"
                  className="mini-btn"
                  onClick={() => onBarState(barIndex, 'skip')}
                  title="跳过本小节"
                >
                  静音
                </button>
                <button
                  type="button"
                  className="mini-btn"
                  onClick={() => onResetBar(barIndex)}
                  title="恢复为本小节首拍重音"
                >
                  重置
                </button>
              </div>
            </div>

            <div
              className="pattern-beats"
              style={{
                gridTemplateColumns: `repeat(${pattern.beatsPerBar}, minmax(0, 96px))`,
              }}
            >
              {Array.from({ length: pattern.beatsPerBar }, (_, beatIndex) => {
                const index = barStart + beatIndex;
                const state = pattern.beats[index] ?? 'normal';
                const active = playing && activeBar === barIndex && activeBeat === beatIndex;
                return (
                  <button
                    key={beatIndex}
                    type="button"
                    className={`beat-cell is-${state}${active ? ' is-active' : ''}`}
                    aria-label={`第 ${barIndex + 1} 小节第 ${beatIndex + 1} 拍，${STATE_LABELS[state]}`}
                    onClick={() => onCycleBeat(index)}
                  >
                    <span className="beat-number">{beatIndex + 1}</span>
                    <span className="beat-state" aria-hidden="true">
                      {STATE_MARKS[state]}
                    </span>
                    {pattern.subdivision > 1 && (
                      <span className="beat-subs" aria-hidden="true">
                        {Array.from({ length: pattern.subdivision - 1 }, (_, i) => (
                          <span className="beat-sub-dot" key={i} />
                        ))}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
