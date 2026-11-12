import type { SongMetadata } from './types';

interface SongListProps {
  songs: SongMetadata[];
  activeId?: string;
  onSelect: (song: SongMetadata) => void;
}

export function SongList({ songs, activeId, onSelect }: SongListProps) {
  if (songs.length === 0) {
    return <p className="song-list-empty">没有符合条件的歌曲</p>;
  }
  return (
    <ul className="song-list" role="listbox" aria-label="歌曲列表">
      {songs.map((song) => (
        <li key={song.id}>
          <button
            type="button"
            role="option"
            aria-selected={song.id === activeId}
            className={`song-list-item${song.id === activeId ? ' is-active' : ''}`}
            onClick={() => onSelect(song)}
          >
            <span className="song-list-title">{song.title}</span>
            <span className="song-list-meta">
              {song.artist ?? '未知作者'} · ♩ = {song.defaultBpm}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
