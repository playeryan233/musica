import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE = 'http://localhost:5173';
const OUT = new URL('../.shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

await page.goto(`${BASE}/`, { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear());

const summary = [];

async function inspect(name, path, opts = {}) {
  const errors = [];
  const onErr = (m) => errors.push(m.text());
  page.on('console', onErr);
  await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}${name}.png` });
  const info = await page.evaluate(() => {
    const bpm = document.querySelector('.bpm-input')?.value;
    const canvas = document.querySelectorAll('canvas').length;
    const hl = document.querySelector('.score-highlight');
    const viewBtns = [...document.querySelectorAll('.chip')].map((b) => ({
      label: b.textContent.trim(),
      active: b.classList.contains('is-active'),
    }));
    return { bpm, canvas, hlOpacity: hl ? hl.style.opacity : null, viewBtns };
  });
  page.off('console', onErr);
  summary.push({ name, ...info, errors });
  console.log(`\n=== ${name} (${path}) ===`);
  console.log('  bpm:', info.bpm, '| canvases:', info.canvas, '| highlight:', info.hlOpacity);
  console.log('  views:', JSON.stringify(info.viewBtns));
  console.log('  errors:', errors.length ? errors.slice(0, 3) : 'none');
}

await inspect('score-standard', '/songs/practice-001');
await inspect('score-tab', '/songs/practice-002');
await inspect('score-34', '/songs/practice-003');

// Exercise view switching on the tab piece (only view available = tablature).
await page.goto(`${BASE}/songs/practice-002`, { waitUntil: 'load' });
await page.waitForTimeout(2500);
const sixLine = page.getByRole('button', { name: '六线谱' });
if (await sixLine.count()) {
  await sixLine.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}score-tab-selected.png` });
}

// Start practice on the standard piece to exercise transport + metronome.
await page.goto(`${BASE}/songs/practice-001`, { waitUntil: 'load' });
await page.waitForTimeout(2000);
await page.getByRole('button', { name: '开始练习' }).click();
await page.waitForTimeout(1800);
await page.screenshot({ path: `${OUT}playing.png` });
const playState = await page.evaluate(() => ({
  btn: document.querySelector('.btn-primary')?.textContent,
  hl: document.querySelector('.score-highlight')?.style.opacity,
}));
console.log('\n=== playing state ===', JSON.stringify(playState));

await browser.close();
