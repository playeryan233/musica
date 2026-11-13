import type { Rect } from '../score/types';

export interface ScrollControllerOptions {
  topInset?: number;
  bottomInset?: number;
  /** Called when the user manually scrolls / browses and follow is suspended. */
  onManualScroll?: () => void;
}

/** The parts of a scroll container the follow logic needs. */
export interface FollowViewport {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}

export interface FollowInsets {
  top: number;
  bottom: number;
}

const DEFAULT_TOP_INSET = 24;
const DEFAULT_BOTTOM_INSET = 24;
/** Gap kept between the window's top edge and the followed bar. */
const FOLLOW_TOP_MARGIN_PX = 16;
/** Ignore target changes smaller than this, in px. */
const TARGET_TOLERANCE_PX = 1;
/** How long a programmatic smooth scroll may emit scroll events. */
const PROGRAMMATIC_WINDOW_MS = 600;

/**
 * Where the container should scroll to keep `rect` inside the readable area, or
 * `null` when the rect is already readable and nothing should move.
 *
 * A needed scroll puts the bar just below the top inset. That keeps the current
 * line plus the upcoming lines in view — aligning the bar to the bottom edge
 * would scroll on every single line and leave no look-ahead.
 */
export function followTarget(
  rect: Rect,
  viewport: FollowViewport,
  insets: FollowInsets,
): number | null {
  const top = rect.y - insets.top;
  const bottom = rect.y + rect.height + insets.bottom;
  const viewTop = viewport.scrollTop;
  const viewBottom = viewTop + viewport.clientHeight;

  if (top >= viewTop && bottom <= viewBottom) return null;

  const maxScroll = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
  return Math.min(maxScroll, Math.max(0, top - FOLLOW_TOP_MARGIN_PX));
}

/**
 * Follows the current bar within a scroll container. It only scrolls when the
 * bar's line leaves the readable area, never re-triggers an animation for a
 * line it is already targeting, and suspends itself as soon as the user takes
 * over — including scrollbar drags and keyboard scrolling, not just the wheel
 * and touch.
 */
export class ScrollController {
  private autoFollow = true;
  private lastTargetY = -1;
  /** Scroll events until this timestamp come from our own animation. */
  private programmaticUntil = 0;
  private readonly insets: FollowInsets;

  constructor(
    private viewport: HTMLElement,
    private options: ScrollControllerOptions = {},
  ) {
    this.insets = {
      top: options.topInset ?? DEFAULT_TOP_INSET,
      bottom: options.bottomInset ?? DEFAULT_BOTTOM_INSET,
    };
    this.viewport.addEventListener('wheel', this.onUserIntent, { passive: true });
    this.viewport.addEventListener('touchstart', this.onUserIntent, { passive: true });
    this.viewport.addEventListener('scroll', this.onScroll, { passive: true });
    // Chrome/Safari/Firefox fire `scrollend` once a smooth scroll settles, which
    // lets a user scrollbar drag take over immediately instead of waiting for
    // the fallback window to expire.
    this.viewport.addEventListener('scrollend', this.onScrollSettled);
  }

  setAutoFollow(enabled: boolean): void {
    this.autoFollow = enabled;
    if (enabled) this.lastTargetY = -1;
  }

  isAutoFollow(): boolean {
    return this.autoFollow;
  }

  follow(rect: Rect | null): void {
    if (!rect || !this.autoFollow) return;

    const target = followTarget(rect, this.viewport, this.insets);
    if (target === null) return;
    if (Math.abs(target - this.lastTargetY) < TARGET_TOLERANCE_PX) return;

    this.lastTargetY = target;
    this.scrollTo(target, 'smooth');
  }

  /** Jump back to the start (回到开头); no animation, no user-intent detection. */
  reset(): void {
    this.lastTargetY = -1;
    this.scrollTo(0, 'auto');
  }

  dispose(): void {
    this.viewport.removeEventListener('wheel', this.onUserIntent);
    this.viewport.removeEventListener('touchstart', this.onUserIntent);
    this.viewport.removeEventListener('scroll', this.onScroll);
    this.viewport.removeEventListener('scrollend', this.onScrollSettled);
  }

  private scrollTo(target: number, behavior: ScrollBehavior): void {
    this.programmaticUntil = performance.now() + PROGRAMMATIC_WINDOW_MS;
    this.viewport.scrollTo({ top: target, behavior });
  }

  private suspend(): void {
    if (!this.autoFollow) return;
    this.autoFollow = false;
    this.options.onManualScroll?.();
  }

  private readonly onUserIntent = (): void => {
    this.suspend();
  };

  private readonly onScroll = (): void => {
    if (!this.autoFollow) return;
    if (performance.now() < this.programmaticUntil) return;
    this.suspend();
  };

  private readonly onScrollSettled = (): void => {
    this.programmaticUntil = 0;
  };
}
