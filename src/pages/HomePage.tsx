import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { preferenceRepository } from '../features/preferences/preferenceRepository';
import { SongRepository } from '../features/songs/songRepository';
import type { SongManifest } from '../features/songs/types';
import { SiteHeader } from '../shared/SiteHeader';

function SheetPreview() {
  return (
    <div className="sheet-preview" aria-hidden="true">
      <div className="sheet-preview-lines" />
      <span className="sheet-note" style={{ left: '18%' }}>
        ♩
      </span>
      <span className="sheet-note" style={{ left: '38%' }}>
        ♪
      </span>
      <span className="sheet-note" style={{ left: '58%' }}>
        ♫
      </span>
      <span className="sheet-note" style={{ left: '78%' }}>
        ♩
      </span>
    </div>
  );
}

export function HomePage() {
  const [lastSong, setLastSong] = useState<SongManifest['songs'][number] | null>(null);

  useEffect(() => {
    const prefs = preferenceRepository.load();
    const lastId = prefs.lastSongId;
    if (!lastId) return;
    let cancelled = false;
    SongRepository.fetchManifest()
      .then((m) => {
        if (cancelled) return;
        setLastSong(SongRepository.findById(m, lastId));
      })
      .catch(() => {
        /* ignore; the CTA just falls back to "选择歌曲" */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="page home">
      <SiteHeader />

      <div className="home-content">
        <section className="hero">
          <div className="hero-copy">
            <h1>跟随乐谱练琴，跟着节拍前进</h1>
            <p>
              展示五线谱与六线谱，按你的速度自动高亮并滚动，配合有声节拍器，把注意力留给手和耳。
            </p>
            <div className="hero-actions">
              <Link className="btn btn-primary btn-lg" to="/songs">
                开始练习
              </Link>
              {lastSong ? (
                <Link className="btn btn-lg" to={`/songs/${lastSong.id}`}>
                  继续练习 · {lastSong.title}
                </Link>
              ) : (
                <Link className="btn btn-lg" to="/songs">
                  选择歌曲
                </Link>
              )}
            </div>
          </div>
          <SheetPreview />
        </section>

        <section className="features">
          <div className="feature">
            <h2>五线谱 · 六线谱</h2>
            <p>在五线谱、六线谱或双谱之间切换，自适应换行，桌面与手机均可阅读。</p>
          </div>
          <div className="feature">
            <h2>BPM 自动跟谱</h2>
            <p>高亮、滚动与节拍器共享同一条时间轴，速度变化时进度不跳变。</p>
          </div>
          <div className="feature">
            <h2>有声节拍器</h2>
            <p>强弱拍分明的合成节拍声，音量可调，练习中随时开关。</p>
          </div>
        </section>
      </div>
    </main>
  );
}
