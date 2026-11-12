import type { Rect } from '../score/types';

/**
 * Positions a single absolutely-placed overlay over the current bar. The
 * overlay lives inside the scrolling score content, so it moves together with
 * the score; the bar rect is already in content coordinates.
 */
export class HighlightController {
  constructor(private overlay: HTMLElement) {}

  show(rect: Rect | null): void {
    if (!rect) {
      this.overlay.style.opacity = '0';
      return;
    }
    this.overlay.style.opacity = '1';
    this.overlay.style.transform = `translate(${rect.x}px, ${rect.y}px)`;
    this.overlay.style.width = `${rect.width}px`;
    this.overlay.style.height = `${rect.height}px`;
  }

  clear(): void {
    this.overlay.style.opacity = '0';
  }
}
