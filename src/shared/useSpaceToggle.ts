import { useEffect, useRef } from 'react';

/**
 * Elements that already give the space key a meaning of their own. Hijacking it
 * here would make keyboard operation worse: a focused button would play/pause
 * instead of activating, a focused link would not navigate, a <summary> would
 * not expand, and so on.
 */
const INTERACTIVE_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'select',
  'summary',
  'textarea',
  '[contenteditable]',
  '[role="button"]',
  '[role="checkbox"]',
  '[role="combobox"]',
  '[role="link"]',
  '[role="listbox"]',
  '[role="option"]',
  '[role="radio"]',
  '[role="searchbox"]',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[role="switch"]',
  '[role="textbox"]',
].join(',');

/**
 * Whether a space keydown on `target` belongs to the focused control instead of
 * the global play/pause shortcut. Exported so the rule can be unit-tested
 * without React.
 */
export function isSpaceShortcutBlocked(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  return target.closest(INTERACTIVE_SELECTOR) !== null;
}

/**
 * Bind the space bar to a global action (play/pause), the way media players do.
 * It stays out of the way whenever a focused control owns the key, and ignores
 * key repeats so holding space does not toggle back and forth.
 */
export function useSpaceToggle(onToggle: () => void): void {
  const handlerRef = useRef(onToggle);
  useEffect(() => {
    handlerRef.current = onToggle;
  }, [onToggle]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' && event.key !== ' ') return;
      if (event.repeat) return;
      // Leave browser/system shortcuts alone (Cmd+Space, Ctrl+Space, …).
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (isSpaceShortcutBlocked(event.target)) return;
      event.preventDefault();
      handlerRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
