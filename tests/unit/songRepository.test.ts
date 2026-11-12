import { describe, expect, it } from 'vitest';
import { resolveAssetUrl, SongRepository } from '../../src/features/songs/songRepository';

describe('resolveAssetUrl', () => {
  it('resolves against the root deployment base', () => {
    expect(resolveAssetUrl('songs/index.json', '/')).toBe('/songs/index.json');
  });

  it('resolves against a sub-path deployment base', () => {
    expect(resolveAssetUrl('songs/index.json', '/musica/')).toBe('/musica/songs/index.json');
    expect(resolveAssetUrl('songs/practice-001/score.musicxml', '/musica/')).toBe(
      '/musica/songs/practice-001/score.musicxml',
    );
  });

  it('tolerates manifest URLs with a leading slash', () => {
    expect(resolveAssetUrl('/songs/index.json', '/musica/')).toBe('/musica/songs/index.json');
  });

  it('passes absolute URLs through untouched', () => {
    expect(resolveAssetUrl('https://cdn.example.com/a.musicxml', '/musica/')).toBe(
      'https://cdn.example.com/a.musicxml',
    );
    expect(resolveAssetUrl('//cdn.example.com/a.musicxml', '/')).toBe(
      '//cdn.example.com/a.musicxml',
    );
  });

  it('joins correctly when the base itself is an absolute URL', () => {
    expect(resolveAssetUrl('songs/index.json', 'https://cdn.example.com/app/')).toBe(
      'https://cdn.example.com/app/songs/index.json',
    );
  });
});

describe('SongRepository.parseManifest', () => {
  const song = {
    id: 'demo',
    title: 'Demo',
    scoreUrl: 'songs/demo/score.musicxml',
    format: 'musicxml',
    defaultBpm: 60,
    defaultTrackIndex: 0,
    availableViews: ['standard'],
    practiceStructure: 'linear',
  };

  it('accepts a valid manifest', () => {
    const manifest = SongRepository.parseManifest({ schemaVersion: 1, songs: [song] });
    expect(manifest.songs).toHaveLength(1);
  });

  it('rejects unknown schema versions', () => {
    expect(() => SongRepository.parseManifest({ schemaVersion: 2, songs: [song] })).toThrow();
  });

  it('rejects entries with an unknown format', () => {
    expect(() =>
      SongRepository.parseManifest({ schemaVersion: 1, songs: [{ ...song, format: 'pdf' }] }),
    ).toThrow();
  });
});
