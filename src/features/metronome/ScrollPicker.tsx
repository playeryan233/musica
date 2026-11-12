import { useCallback, useEffect, useRef, type KeyboardEvent } from 'react';

export interface PickerOption<T extends string | number> {
  value: T;
  label: string;
}

interface ScrollPickerProps<T extends string | number> {
  /** Small name shown above the strip, e.g. 每小节. */
  label: string;
  /** Accessible name for the scrollable group. */
  ariaLabel: string;
  options: PickerOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Appended to the active value readout, e.g. 拍 / 小节. */
  unit?: string;
  /**
   * Lay all options out in one row instead of centring the active option.
   * Best for a handful of short labels that always fit.
   */
  fit?: boolean;
}

const SETTLE_MS = 140;
const PROGRAMMATIC_MS = 500;

/**
 * A horizontal, snap-scrolling option picker. Swiping, the mouse wheel or a
 * click on an option selects it; the option nearest the centre becomes active.
 * The strip is padded so the first and last options can reach the centre.
 */
export function ScrollPicker<T extends string | number>({
  label,
  ariaLabel,
  options,
  value,
  onChange,
  unit,
  fit = false,
}: ScrollPickerProps<T>) {
  const stripRef = useRef<HTMLDivElement>(null);
  const programmatic = useRef(false);
  const settleTimer = useRef<number | undefined>(undefined);
  const flagTimer = useRef<number | undefined>(undefined);
  const mounted = useRef(false);

  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  const scrollToIndex = useCallback((target: number, behavior: ScrollBehavior) => {
    const strip = stripRef.current;
    const item = strip?.children[target] as HTMLElement | undefined;
    if (!strip || !item) return;
    const left = item.offsetLeft - (strip.clientWidth - item.offsetWidth) / 2;
    programmatic.current = true;
    window.clearTimeout(flagTimer.current);
    strip.scrollTo({ left, behavior });
    flagTimer.current = window.setTimeout(() => {
      programmatic.current = false;
    }, PROGRAMMATIC_MS);
  }, []);

  // Keep the active option centred, both on mount and when the value changes
  // from outside (keyboard arrows, a click on another option, restored prefs).
  useEffect(() => {
    if (fit) return;
    scrollToIndex(index, mounted.current ? 'smooth' : 'auto');
    mounted.current = true;
  }, [index, scrollToIndex, fit]);

  const handleScroll = () => {
    if (programmatic.current) return;
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      const strip = stripRef.current;
      if (!strip || programmatic.current) return;
      const centre = strip.scrollLeft + strip.clientWidth / 2;
      let best = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let i = 0; i < strip.children.length; i++) {
        const child = strip.children[i] as HTMLElement;
        const childCentre = child.offsetLeft + child.offsetWidth / 2;
        const distance = Math.abs(childCentre - centre);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = i;
        }
      }
      const next = options[best];
      if (next && next.value !== value) onChange(next.value);
    }, SETTLE_MS);
  };

  // Translate a vertical wheel gesture into horizontal scrolling, otherwise the
  // page would scroll while the pointer is over the strip.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      if (strip.scrollWidth <= strip.clientWidth) return;
      event.preventDefault();
      strip.scrollLeft += event.deltaY;
    };
    strip.addEventListener('wheel', onWheel, { passive: false });
    return () => strip.removeEventListener('wheel', onWheel);
  }, []);

  const select = (target: number) => {
    const clamped = Math.min(options.length - 1, Math.max(0, target));
    const option = options[clamped];
    if (option && option.value !== value) onChange(option.value);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      select(index - 1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      select(index + 1);
    }
  };

  return (
    <div className="picker" onKeyDown={onKeyDown}>
      <div className="picker-head">
        <span className="picker-label">{label}</span>
        <output className="picker-value" aria-live="polite">
          {options[index]?.label}
          {unit ? <span className="picker-unit"> {unit}</span> : null}
        </output>
      </div>
      <div
        className={`picker-strip${fit ? ' is-fit' : ''}`}
        ref={stripRef}
        onScroll={handleScroll}
        role="group"
        aria-label={ariaLabel}
      >
        {options.map((option, optionIndex) => (
          <button
            key={String(option.value)}
            type="button"
            className={`picker-item${option.value === value ? ' is-active' : ''}`}
            aria-pressed={option.value === value}
            onClick={() => {
              onChange(option.value);
              scrollToIndex(optionIndex, 'smooth');
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
