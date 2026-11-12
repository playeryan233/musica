interface SongSearchProps {
  value: string;
  onChange: (value: string) => void;
}

export function SongSearch({ value, onChange }: SongSearchProps) {
  return (
    <div className="song-search">
      <label className="sr-only" htmlFor="song-search-input">
        搜索歌曲
      </label>
      <input
        id="song-search-input"
        type="search"
        placeholder="搜索歌名或作者"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
