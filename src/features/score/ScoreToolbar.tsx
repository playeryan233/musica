import { SCORE_VIEWS, VIEW_LABELS, type ScoreView } from '../songs/types';

interface ScoreToolbarProps {
  availableViews: ScoreView[];
  view: ScoreView;
  zoom: number;
  onViewChange: (view: ScoreView) => void;
  onZoomChange: (zoom: number) => void;
}

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.1;

export function ScoreToolbar({
  availableViews,
  view,
  zoom,
  onViewChange,
  onZoomChange,
}: ScoreToolbarProps) {
  return (
    <div className="score-toolbar" role="toolbar" aria-label="谱面设置">
      <div className="score-toolbar-group">
        {SCORE_VIEWS.filter((v) => availableViews.includes(v)).map((v) => (
          <button
            key={v}
            type="button"
            className={`chip${view === v ? ' is-active' : ''}`}
            aria-pressed={view === v}
            onClick={() => onViewChange(v)}
          >
            {VIEW_LABELS[v]}
          </button>
        ))}
      </div>
      <div className="score-toolbar-group">
        <button
          type="button"
          className="icon-btn"
          aria-label="缩小"
          onClick={() => onZoomChange(Math.max(ZOOM_MIN, Math.round((zoom - ZOOM_STEP) * 10) / 10))}
        >
          −
        </button>
        <span className="zoom-label">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          className="icon-btn"
          aria-label="放大"
          onClick={() => onZoomChange(Math.min(ZOOM_MAX, Math.round((zoom + ZOOM_STEP) * 10) / 10))}
        >
          +
        </button>
      </div>
    </div>
  );
}
