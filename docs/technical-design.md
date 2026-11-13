# Musica 开发技术方案

文档版本：1.0  
更新日期：2026-11-14  
状态：首版已实现；本文描述目标设计，具体实现以代码与 README 为准。

## 1. 项目目标

构建一个供个人日常练琴使用的网站，支持五线谱、六线谱展示，用户可选择歌曲、调整 BPM、开启自动跟谱和有声节拍器。

核心体验：进入歌曲页 → 选择歌曲 → 设置速度与谱种 → 开始练习 → 乐谱随进度高亮并滚动 → 暂停或继续。

核心技术原则：**乐谱高亮、自动滚动、节拍器必须共享同一个练习时间轴。BPM 控制音乐进度，滚动跟随谱面位置，不将 BPM 换算为固定像素滚动速度。**

首版已按本文落地。以下目录、类型和接口与现有实现基本一致；与本文不一致时以代码为准。

## 2. 第一版范围

### 2.1 必须实现

| 模块 | 功能 |
| --- | --- |
| 首页 | 用途介绍、乐谱预览、功能说明、开始练习、最近练习入口 |
| 歌曲页 | 内置曲库、按歌名或作者搜索、切换歌曲、歌曲直达链接 |
| 谱面 | 五线谱、六线谱、双谱模式、缩放、自适应换行 |
| 练习 | 开始、暂停、继续、回到开头、结尾自动停止 |
| 速度 | 自定义 BPM，练习过程中修改速度 |
| 跟谱 | 当前小节高亮、纵向自动跟随、手动恢复跟随 |
| 节拍器 | 开关、音量、强弱拍 |
| 偏好 | 最近歌曲、每首歌的 BPM、谱种和缩放、全局声音设置 |
| 适配 | 桌面、平板、手机基本可用 |

### 2.2 后续版本

账号、后台管理、云同步、用户上传、在线编辑、PDF/图片识谱、乐器音色播放、录音评分、A/B 循环、复杂反复演奏、复合拍子的自定义重音分组。

第一版只有节拍器声音，因此按钮使用“开始练习”，避免让用户误以为会播放歌曲。

### 2.3 音乐语义约定

1. BPM 表示每分钟四分音符数；界面明确标注“♩ = BPM”。
2. 用户 BPM 覆盖曲谱原有速度变化，整首采用固定练习速度。
3. 默认每个四分音符响一次，小节首拍为强拍；有拍号变化时，按各小节边界重新确定重音。
4. 6/8 等复合拍在首版仍使用上述四分音符单位，不自动切换为附点四分音符主拍。
5. 第一版曲库仅收录线性练习谱。反复、房子、D.C.、D.S.、Coda 等结构应在入库前展开并重新导出，使渲染顺序与练习顺序一致。
6. 弱起和不完整小节使用实际时值，保留其在完整节拍网格中的偏移，不能机械补足小节。
7. 六线谱显示依赖正确的弦号、品位和定弦。不能保证从仅含音高的五线谱自动生成合理指法。
8. 如检测到不支持的结构，允许静态阅读，但禁用练习并明确原因，不静默忽略。

## 3. 技术选型

| 层次 | 技术 | 职责 |
| --- | --- | --- |
| 页面 | React + TypeScript | 组件、交互、类型约束 |
| 构建 | Vite | 开发服务器、静态构建 |
| 路由 | React Router | 首页、歌曲页和歌曲链接 |
| 乐谱 | alphaTab | 导入、解析、谱面渲染、布局坐标 |
| 音频 | Web Audio API | 节拍器与统一音频时钟 |
| 状态 | React Context + reducer | 低频界面状态及操作分发 |
| 保存 | localStorage | 轻量偏好数据 |
| 测试 | Vitest + Playwright | 时间逻辑与主要页面流程 |

alphaTab 作为首选引擎，须先用真实目标曲谱验证。第一版仅启用解析与渲染，不启用其播放器，避免与自建时间轴并存。无需为节拍器加载乐器 SoundFont。

技术验证通过后锁定依赖版本并提交 lockfile。以所安装版本的类型声明和对应官方文档为准，不混用不同版本的 API。若双谱或目标文件无法正确显示，应在技术验证阶段调整方案，不等到页面完成后处理。

