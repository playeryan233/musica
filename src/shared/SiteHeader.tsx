import { useEffect, useRef } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { BrandLogo } from './BrandLogo';

/** How far (px) the pointer can be from an item's centre and still enlarge it. */
const MAGNIFY_RADIUS = 96;
/** Extra scale at the very centre of an item. */
const MAGNIFY_AMOUNT = 0.32;

const LINKS = [
  { to: '/', label: '首页', end: true },
  { to: '/songs', label: '歌曲', end: false },
  { to: '/metronome', label: '节拍器', end: false },
] as const;

/**
 * The single top bar for every page: brand on the left, navigation centred.
 * The item nearest the pointer grows smoothly (a dock-style magnification), so
 * the hovered option reacts wherever the pointer sits inside the bar. Scaling
 * is a pure transform: it never shifts the layout or the centred geometry.
 */
export function SiteHeader() {
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const links = Array.from(nav.querySelectorAll<HTMLElement>('a'));
    let pointerX: number | null = null;
    let frame = 0;

    const apply = () => {
      frame = 0;
      for (const link of links) {
        if (pointerX === null) {
          link.style.transform = '';
          continue;
        }
        const rect = link.getBoundingClientRect();
        const distance = Math.abs(pointerX - (rect.left + rect.width / 2));
        const proximity = Math.max(0, 1 - distance / MAGNIFY_RADIUS);
        const scale = 1 + MAGNIFY_AMOUNT * proximity * proximity;
        link.style.transform = `scale(${scale.toFixed(3)})`;
      }
    };

    const schedule = (x: number | null) => {
      pointerX = x;
      if (frame === 0) frame = requestAnimationFrame(apply);
    };

    const onPointerMove = (event: PointerEvent) => {
      // Touch has no hover; only a real mouse drives the magnification.
      if (event.pointerType !== 'mouse') return;
      schedule(event.clientX);
    };
    const onPointerLeave = () => schedule(null);

    nav.addEventListener('pointermove', onPointerMove);
    nav.addEventListener('pointerleave', onPointerLeave);
    return () => {
      nav.removeEventListener('pointermove', onPointerMove);
      nav.removeEventListener('pointerleave', onPointerLeave);
      if (frame !== 0) cancelAnimationFrame(frame);
      for (const link of links) link.style.transform = '';
    };
  }, []);

  return (
    <header className="site-header">
      <Link className="site-brand" to="/">
        <BrandLogo className="site-brand-mark" />
        <span className="site-brand-name">Musica</span>
        <span className="site-brand-note" aria-hidden="true">
          🎵
        </span>
      </Link>
      <nav className="site-nav" aria-label="主导航" ref={navRef}>
        {LINKS.map((link) => (
          <NavLink key={link.to} to={link.to} end={link.end}>
            {link.label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
