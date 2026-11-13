import { describe, expect, it } from 'vitest';
import { isSpaceShortcutBlocked } from '../../src/shared/useSpaceToggle';

function render(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.appendChild(host);
  return host;
}

describe('isSpaceShortcutBlocked', () => {
  it('lets the global shortcut own the key on plain page content', () => {
    const host = render('<div><span>score area</span></div>');
    expect(isSpaceShortcutBlocked(host.querySelector('div'))).toBe(false);
    document.body.removeChild(host);
  });

  it('never steals space from buttons, links, inputs and summaries', () => {
    const host = render(`
      <button type="button">play</button>
      <a href="/songs">songs</a>
      <input value="60" />
      <textarea></textarea>
      <select><option>1</option></select>
      <summary>pattern</summary>
    `);
    for (const element of host.querySelectorAll('button, a, input, textarea, select, summary')) {
      expect(isSpaceShortcutBlocked(element)).toBe(true);
    }
    document.body.removeChild(host);
  });

  it('blocks the key for a child of an interactive control', () => {
    const host = render('<button type="button"><span>停止</span></button>');
    expect(isSpaceShortcutBlocked(host.querySelector('span'))).toBe(true);
    document.body.removeChild(host);
  });

  it('blocks the key inside contenteditable and ARIA widgets', () => {
    const host = render(`
      <div contenteditable="true">text</div>
      <div role="slider" aria-label="bpm"></div>
      <div role="listbox"><div role="option">song</div></div>
    `);
    expect(isSpaceShortcutBlocked(host.querySelector('[contenteditable]'))).toBe(true);
    expect(isSpaceShortcutBlocked(host.querySelector('[role="slider"]'))).toBe(true);
    expect(isSpaceShortcutBlocked(host.querySelector('[role="option"]'))).toBe(true);
    document.body.removeChild(host);
  });

  it('handles a missing or non-element target', () => {
    expect(isSpaceShortcutBlocked(null)).toBe(false);
    expect(isSpaceShortcutBlocked(window)).toBe(false);
  });
});