## 4. 页面与交互

### 4.1 路由

| 路径 | 内容 |
| --- | --- |
| `/` | 首页 |
| `/songs` | 歌曲页，未选择歌曲 |
| `/songs/:songId` | 同一歌曲页，加载指定歌曲 |

未知路径展示返回首页入口。未知歌曲 ID 展示“未找到歌曲”，不要默默切换为其他歌曲。

### 4.2 首页

从上至下展示导航、简短介绍、开始练习按钮、真实乐谱预览、三项核心功能、最近练习入口。

最近歌曲存在且仍在曲库时显示“继续练习”；进入后从曲首开始。首次使用时显示“选择歌曲”。

### 4.3 歌曲页

```text
┌──────────────────────────────────────────────────┐
│ 网站名称                              首页 / 歌曲 │
├──────────────┬───────────────────────────────────┤
│ 搜索歌曲      │ 歌名、作者、原速、拍号             │
│              │ 谱种、缩放、跟随开关               │
│ 歌曲列表      ├───────────────────────────────────┤
│              │                                   │
│              │             乐谱区域              │
│              │                                   │
├──────────────┴───────────────────────────────────┤
│ 开始 / 暂停  回到开头  BPM  节拍器  音量  全屏    │
└──────────────────────────────────────────────────┘
```

- 桌面歌曲列表宽度建议约 260px，乐谱占据剩余空间。
- 曲库和乐谱使用独立滚动容器；页面外壳避免产生第三层滚动。
- 底部固定控制栏，谱面留足底部空间，手机考虑安全区域。
- 窄屏把曲库收进抽屉，优先保留开始/暂停、BPM、节拍器，其他设置折叠。
- 默认纵向换行，整页不出现水平溢出。极小屏且最高缩放下允许谱面局部横向滚动。
- 使用暖白背景、深灰文字、一种强调色；谱面保持白底黑谱。
- 加载时保留页面框架并禁用练习按钮；空列表显示明确提示。
- 所有按钮提供文字或可访问名称；支持键盘焦点和可见的焦点样式。
- 空格可控制开始/暂停，但焦点在输入框、按钮、链接等可交互控件上时不拦截空格。
- 全屏能力不可用时隐藏入口或降级为页面内专注模式，不阻断练习。

### 4.4 控制规则

| 操作 | 行为 |
| --- | --- |
| 开始练习 | 就绪后从当前位置推进；节拍器开启则发声 |
| 暂停 | 保留准确位置，停止后续声音 |
| 继续 | 从保留位置建立新的时间锚点 |
| 回到开头 | 停止并归零，谱面回到顶部 |
| 修改 BPM | 位置连续，取消旧速度下的待播放声音并重排 |
| 关闭节拍器 | 只关闭声音，音乐进度继续 |
| 打开节拍器 | 从下一个合法节拍开始，不补播过去节拍 |
| 切歌 | 停止旧练习，加载新谱并从头开始 |
| 到达结尾 | 自动停止，保留结束位置；再次开始从头练习 |
| 切换谱种/缩放/屏幕方向 | 暂停，保留位置，重排后等待用户继续 |
| 页面隐藏或音频中断 | 自动暂停，返回后等待用户继续 |

BPM 接受 30～240 的整数，步长 1。输入过程允许暂时为空，失焦或确认时校验并提交；非法输入提示范围，保留上一个有效值。

## 5. 架构和目录

```text
SongRepository → ScoreAdapter → TimelineBuilder
                      │               │
                 布局坐标        PracticeTransport
                      │          ├─ MetronomeScheduler
                      └──────────├─ HighlightController
                                 └─ ScrollController
```

React 负责界面展示、发出命令和消费低频状态。时间计算、声音队列、动画循环由独立 TypeScript 模块负责。

```text
src/
  app/
    App.tsx
    router.tsx
  pages/
    HomePage.tsx
    SongsPage.tsx
  features/
    songs/
      SongList.tsx
      SongSearch.tsx
      songRepository.ts
      types.ts
    score/
      ScoreViewer.tsx
      ScoreToolbar.tsx
      AlphaTabAdapter.ts
      types.ts
    practice/
      PracticeControls.tsx
      PracticeTransport.ts
      TimelineBuilder.ts
      MetronomeScheduler.ts
      HighlightController.ts
      ScrollController.ts
      PracticeProvider.tsx
      types.ts
    preferences/
      preferenceRepository.ts
      types.ts
  shared/
    components/
    styles/
    utils/
public/
  songs/
    index.json
    practice-001/
      score.musicxml
tests/
  fixtures/
  unit/
  e2e/
docs/
  technical-design.md
```

