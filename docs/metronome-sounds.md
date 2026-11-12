# 节拍器音色：网上可用声音调研

调研时间：2026-11-11。目标：为 `/metronome` 的「点击音」找可商用、可随站点分发的真实录音，同时不破坏现有合成音色与调度逻辑。

## 结论

- **首选 CC0 单发音效（public domain）**：不需要署名、允许商用与再分发，和 MIT 项目最省心。
- 建议保留 `beep`（纯正弦的音高对比对练耳有用），新增 `mpc` 经典电子点击；把 `woodblock`、`shaker`、`mechanical`、`cowbell` 换成录音，合成配方继续作为加载失败时的兜底；可选新增 `claves`。
  - `beep` → 保留合成（1000 / 700 / 520 Hz）
  - `mpc`（新）→ MPC Metronome click
  - `woodblock` → 木鱼 hard / med / soft 三层力度
  - `shaker` → 沙锤单次摇动
  - `mechanical` → TR-808 rim（13 ms，极短）
  - `cowbell` → LP 牛铃
  - 可选 `claves` → 响棒
- 全部素材裁切为单声道 44.1 kHz / 16-bit、80–200 ms 后，**总计约 60–70 KB**，相对当前约 7 MB 的 `dist/` 可以忽略。
- **不要用**：CC-BY-NC、Freesound Sampling+、BBC Sound Effects（RemArc）、来源不明的「免费音效站」MP3。它们要么禁止商用，要么要求署名/禁止再分发，和静态站打包冲突。

## 项目现状与约束

| 事实 | 位置 | 对选音的影响 |
| --- | --- | --- |
| 点击声全部是 Web Audio 实时合成 | `src/features/audio/click.ts` | 目前没有音频文件；加采样需要新增加载/解码路径 |
| 5 个音色，每个有 accent / normal / sub 三档 | `src/features/audio/timbres.ts` | 采样最好也能提供三档，或至少能用增益/滤波派生 |
| 合成点击时长 12–85 ms | 同上 | 采样要裁到同一量级，长尾音会糊成一片 |
| 单一共享 `AudioContext` | `src/features/audio/audioManager.ts` | 采样解码一次、全站复用；不要每个组件建 ctx |
| 提前 100 ms 调度，首拍前留 50 ms | `src/features/metronome/MetronomeEngine.ts` | 必须在 `start()` 前完成解码，不能等到点击时再 `fetch` |
| `start()` 会 `await ensureRunning()` | `MetronomeEngine.start` / `PracticeTransport.start` | 这是最合适的预加载挂载点 |
| 练习模式固定用 `beep` | `src/features/practice/MetronomeScheduler.ts` | 采样音色只影响独立节拍器；练习模式要另行接入 |
| 静态站、子路径部署、无后端 | `vite.config.ts` / README | 素材走 Vite `?url` 或 `public/`，注意 `DEPLOY_BASE` |
| `tsconfig` 已含 `vite/client` | `tsconfig.json` | 可以直接 `import url from './x.wav?url'` |
| 已有 Sonivox GM SoundFont（Apache-2.0） | `public/soundfont/` | 理论上能取打击乐，但见下文，不推荐 |

## 什么样的声音适合做节拍器

**适合**

- 起音快、瞬态清楚，最好在 0–1 ms 内达到峰值；
- 干声、无混响、无长尾，80–200 ms 内衰减到听不见；
- 中高频为主（1–6 kHz），能穿透吉他/人声，又不和低音打架；
- 单声道或可安全合并为单声道；
- 文件开头没有明显静音（否则每一拍都晚几毫秒）；
- 同组素材有 hard / medium / soft 力度层，天然对应 accent / normal / sub；
- 电平一致，峰值在 -6 到 -1 dBFS 之间，方便统一增益。

**不适合**

- 120 BPM 的循环（loop）——需要额外切片，且容易带节奏；
- 带混响的房间录音、长衰减的铃/镲；
- 有明确音高的音色（会和曲子调性冲突；电子 click 例外，因为它是噪音化的短脉冲）；
- 立体声且相位不一致的素材（合单声道会抵消）；
- 48 kHz/24-bit 且体积很大的「发烧」采样——浏览器会重采样，收益为零。

## 候选清单（已核验授权与规格）

### A. Freesound（CC0，下载需登录）

