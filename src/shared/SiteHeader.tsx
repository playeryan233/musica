import { Link, NavLink } from 'react-router-dom';

/**
 * The single top bar for every page. Home used to render its own inset nav with
 * a non-clickable brand and no active state, while the other pages rendered a
 * full-width bar with highlighted links — same brand, different look. Keeping
 * one component and one set of styles here makes the navigation identical on
 * every route.
 */
export function SiteHeader() {
  return (
    <header className="site-header">
      <Link className="site-brand" to="/">
        Musica
      </Link>
      <nav className="site-nav" aria-label="主导航">
        {/* `end` keeps 首页 from staying active on /songs and /metronome. */}
        <NavLink to="/" end>
          首页
        </NavLink>
        {/* Partial matching keeps 歌曲 active on /songs/:songId too. */}
        <NavLink to="/songs">歌曲</NavLink>
        <NavLink to="/metronome">节拍器</NavLink>
      </nav>
    </header>
  );
}