### 5.1 模块职责

| 模块 | 职责与边界 |
| --- | --- |
| SongRepository | 读取和校验歌曲清单、请求曲谱；不操作界面 |
| ScoreAdapter | 封装引擎加载、解析结果、模式、缩放、坐标与销毁 |
| TimelineBuilder | 构建音乐时间轴；不读取 DOM，不依赖像素尺寸 |
| PracticeTransport | 唯一进度源，处理状态、锚点和变速 |
| MetronomeScheduler | 将音乐节拍映射到音频时间并安排声音 |
| HighlightController | 将音乐位置映射到小节高亮 |
| ScrollController | 判断可见区并调整乐谱容器滚动 |
| PreferenceRepository | 读写、校验、迁移本地数据 |

禁止在多个组件中独立创建节拍器，禁止以 React 渲染次数推进时间。

## 6. 曲库与数据契约

### 6.1 歌曲清单

```ts
type ScoreView = 'standard' | 'tablature' | 'both';

interface SongMetadata {
  id: string;
  title: string;
  artist?: string;
  scoreUrl: string;
  format: 'musicxml' | 'guitar-pro';
  defaultBpm: number;
  defaultTrackIndex: number;
  availableViews: ScoreView[];
  practiceStructure: 'linear';
}

interface SongManifest {
  schemaVersion: 1;
  songs: SongMetadata[];
}
```

```json
{
  "schemaVersion": 1,
  "songs": [
    {
      "id": "practice-001",
      "title": "练习曲一",
      "artist": "示例作者",
      "scoreUrl": "songs/practice-001/score.musicxml",
      "format": "musicxml",
      "defaultBpm": 80,
      "defaultTrackIndex": 0,
      "availableViews": ["standard", "tablature", "both"],
      "practiceStructure": "linear"
    }
  ]
}
```

`scoreUrl` 约定相对于应用部署根目录，通过统一资源函数与 Vite 的 `BASE_URL` 解析，不能硬编码为域名根目录。清单同理。

第一版一次展示一个预设练习音轨；不额外实现多音轨混音及选择器。曲库声明和解析模型必须同时校验，不能仅相信 `availableViews` 或 `practiceStructure` 字段。

### 6.2 入库流程

1. 准备有使用权的 MusicXML 或引擎支持的 Guitar Pro 文件。
2. 如有复杂反复结构，先在制谱工具中展开为线性版本。
3. 校验默认音轨、拍号、小节实际时值、弱起和定弦。
4. 验证三种声明的显示模式；不具备数据的模式不得声明支持。
5. 检查桌面和手机宽度下的换行与谱面清晰度。
6. 验证首拍、跨行位置和结束时间后，加入清单。

曲谱是唯一音乐结构来源，不手工维护另一份重复的小节时间 JSON，避免谱面与练习数据失配。

## 7. 乐谱引擎适配层

以下接口是本项目设计的业务接口，不是 alphaTab 的原生接口。

```ts
interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ScoreAdapter {
  load(song: SongMetadata, signal?: AbortSignal): Promise<void>;
  setView(view: ScoreView): Promise<void>;
  setZoom(scale: number): Promise<void>;
  getTimelineSource(): TimelineSource;
  getBarRect(barId: string): Rect | null;
  onLayoutChanged(listener: () => void): () => void;
  destroy(): void;
}
```

`TimelineSource` 是适配层导出的、独立于引擎类的结构，包含已选音轨的小节 ID、拍号、实际时值、弱起偏移和不支持特征。时值来源于所安装版本的解析模型，转换细节封装在适配层。

实现要求：

