import type { Rect } from '../score/types';

export interface ScrollControllerOptions {
  topInset?: number;
  bottomInset?: number;
  /** Called when the user manually scrolls / browses and follow is suspended. */
  onManualScroll?: () => void;
}

/**
 * Follows the current bar within a scroll container. It only scrolls when the
 * bar's line leaves the readable area, and it never re-triggers an animation
 * for a line it is already targeting.
 */
export class ScrollController {
  private autoFollow: boolean;
  private lastTargetY = -1;

  constructor(
    private viewport: HTMLElement,
    private options: ScrollControllerOptions = {},
  ) {
    this.autoFollow = true;
    this.attachUserIntentListeners();
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

    const topInset = this.options.topInset ?? 24;
    const bottomInset = this.options.bottomInset ?? 24;

    const top = rect.y - topInset;
    const bottom = rect.y + rect.height + bottomInset;
    const vpTop = this.viewport.scrollTop;
    const vpBottom = vpTop + this.viewport.clientHeight;

    // Still readable: no action.
    if (top >= vpTop && bottom <= vpBottom) return;

    // Target places the bar near the top of the readable area.
    const target = Math.max(0, top - 16);
    if (Math.abs(target - this.lastTargetY) < 1) return;

    this.lastTargetY = target;
    this.viewport.scrollTo({ top: target, behavior: 'smooth' });
  }

  reset(): void {
    this.lastTargetY = -1;
    if (this.autoFollow) this.viewport.scrollTo({ top: 0 });
  }

  private attachUserIntentListeners(): void {
    this.viewport.addEventListener('wheel', this.onUserIntent, { passive: true });
    this.viewport.addEventListener('touchstart', this.onUserIntent, { passive: true });
  }

  private onUserIntent = (): void => {
    if (!this.autoFollow) return;
    this.autoFollow = false;
    this.options.onManualScroll?.();
  };
}