| 用途 | 素材 | 作者 | 授权 | 规格 | 原文件 |
| --- | --- | --- | --- | --- | --- |
| 经典电子点击 | [MPC Metronome click](https://freesound.org/people/trader_one/sounds/684106/) | trader_one | CC0 | 22 ms，44.1 kHz/16-bit，立体声，4.1 KB | 4.1 KB |
| 清脆电子点击（高） | [Click Metronome atonal high](https://freesound.org/people/lennartgreen/sounds/566888/) | lennartgreen | CC0 | 页面标 7 ms（2.6 KB，实际约 15–20 ms），44.1 kHz/24-bit，单声道 | 2.6 KB |
| 清脆电子点击（低） | [Click Metronome atonal low](https://freesound.org/people/lennartgreen/sounds/566887/) | lennartgreen | CC0 | 同系列，另一音高 | 同量级 |
| 木鱼（重/中/轻） | [Woodblock-hard](https://freesound.org/people/hollandm/sounds/692818/) / [med](https://freesound.org/people/hollandm/sounds/692819/) / [soft](https://freesound.org/people/hollandm/sounds/692828/) | hollandm | CC0 | 500 ms，44.1 kHz/16-bit，立体声，86.2 KB | 三条 |
| 沙锤 | [Shaker-tube.wav](https://freesound.org/people/hollandm/sounds/692827/) | hollandm | CC0 | 1000 ms，44.1 kHz/16-bit，立体声，172.3 KB | 172.3 KB |
| 牛铃 | [LP Cowbell.wav](https://freesound.org/people/Mozaic/sounds/319149/) | Mozaic | CC0 | 1505 ms，44.1 kHz/16-bit，立体声，259.5 KB | 259.5 KB |
| 响棒（可选） | [Close claves](https://freesound.org/people/LloydEvans09/sounds/186992/) | LloydEvans09 | CC0 | 316 ms，44.1 kHz/16-bit，立体声，55.4 KB | 55.4 KB |

> hollandm 的「Wood percussion」包风格统一、干声、AKG P220 录音；已核验的木鱼三条与沙锤都是 CC0。包内还有响板、铃鼓，适合一次性把木制音色配齐：<https://freesound.org/people/hollandm/packs/38739/>。

### B. Kringel samples（CC0，GitHub 直链，无需登录）

仓库：<https://github.com/Gradigang-Solutions/kringel-samples>（README 明确全部 CC0 1.0，可商用、可再分发）。已实测下载并分析：

| 文件 | 实际内容 | 规格 | 有效时长 | 峰值 | 备注 |
| --- | --- | --- | --- | --- | --- |
| `Fischer808/rim.wav` | TR-808 rimshot | 44.1 kHz/16-bit 单声道，22 KB | 12.6 ms | -2.5 dBFS | 极短，适合 `mechanical` |
| `Fischer808/hh.wav` | TR-808 闭镲 | 同上 | 76.6 ms | -5.0 dBFS | 经典「嗒」声 |
| `Fischer808/cb.wav` | TR-808 牛铃 | 同上 | 321.8 ms | -3.0 dBFS | 需裁到 200 ms 内 |
| `Fischer808/sh.wav` | 短促噪音/沙锤类 | 同上 | 31.2 ms | -2.5 dBFS | 命名含义未完全确认，试听后用 |

直链示例：`https://raw.githubusercontent.com/Gradigang-Solutions/kringel-samples/main/Fischer808/rim.wav`。

优点：无需注册、可脚本化下载、全部单声道 44.1 kHz/16-bit、起音前静音 < 1.2 ms。缺点：是鼓机音色，不是原声乐器；`sh.wav` 的命名需要试听确认。

### C. 大型音源库（质量高，但为几秒钟素材引入太重）

- **VSCO 2 Community Edition**：CC0，约 3000 个采样，含打击乐；Freesound 上的分轨包：<https://freesound.org/people/sgossner/packs/21028/>。适合想要整套原声打击乐时使用，但包是多力度多层、命名按音高，挑 5 个 click 要从几 GB 里翻，性价比低。
- **FreePats / sfzinstruments**：多为 CC0 或自由许可，但以 SFZ/GIG 乐器库为主，需要再渲染成 WAV，增加构建步骤。
- **Sonivox `sonivox.sf2`（项目已内置）**：Apache-2.0，可分发但需保留 NOTICE；用 `strings` 检查只看到 `Woodblock`（另有 `Tinkle Bell`、`Tubular-bell`），没有 Cowbell / Claves / Hi-hat 等完整 GM 打击乐，而且音源本身是 11–32 kHz 的旧手机 bank。**不建议**为了节拍器去抽它。

### D. 不建议的来源

| 来源 | 原因 |
| --- | --- |
| CC-BY-NC 素材 | 禁止商用；项目一旦接赞助/收费就违规 |
| Freesound **Sampling+** | 要求署名，且对「以采样形式再分发」有限制，打包进静态站有歧义 |
| BBC Sound Effects | RemArc 许可仅限个人/教育用途 |
| Zapsplat / Mixkit / Pixabay | 可免费商用，但不是 CC0，条款里对「再分发」表述不一，需逐条确认 |
| YouTube / 网盘「节拍器音效包」 | 来源与授权不可追溯，不能作为仓库资产 |

## 推荐组合与尺寸预算

保留 `beep` 与合成兜底，新增 1 个、替换 4 个：

| 音色 id | 现有合成音色 | 建议 | 裁切目标 | 估算大小 |
| --- | --- | --- | --- | --- |
| `beep` | 正弦电子音 | **保留合成**（音高对比） | — | 0 |
| `mpc`（新） | — | MPC Metronome click | 22 ms，单声道 | ~2 KB |
| `woodblock` | 三角波+非谐分音 | Woodblock hard / med / soft | 3 × 100 ms | ~26 KB |
| `shaker` | 带通噪音 | Shaker-tube | 120 ms | ~10 KB |
| `mechanical` | 短噪音+三角波 | Fischer808 rim | 30 ms | ~3 KB |
| `cowbell` | 双方波+低通 | LP Cowbell | 200 ms | ~17 KB |
| （新）`claves` | — | Close claves | 120 ms | ~10 KB |

不含 `claves` 约 **58 KB**，含则约 **68 KB**（16-bit 单声道 WAV）。若嫌文件多，木鱼也可以只用 med 一条 + 增益派生三档，总量降到约 **41 KB**；但 hard/med/soft 三层的重音对比更自然，建议保留。

为什么保留 `beep`：它是唯一有明确音高的音色，练音准时比噪音型 click 更有用；MPC click 则是另一种「经典电子」风格，两者不冲突。若只想做最小改动，也可以只把 `woodblock` / `shaker` / `cowbell` 换成采样，`mechanical` 与 `beep` 不动。

命名建议：

```text
src/features/audio/samples/
  mpc-accent.wav  mpc-normal.wav  mpc-sub.wav
  woodblock-accent.wav  woodblock-normal.wav  woodblock-sub.wav
  shaker-accent.wav  shaker-normal.wav  shaker-sub.wav
  mechanical-accent.wav  ...
  cowbell-accent.wav  ...
```

> 也可以一个音色只放一条，用 `peakGain` 1.0 / 0.62 / 0.28 + 低通派生 accent/normal/sub。对木鱼这种力度层次明显的乐器，三层更值得。

## 接入方案（针对本仓库）

### 1. 素材格式统一

用 ffmpeg 一次性裁切、合并单声道、转 16-bit，并在结尾加 15 ms 淡出，避免截断爆音：

```bash
ffmpeg -i woodblock-hard.wav \
  -af "silenceremove=start_periods=1:start_threshold=-50dB,afade=t=out:st=0.085:d=0.015,volume=-1dB" \
  -t 0.1 -ac 1 -ar 44100 -sample_fmt s16 \
  src/features/audio/samples/woodblock-accent.wav
```

要点：

- `-ss` 放在 `-i` 前是快速定位但不够精确；这种 0.5 s 的文件直接 `silenceremove` 或手动 `-ss 0.002` 更稳。
- 不要用 `loudnorm`（短脉冲会被误判）；统一峰值到 -3 dBFS，再在代码里按 accent/normal/sub 调增益。
- 首尾各留 1–2 ms 静音可以，但不要留 5 ms 以上，否则每拍都有可感知延迟。

### 2. 加载与缓存

新增 `src/features/audio/sampleLibrary.ts`：

```ts
import type { ClickKind, TimbreId } from './timbres';
import woodblockAccent from './samples/woodblock-accent.wav?url';
import woodblockNormal from './samples/woodblock-normal.wav?url';
import woodblockSub from './samples/woodblock-sub.wav?url';
// ...其余音色同样用 ?url 导入

const URLS: Partial<Record<TimbreId, Record<ClickKind, string>>> = {
  woodblock: {
    accent: woodblockAccent,
    normal: woodblockNormal,
    sub: woodblockSub,
  },
  // ...
};

const cache = new Map<string, AudioBuffer>();

export async function preloadTimbre(ctx: BaseAudioContext, timbre: TimbreId): Promise<void> {
  const set = URLS[timbre];
  if (!set) return;
  await Promise.all(
    Object.values(set).map(async (url) => {
      if (cache.has(url)) return;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`sample ${url}: ${res.status}`);
      cache.set(url, await ctx.decodeAudioData(await res.arrayBuffer()));
    }),
  );
}

export function sampleFor(timbre: TimbreId, kind: ClickKind): AudioBuffer | undefined {
  const url = URLS[timbre]?.[kind];
  return url ? cache.get(url) : undefined;
}
```

- `?url` 导入会让 Vite 给文件名加 hash，命中现有 `/assets/*` 的 `immutable` 缓存；小于 4 KB 的文件还可能被内联成 base64。
- 只预加载「当前音色」的 1–3 条，不要启动时把全部采样都拉下来。
- `ensureRunning()` 里 `await preloadTimbre(ctx, this.timbre)`；失败时捕获并回退合成音，绝不能因为网络问题让节拍器不出声。

### 3. 播放层分支

在 `WebAudioMetronomeOutput.play()` 里：

```ts
const buffer = sampleFor(this.timbre, kind);
if (buffer) return this.playSample(ctx, master, at, buffer, kind);
return createClickVoice(ctx, master, at, specFor(this.timbre, kind));
```

`playSample` 用 `AudioBufferSourceNode` + 短增益包络，仍然在 `at` 精确启动，天然兼容现有 100 ms look-ahead：

```ts
const src = ctx.createBufferSource();
src.buffer = buffer;
const gain = ctx.createGain();
const peak = kind === 'accent' ? 1 : kind === 'normal' ? 0.62 : 0.28;
const release = Math.min(0.01, buffer.duration / 4);
gain.gain.setValueAtTime(0, at);
gain.gain.linearRampToValueAtTime(peak, at + 0.002);
gain.gain.setValueAtTime(peak, at + buffer.duration - release);
gain.gain.linearRampToValueAtTime(0, at + buffer.duration);
src.connect(gain).connect(destination);
src.start(at);
```

`cancel()` 时把 gain 快速拉到 0 并 `src.stop(now + 0.005)`；`onEnded` 沿用 `src.onended`，和 `ClickVoice` 的接口一致。

### 4. 与练习模式的关系

`MetronomeScheduler` 目前硬编码 `specFor('beep', ...)`，所以采样音色不会影响练习页。两种选择：

- **保持现状**：练习模式继续用合成 beep（轻、稳、零加载），独立节拍器用采样。改动最小。
- **统一音色**：把 `timbre` 传进 `MetronomeScheduler`，在 `start()` 里 `await preloadTimbre`，播放时同样分支。需要改 `PracticeProvider` 的初始化参数和偏好存储。

建议先做第一种，确认采样音色在独立节拍器上听感成立后，再决定是否统一。

### 5. 测试与验收

- 单测：`timbres.test.ts` 目前只断言每个 id 有 label，新增 id 后会自动覆盖；再补一条「无 buffer 时回退合成」的测试（jsdom 没有 `decodeAudioData`，把 loader 注入或 mock 掉）。
- 手动验收：
  1. 40 / 120 / 240 BPM 各听 30 秒，重音是否能分辨、细分是否太吵；
  2. 切换音色后下一拍立即生效，不重启循环（现有 `setTimbre` 语义）；
  3. 首次点击前是否有明显延迟（预加载是否生效）；
  4. 弱网/断网时是否回退到合成音而不是静音；
  5. 手机扬声器上是否还听得到（低频牛铃容易消失）；
  6. `DEPLOY_BASE=/musica/ npm run build` 后子路径下素材 200。

### 6. 授权与出处

CC0 不要求署名，但仍建议在仓库留一份 `docs/audio-credits.md`，记录：原始 URL、作者、授权、下载日期、做过的处理（裁剪/单声道/归一化）。这样以后换素材或有人质疑时能追溯。

## 落地顺序

1. 注册 Freesound，下载上表 A 组的 7 个文件（MPC、木鱼 ×3、沙锤、牛铃、响棒；atonal high/low 可先试听，作为 MPC 的替代）；B 组用 `curl` 直接拉。
2. 用 ffmpeg 裁切、单声道化、峰值归一，输出到 `src/features/audio/samples/`。
3. 新增 `sampleLibrary.ts`，改 `timbres.ts` 的 `TimbreId` / label（新增 `claves` 时）。
4. 改 `WebAudioMetronomeOutput`：`ensureRunning` 预加载、`play` 分支、`playSample` 实现与 `cancel`。
5. 补 `docs/audio-credits.md`，跑 `npm test && npm run build`。
6. 按上面的手动验收清单试听；不满意就回退到纯合成版本，或只保留效果最好的 1–2 个采样音色。

## 参考链接

- Freesound CC0 节拍器搜索：<https://freesound.org/search/?q=metronome+click&f=license%3A%22Creative+Commons+0%22>
- hollandm「Wood percussion」CC0 包：<https://freesound.org/people/hollandm/packs/38739/>
- Kringel samples（CC0，GitHub）：<https://github.com/Gradigang-Solutions/kringel-samples>
- VSCO 2 CE 打击乐（CC0）：<https://freesound.org/people/sgossner/packs/21028/>
- CC0 1.0 法律文本：<https://creativecommons.org/publicdomain/zero/1.0/>
- 项目内相关文件：`src/features/audio/click.ts`、`src/features/audio/timbres.ts`、`src/features/metronome/WebAudioMetronomeOutput.ts`