- 在 React 挂载后初始化实例，在卸载时销毁；验证 Strict Mode 的重复挂载不会留下实例。
- `load` 在解析和首次可用布局完成后才算成功。
- 等待引擎渲染完成事件后读取布局坐标。
- alphaTab 的 `boundsLookup` 提供谱面布局查询；结合所选音轨建立稳定小节 ID 到矩形的映射。
- 坐标统一为乐谱内容容器内的像素坐标，不混用屏幕坐标和滚动坐标。
- 缩放、换谱种、宽度变化后旧布局映射失效，重建后发布布局变更事件。
- 坐标暂不可用时跳过高亮和滚动，不能据此推进或修改音乐时间。
- 首版只需要小节级坐标，不为逐音符精度开启额外采集。
- 字体、Worker 等资源按当前版本的 Vite 官方集成方式配置，验证构建产物中的资源路径。

## 8. 音乐时间轴

### 8.1 坐标单位

内部使用四分音符单位 `quarter`，不要把谱面的拍对象数量当作拍数。和弦、多声部、休止和连音都可能导致这种计数不正确。

```ts
interface PracticeClick {
  id: string;
  quarter: number; // 全曲绝对音乐位置
  accent: boolean;
}

interface PracticeBar {
  id: string;
  sourceBarIndex: number;
  startQuarter: number;
  durationQuarter: number;
  numerator: number;
  denominator: number;
  clicks: PracticeClick[];
}

interface PracticeTimeline {
  bars: PracticeBar[];
  durationQuarter: number;
}
```

构建规则：

1. 按线性小节顺序累加开始位置。
2. 完整小节时值为 `numerator * 4 / denominator`。
3. 不完整小节使用实际时值；多声部并行，不能将各声部长度相加。
4. 缺省拍号从前一小节继承；首小节缺少有效拍号且无法确定时拒绝练习。
5. 节拍位置按小节节拍网格生成，不依赖是否存在发声音符；休止小节也必须有节拍。
6. 弱起按完整小节内的相位生成合法节拍，不把弱起起点默认标成强拍。
7. 当前小节使用左闭右开区间 `[startQuarter, endQuarter)`；总终点独立处理。
8. 拍号导致小节长度不是整数四分音符时，节拍在小节边界重新对齐，边界强拍仅生成一次。
9. 用二分查找定位小节；浮点误差采用统一且足够小的容差处理，不逐帧累加时值。

### 8.2 时间换算

```text
secondsPerQuarter = 60 / bpm
quarter = anchorQuarter + (audioTime - anchorAudioTime) * bpm / 60
audioTime = anchorAudioTime + (quarter - anchorQuarter) * 60 / bpm
```

验证示例：

| BPM | 拍号 | 完整小节时长 |
| --- | --- | --- |
| 60 | 4/4 | 4 秒 |
| 120 | 3/4 | 1.5 秒 |
| 60 | 6/8 | 3 秒，遵守首版四分音符单位约定 |

## 9. 练习状态和时间推进

### 9.1 状态

```ts
type ScoreStatus = 'idle' | 'loading' | 'ready' | 'error';
type TransportStatus = 'stopped' | 'playing' | 'paused' | 'finished';

interface TransportAnchor {
  audioTime: number;
  quarter: number;
  bpm: number;
}

interface PracticeSettings {
  bpm: number;
  metronomeEnabled: boolean;
  metronomeVolume: number; // 0～1
  autoFollow: boolean;
  view: ScoreView;
  zoom: number;
}
```

加载状态与练习状态分开管理。只有加载就绪、时间轴有效、音频时钟可用时才能开始。快速重复点击开始须幂等，不能创建多个循环。

### 9.2 操作顺序

开始或继续：

1. 在用户交互中创建或恢复共享 `AudioContext`。
2. 确认恢复成功，读取当前保存位置。
3. 建立音频时间与音乐位置锚点；如预留短启动缓冲，声音与画面使用同一未来锚点，锚点前保持原位置。
4. 启动调度检查和画面循环，设置 `playing`。

暂停：

1. 按当前音频时间计算并保存音乐位置。
2. 清除调度定时器、画面循环和所有待播放声音。
3. 设置 `paused`，保留高亮。

修改 BPM：

1. 在同一个音频时间点计算旧速度下的位置。
2. 取消旧速度下尚未发生的节拍。
3. 以该位置和新速度建立锚点。
4. 从后续合法节拍重建调度，不重复已经发生的节拍。

时间轴对外仅允许有序命令。异步音频恢复期间如果切歌或卸载，使用会话编号使旧操作失效。

