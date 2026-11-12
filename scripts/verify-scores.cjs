// 校验曲库清单里每首曲谱都能被 alphaTab 解析，并打印小节/音符摘要。
// 用法：npm run verify:scores
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const QUARTER = 960; // alphaTab MidiUtils.QuarterTime（内部常量，未导出）

async function main() {
  const manifestPath = path.join(ROOT, 'public', 'songs', 'index.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const songs = Array.isArray(manifest.songs) ? manifest.songs : [];
  if (songs.length === 0) throw new Error('曲库清单为空：public/songs/index.json');

  const alphatab = await import('@coderline/alphatab/core');
  const { ScoreLoader } = alphatab.importer;

  let failed = 0;
  for (const song of songs) {
    const file = path.join(ROOT, 'public', song.scoreUrl);
    if (!fs.existsSync(file)) {
      console.error(`\n=== ${song.id}: 文件不存在 ${song.scoreUrl} ===`);
      failed++;
      continue;
    }

    try {
      const bytes = new Uint8Array(fs.readFileSync(file));
      const score = ScoreLoader.loadScoreFromBytes(bytes);
      const track = score.tracks[0];
      console.log(
        `\n=== ${song.id}: ${score.title} ===\n` +
          `tracks=${score.tracks.length} masterBars=${score.masterBars.length} staves=${track.staves.length}`,
      );
      score.masterBars.forEach((mb, i) => {
        const cells = [];
        for (let si = 0; si < track.staves.length; si++) {
          const bar = track.staves[si].bars[i];
          if (!bar) {
            cells.push(`s${si}:<nobar>`);
            continue;
          }
          let beats = 0;
          let notes = 0;
          const sample = [];
          for (const voice of bar.voices) {
            for (const beat of voice.beats) {
              beats++;
              for (const note of beat.notes) {
                notes++;
                sample.push(note.string >= 0 ? `${note.string}/${note.fret}` : `${note.octave ?? '?'}`);
              }
            }
          }
          cells.push(`s${si}(beats=${beats},notes=${notes})[${sample.join(' ')}]`);
        }
        console.log(
          `  mb[${i}] ${mb.timeSignatureNumerator}/${mb.timeSignatureDenominator} ` +
            `anacrusis=${mb.isAnacrusis} dur=${mb.calculateDuration()}/${QUARTER}q ${cells.join(' | ')}`,
        );
      });
    } catch (error) {
      console.error(`\n=== ${song.id}: ERROR ===`);
      console.error(error && error.message ? error.message : error);
      failed++;
    }
  }

  if (failed > 0) {
    console.error(`\n✗ ${failed}/${songs.length} 首曲谱校验失败`);
    process.exit(1);
  }
  console.log(`\n✔ ${songs.length} 首曲谱全部解析成功`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