### 9.3 生命周期

- 页面隐藏时自动暂停；返回前台不自动继续。
- 音频上下文被系统中断时同步暂停练习。
- 关闭节拍器不暂停共享时钟，只取消声音队列。
- 结束时将位置限制在总时值，取消超过终点的声音，避免越界响拍。
- 切歌、重置、退出歌曲页均使旧调度会话失效。

## 10. 节拍器调度

使用一个共享 `AudioContext`，采用短合成声音：

```text
OscillatorNode → GainNode（单次包络）→ MasterGain → destination
```

| 参数 | 初始建议 |
| --- | --- |
| 强拍频率 | 1000 Hz |
| 弱拍频率 | 700 Hz |
| 声音时长 | 30～50 ms |
| 默认音量 | 0.3 |
| 调度检查间隔 | 约 25 ms |
| 提前调度窗口 | 约 100 ms |

参数需通过实际听感调整。包络使用短渐入和衰减，避免切断波形造成爆音。

调度器伪代码：

```text
每次检查：
  now = audioContext.currentTime
  horizon = now + lookAhead
  依次读取下一个尚未调度的节拍
  将节拍音乐位置换算为 audioTime
  如果时间在窗口内且尚未过期，安排声音
  如果晚到，跳过过期节拍，不集中补播
  如果明显超出允许延迟，暂停本次练习
```

实现注意：

- 定时器只负责提前安排，不能在定时器回调中直接发出“此刻的一拍”。
- 记录节点、计划开始时间、节拍 ID 和调度会话编号。
- 节拍按 ID 去重；暂停、变速后保留必要的已发声边界，避免重复响同一拍。
- 已安排到音频线程的节点必须显式停止，不能仅清除 JavaScript 定时器。
- 停止或变速时，短包络平滑终止正在发声的节点，并取消未来节点。
- 节点结束后断开连接并移出集合。
- 调整音量通过 `MasterGain` 平滑变化；关闭后再开启只播放下一个合法节拍。
- 可先将 200 ms 作为明显超时的检测起点，通过压力测试调整；恢复时由用户重新继续。

`AudioContext.currentTime` 用作统一时间基准。若有设备输出延迟导致固定声画偏差，先记录测量结果，必要时在视觉层补偿，不修改音乐时长来掩盖延迟。

## 11. 高亮和自动滚动

### 11.1 高亮

画面使用 `requestAnimationFrame` 读取统一进度，只有当前小节变化时更新高亮。覆盖层绝对定位，设置 `pointer-events: none`，不参与谱面排版。

不在每一帧更新整个 React Context。高亮可通过局部状态或独立覆盖层更新，工具栏进度显示可降低刷新频率。

### 11.2 跟随

1. 根据当前小节布局确定所在谱行。
2. 当前谱行仍在可阅读区内时保持位置。
3. 接近底部安全边界时平滑滚动到目标行。
4. 同一目标行不重复启动滚动动画。
5. 目标范围扣除顶部工具栏和底部控制栏占用。
6. 用户用滚轮、触摸或拖动滚动条主动浏览时暂停自动跟随，显示“恢复跟随”。
7. 区分程序触发滚动与用户操作，不把自动滚动事件误判为用户干预。
8. 用户偏好减少动态效果时使用即时定位或更短动画。

缩放、谱种切换、容器宽度或方向变化时，暂停并保存音乐位置，等待重排，重建坐标，恢复高亮后等待继续。

## 12. 本地存储

```ts
interface StoredPreferences {
  version: 1;
  lastSongId?: string;
  global: {
    metronomeEnabled: boolean;
    metronomeVolume: number;
    autoFollow: boolean;
  };
  songs: Record<string, {
    bpm: number;
    view: ScoreView;
    zoom: number;
    updatedAt: number;
  }>;
}
```

建议键名：`musica.preferences.v1`。

- 每首歌保存 BPM、谱种、缩放；全局保存声音和跟随偏好。
- 第一版不恢复演奏位置，重新打开从头开始。
- 读取时校验结构、数值范围及谱种支持情况；损坏数据回退默认值。
- 写入失败不阻断练习，当前会话继续使用内存状态。
- 不保存曲谱二进制、DOM 或引擎对象。
- 不在每帧写入；设置提交后保存，滑块连续操作可合并写入。

## 13. 并发、错误和资源清理

### 13.1 快速切歌

歌曲请求使用 `AbortController`。每次加载递增请求编号，在解析完成、布局完成和状态提交前核对编号。即使引擎解析无法中断，过期结果也不能覆盖当前歌曲。

切换顺序：停止旧练习 → 使旧请求与回调失效 → 请求新曲 → 解析和布局 → 构建时间轴 → 恢复该曲设置 → 标记就绪。

### 13.2 错误反馈

| 情况 | 处理 |
| --- | --- |
| 曲库请求失败 | 显示重试入口 |
| 未知歌曲 | 提供返回列表入口 |
| 曲谱请求或解析失败 | 显示重试、切歌入口 |
| 字体或 Worker 加载失败 | 显示加载失败；开发日志保留具体路径 |
| 谱种不支持 | 禁用对应选项并解释 |
| 音乐结构不支持 | 允许静态读谱，禁用练习并说明 |
| 音频启动失败 | 保留读谱，提供重试声音入口 |
| 偏好读取/写入失败 | 回退默认值或使用内存状态 |

产品界面只显示用户可理解的信息，技术堆栈、资源 URL 和异常详情留给开发日志。

### 13.3 清理清单

退出歌曲页或销毁会话时清理：定时器、动画帧、待播放音频节点、观察器、页面事件、引擎事件、加载请求和引擎实例。共享音频上下文的生命周期由统一管理器负责，不由各按钮单独创建和关闭。

## 14. 性能要求

- 歌曲页及乐谱引擎按路由延迟加载。
- 曲库搜索不触发谱面重建。
- BPM、音量、节拍器开关不触发谱面重排。
- 同时仅保留一套有效练习调度和一个活动乐谱实例。
- 使用 `ResizeObserver` 合并尺寸变化，实际尺寸不变时不重排。
- 谱面布局与音乐时间轴独立，重排不能改变曲子总时值。
- React 只订阅低频状态，实时锚点和声音队列保留在独立类中。
- 长曲谱先测量再决定是否引入引擎的分块渲染；首版不要自行叠加未经验证的虚拟列表。

## 15. 测试与验收

### 15.1 验证曲谱

至少准备：简单五线谱、简单六线谱、包含多行的双谱；另准备弱起、休止小节、拍号变化和不支持结构的测试样本。测试样本应随仓库提交并注明来源。

### 15.2 单元测试

- 固定 BPM 的时间与音乐位置双向换算。
- 小节左闭右开边界和终点处理。
- 多声部小节时长、弱起和拍号变化。
- 暂停、继续和变速后的锚点连续性。
- 节拍生成、相位、边界去重及休止小节。
- 取消待播放声音、过期会话失效和结束清理。
- 损坏偏好、非法数值和不支持的谱种回退。

时间和音频调度依赖通过接口注入，使测试能控制时钟。单元测试验证计划时刻及节点取消，不能替代真机声音验收。

### 15.3 端到端测试

- 首页进入歌曲页、搜索和选择歌曲。
- 歌曲直达链接及刷新。
- 开始、暂停、继续、修改 BPM、回到开头。
- 快速切歌后没有旧谱覆盖及旧声音残留。
- 谱种和缩放切换后位置保留。
- 设置刷新后恢复。
- 加载失败和重试。
- 窄屏布局与基本键盘操作。

### 15.4 验收矩阵

| 场景 | 标准 |
| --- | --- |
| 60 BPM、4/4 | 每四分音符 1 秒，完整小节 4 秒 |
| 120 BPM、3/4 | 完整小节 1.5 秒 |
| 60 BPM、6/8 | 完整小节 3 秒，遵守约定单位 |
| 弱起 | 实际时长和首个节拍相位正确 |
| 连续练习 | 前台正常负载 5 分钟，无累计漂移、漏拍或重复声 |
| 暂停/继续 | 位置连续，不重复刚发生的节拍 |
| 中途变速 | 当前进度不跳变，未来节拍使用新速度 |
| 关闭声音 | 声音停止，跟谱继续 |
| 重排 | 音乐位置不变，高亮重新对齐 |
| 到达结尾 | 自动停止，没有终点外的声音 |
| 页面隐藏 | 自动暂停，返回后不自动开始 |
| 主线程压力 | 不集中补播漏掉的节拍，超时策略有效 |

至少在桌面 Chrome、Safari 和一台实际手机上验收。将声画偏差约 100 ms 作为初期检查目标，用录屏/录音或外部记录确认实际表现。该值是项目目标，不是浏览器或依赖的保证。设备固定输出延迟、蓝牙延迟和主线程视觉卡顿分别记录。

## 16. 开发阶段与完成条件

| 阶段 | 工作 | 进入下一阶段的条件 |
| --- | --- | --- |
| 1. 技术验证 | 建立项目，真实曲谱渲染，双谱、坐标、字体和生产资源验证 | 三份目标曲谱可显示，能提取时值和小节矩形 |
| 2. 页面框架 | 首页、歌曲页、路由、搜索、响应式布局 | 能从首页打开歌曲，直达和刷新可用 |
| 3. 时间轴 | 模型适配、状态、BPM、暂停继续和结束处理 | 时间换算及关键边界测试通过 |
| 4. 跟谱 | 小节高亮、滚动、重排和恢复跟随 | 多行长谱可正确跟随，位置与布局解耦 |
| 5. 音频 | 节拍器、取消、变速重调度、系统中断 | 真机练习验证通过，无旧声音残留 |
| 6. 完善 | 本地偏好、错误处理、并发切歌、部署与文档 | 首版验收矩阵通过 |

第一阶段先打通“真实曲谱 → 音乐时间轴 → 谱面小节坐标”。若解析模型无法可靠提供弱起或目标曲谱结构，应在该阶段调整支持范围或引擎选择。

## 17. 构建和部署

采用静态部署，首版无需服务器或数据库。开发者建立以下脚本并在 README 中记录：

```text
npm run dev          本地开发
npm run build        类型检查和生产构建
npm run preview      本地预览生产产物
npm run test         单元测试
npm run test:e2e     端到端测试
```

这些命令已随项目建立，具体用法见 `README.md`。

部署实现要点（与上面第 17 节要求对应）：

- `vite.config.ts` 的 `base` 由 `DEPLOY_BASE` 决定，默认 `/`；绝不使用相对 `./`，否则 history 路由深链下相对资源 URL 会解析到 `/songs/assets/...` 而 404。
- React Router 的 `basename` 取自 `import.meta.env.BASE_URL`，使子路径部署的链接与深链一致。
- alphaTab 的 `core.fontDirectory` 显式设为 `${BASE_URL}font/`：默认它会从自身打包分块（`/assets/alphaTab.core-*.js`）推导字体目录，生产环境会得到不存在的 `/assets/font/`。
- 回退与缓存规则落在 `deploy/nginx.conf`、`netlify.toml`、`vercel.json`：路由回退到 `index.html`，静态资源缺失返回真 404。

部署要求：

- 使用 HTTPS。
- 配置 SPA 回退，直接打开 `/songs/:songId` 时返回应用入口。
- 静态资源请求缺失时应正常返回 404，避免误返回 HTML 后被当成乐谱或 Worker 解析。
- 资源 URL 支持根目录和子路径部署。
- 验证字体、Worker、曲谱和清单能在生产环境加载。
- 检查缓存策略：带内容哈希的构建文件可长期缓存，清单和未带哈希的曲谱须可更新。

交付前记录实际依赖版本、支持格式、已知限制、曲库入库流程、自动测试结果和真机验收结果。

## 18. 官方参考资料

以下资料用于实现核对，最终调用以锁定版本为准：

- [alphaTab：曲谱导入](https://www.alphatab.net/docs/features/import-load/)
- [alphaTab：Web 项目安装](https://www.alphatab.net/docs/getting-started/installation-web-projects)
- [alphaTab：谱表显示模式](https://docs.alphatab.net/docs/reference/settings/display/staveprofile)
- [alphaTab：布局坐标查询](https://www.alphatab.net/docs/features/interact/bounds-lookup)
- [alphaTab：配置参考](https://www.alphatab.net/docs/reference/settings)
- [MDN：Web Audio 提前调度示例](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Advanced_techniques)
- [MDN：AudioContext 时间基准](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/currentTime)
