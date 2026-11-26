# 余烬纪 · OMEGA CHRONICLE

一个末日生存题材的**文字冒险**网页原型，参考《明日之后》的世界观和《饿殍》这类剧本杀式阅读体验。

> 文明熄灭的第五年，铁轨还在响。

## 怎么打开

**在线版（GitHub Pages）**：<https://wanschan.github.io/LifeAfter/>

本地：直接双击根目录的 `index.html` 就能玩（无需安装任何东西，贴图已内联）。
如果浏览器限制本地文件，在项目根目录开一个本地服务：

```bash
cd LifeAfter
python -m http.server 8848
# 然后打开 http://127.0.0.1:8848
```

Windows 也可以双击 `打开游戏.bat`。

> 网页入口 `index.html` 和 `assets/` 就放在仓库根目录，
> 所以 GitHub Pages 选 `main` 分支 + `/ (root)` 即可直接部署，不用再配子目录。

## 目前做到了什么

| 模块 | 状态 |
|---|---|
| 标题页 / 序章（文字版背景动画） | ✅ |
| 旧大陆四境 **3D 实时地形**大地图（拖拽 / 缩放 / 点地标出卡） | ✅ |
| 剧本详情页（大字标题 + 开场摘录 + 时长/难度） | ✅ |
| 序章剧情 → 第一幕，章节卡转场 | ✅ |
| 子地图（5 个地点），条件解锁 | ✅ |
| 文字冒险正文（打字机、点击跳过、键盘 1-9 选项） | ✅ |
| 状态系统：体力 / 精神 / 物资 / 信用 / 隐性感染 | ✅ |
| 道具与线索档案 | ✅ |
| 3 个手动存档槽 + 自动存档 + 继续游戏 | ✅ |
| 8 个结局（含 3 个 Death End） | ✅ |
| 移动端适配 | ✅ |
| 地图顶栏 **世界 / 地区** 两态切换 | ✅ |
| 剧本杀「地区」列表 + 票据入场动画 + 剧本开始页 | ✅ |
| 剧本杀《西下城区》· 三幕 · 12 条线索 · 双结局 | ✅ |
| 剧本杀线索 / 人物屏 | ✅ |

**西陆平原**是完整可玩的一章；北陆高原、孤山、南印洲目前只有设定页和入口（"剧本封存中"）。

**剧本杀模块**：地图页顶栏切到「地区」能看到维兰索尔三处地点
（西下城区 / 大礼拜堂 / 四方驿站），点进去是撕票根 + 盖章的入场动画，
落点是「剧本开始」页。

其中 **《西下城区》已经能玩**：三幕、12 条线索、5 个嫌疑人、两套结局。
DM 是本地规则引擎（`assets/js/drama.js`），输入的动作用 `keys` 最长匹配判定，
不需要联网、不需要 API key。另外两处仍是「剧本筹备中」。

想让 DM 说话不那么死板，可以接云端改写（可选，不影响判定）：

```js
window.Drama.setRemote('https://<ENV_ID>.service.tcloudbase.com/drama-dm');
```

云函数在 `cloudfunctions/drama-dm/`，清单与部署命令见
`docs/云端准备-剧本杀AI.md`。断网或报错会自动退回本地原文。

想换 / 加剧本只改 `assets/js/drama-data.js`，引擎不动。

## 一条主线怎么走

```
七道调车场（强制开场）
   ├─ 快乐 101  · 锈秤交易所   → 柯兰、路税、悬赏板、老太太
   ├─ 远星城 · 旧百货          → 秤爷、黑市、信号房钥匙
   ├─ 七号隧道                 → 需要钥匙或白雨衣；台账、道岔杆
   └─ 三号月台                 → 终局，5 选 1
```

### 结局表

| 结局 | 触发条件 | 意味 |
|---|---|---|
| 准点到达 | 写过报告 或 与柯兰结盟 | 真相被归档，列车继续跑 |
| 第四十七个签名 | 接下柯兰的班 | 你成为下一个签收人 |
| 脱轨 | 隧道里把道岔压到底 | 断掉环线，被通缉，逃往孤山 |
| 货四十八 | 坐到第 47 个座位 | 成为新样本 |
| 末班 | 什么都不做，转身走 | 活下来了，什么都没变 |
| 体力耗尽 / 精神崩解 / 归巢 | 对应数值归零 | Death End |

隐藏线索链：**铜票是谁给的 → 队长为什么没上车 → "名单外"是什么意思 → 归巢**。四条都摸到，终局会多出「让它在纸上死一次」这个选项。

## 文件结构

```
LifeAfter/                    ← 仓库根目录，也是静态站点根目录
├── index.html              页面骨架
├── assets/
│   ├── css/app.css         全部样式（暗色 · 电影感）
│   ├── js/data.js          ★ 全部剧情 + 四个区域的入口数据
│   ├── js/scenes.js        25 张分场插画 ↔ 剧情节点映射
│   ├── js/region.js        剧本杀：世界/地区切换、剧本列表、票据入场动画
│   ├── js/drama-data.js    ★ 剧本杀剧本数据（幕 / 线索 / 人物 / 结局）
│   ├── js/drama.js         ★ 剧本杀引擎：规则 DM、线索面板、存档、云端改写开关
│   ├── js/game.js          引擎：状态机 / 打字机 / 存档 / 地图UI
│   ├── map3d/map3d.js      three.js 场景：位移地形 + 海面 + 云 + 悬浮地标
│   ├── map3d/tex.js        地形贴图 / 高度图 / 云贴图（内联 base64，离线可用）
│   ├── map3d/three.min.js  本地 three.js r128
│   ├── map3d/atlas-bake.html  手绘纸图的 SVG 源（只用于烘焙，不参与运行）
│   └── img/                区域插画 + 分场插画 + 纸图位图
├── 打开游戏.bat            双击即用浏览器打开 index.html
├── CHANGELOG.md            版本公告（26w46a 等）
├── docs/                   剧情文本 / 生图脚本
├── cloudfunctions/drama-dm/  可选：AI DM 改写云函数（不接也能玩）
├── scripts/
│   ├── publish_github.py   发布到 GitHub
│   ├── bake_atlas.py       ★ 重建手绘纸图 assets/img/atlas.webp
│   ├── arkweb_devtools.js  ★ 对设备上的 ArkWeb 页面执行 JS
│   └── build_harmony_html.py  ★ 生成鸿蒙专用的自包含 HTML
├── AppScope/               鸿蒙应用全局配置（应用名 / 图标 / 包名）
└── entry/                  ★ 鸿蒙 ArkTS 工程
    └── src/main/
        ├── ets/pages/Index.ets        ArkWeb 承载页 + 返回键桥接
        ├── ets/entryability/...       沉浸式全屏设置
        └── resources/rawfile/
            └── index.html             由 build_harmony_html.py 生成，勿手改
```

## 鸿蒙应用

同一个游戏已经打包成 HarmonyOS 应用：用 **ArkWeb** 承载整套网页，
剧情、3D 地形、25 张分场插画、存档全部原样保留，不是另写一套简化版。

**核心做法**：`scripts/build_harmony_html.py` 把根目录的 `index.html`、
CSS、6 个 JS、纸图位图、4 张区域图和 25 张插画全部内联成一个 4.42 MB 的自包含 HTML，
写到 `entry/src/main/resources/rawfile/index.html`。运行时零外部请求，
所以不需要网络就能玩，也避开了 rawfile 相对路径的坑。

打包时还会做三件鸿蒙专用的事：

- 关掉 `backdrop-filter` / `mix-blend-mode` / 大尺寸投影滤镜
  （软件渲染下每个都会多开一张整屏渲染表面，贴图内存一超限，Chromium 就整条内容不画）；
- 注入 `window.__HM_NO_XFADE = true`，背景切换走单层直切
  （两层全屏图叠加会丢下半屏 tile，图片已预解码，直切不黑帧）；
- 分场插画与区域图按 1100 宽重新编码，解码内存减半。

**手绘纸图**是预烘焙位图 `assets/img/atlas.webp`，SVG 源在
`assets/map3d/atlas-bake.html`。换图跑：

```bash
python scripts/bake_atlas.py
```

**改了网页之后**，重新生成一次：

```bash
python scripts/build_harmony_html.py
```

**命令行编译**（无需打开 DevEco Studio）：

```bash
cd LifeAfter
export DEVECO_SDK_HOME="D:/Huawei/DevEco Studio/sdk"
"D:/Huawei/DevEco Studio/tools/node/node.exe" \
  "D:/Huawei/DevEco Studio/tools/hvigor/bin/hvigorw.js" \
  assembleHap --mode module -p product=default -p buildMode=debug --no-daemon
```

产物在 `entry/build/default/outputs/default/entry-default-unsigned.hap`。
这是**未签名**包，只能在 DevEco 模拟器上安装；真机需要在 DevEco Studio 里配置签名。

**返回键**：网页侧注入了 `window.__appBack()`，按弹窗 → 结局页 → 子地图 →
剧本页 → 游戏内的顺序逐层回退，到标题页再按才退出应用。

**真机/模拟器调试**：ArkWeb 没有 adb 式入口，靠 DevTools socket 转发。
`scripts/arkweb_devtools.js` 是对着转发端口执行 JS 的小工具：

```bash
hdc shell ps -ef | grep <包名>            # 拿到 webview 进程 pid
hdc fport tcp:9222 localabstract:webview_devtools_remote_<pid>
node scripts/arkweb_devtools.js "window.__diag()"
node scripts/arkweb_devtools.js "document.querySelectorAll('.mk')[1].click(); 'ok'"
```

只用 `Runtime.evaluate`。`Page.captureScreenshot` 在 ArkWeb 上会把连接掐断，
截图请走 `hdc shell snapshot_display`（输出的是物理像素，点按坐标要按
`物理宽/CSS 宽` 的比例换算，模拟器上约 2.875）。

## 部署静态网站

仓库根目录已经有 `index.html`，资源全是相对路径 `assets/...`，
所以 GitHub Pages 直接可用：仓库 **Settings → Pages → Build and deployment**
选 `Deploy from a branch` → `main` / `/ (root)` → Save。

项目站点的路径是 `https://wanschan.github.io/LifeAfter/`（子路径），
因为所有引用都是相对路径，不会受子路径影响。推送新内容后 Pages 会自动重建。

## 地图怎么用

- **拖拽**旋转大陆，**滚轮**缩放，左下角跟着变的是比例尺
- 四个三角地标，金色＝已启封，灰色＝封存中
- 点地标（或左下角索引）→ 镜头飞过去 + 右侧滑出**区域卡**：封面插画、坐标、势力/气候/时长、一句钩子
- 卡片左侧 `‹ ›` 在四境之间翻页（也可以直接再点另一个地标）
- 卡片里「启封剧本」→ 剧本详情页；点地图空白处 / 「退后」→ 收起卡片
- 右下「复位视角」回到全景
- 没有 WebGL 的环境会自动降级成那张手绘纸图（`#atlas-wrap`）

## 怎么加内容

所有文案都在 `assets/js/data.js`，不需要动引擎。

**加一个事件节点**：

```js
q07_xxx: {
  place: 'qidao',            // 属于哪个子地图
  time: '22:30',             // 顶部时间
  bg: 'cabin',               // 可选，换成车厢色调
  text: [                    // 一段一段的打字机文本，**双星号**=金色强调
    '第一段。',
    '「第二段，以整段引号包住会变成引用块。」'
  ],
  choices: [
    { t: '选项文字', to: 'q08_xxx',
      fx: { hp: -10, san: -5, sup: +5, cred: +10, inf: +15,   // 数值增减
            flag: 'someFlag' },                                // 也可以写 flag2 / flag3
      items: ['某件物品'],
      req: { flag: 'hasKey' } }   // 不满足就隐藏；也支持 item / min:{sup:30} / visited / anyFlag
  ]
}
```

- 节点加 `end: true` 表示这一处探索结束，点「继续」回到子地图。
- 选项 `to: 'e_xxx'` 直接跳结局，结局文案写在 `ENDINGS` 里。
- 新增子地图要同时改 `PLACES`、`ENTRY`，以及 `game.js` 里的 `placeState()` 解锁规则。

**加一个剧本杀剧本**：在 `assets/js/drama-data.js` 的 `window.DRAMA_SCRIPTS` 里加一个键，
最小骨架长这样——

```js
'my-script': {
  id: 'my-script',
  title: '剧本简称',
  full: '维兰索尔-某某地点',
  en: 'SOME PLACE',
  prologue: [ { who: 'narrator', say: '开场第一段。' } ],
  npcs: {
    narrator: { name: '旁白', role: '', color: '#8a7f6a' },
    foo:      { name: '某人', role: '身份', color: '#c9a24a' }
  },
  clues: { C01: { name: '线索名', text: '线索正文。' } },
  acts: {
    A1: {
      name: '第一幕', place: '地点',
      intro: [ { who: 'narrator', say: '进幕叙述。' } ],
      hint: ['看桌子'],                       // 建议动作，点一下即提交
      actions: [
        { keys: ['桌子', '抽屉'], who: 'narrator', say: '你打开抽屉。',
          give: ['C01'] },                     // give 可以给多条
        { keys: ['走', '离开'], who: 'narrator', say: '你离开了。',
          next: 'A2' }
      ],
      fallback: ['这里没有那样东西。']         // 没命中时随机挑一句
    },
    A2: { name: '第二幕', place: '地点', accuse: true, intro: [], hint: ['指认 某人'] }
  },
  endings: {
    win:  { title: '结局 · 真', lines: ['……'] },
    lose: { title: '结局 · 假', lines: ['……'] }
  },
  culprit: 'foo',
  solidProof: [['C01']]
}
```

判定规则：标签 `keys` 里任意词出现在玩家输入里就算命中（取最长匹配）；
`once` 默认 `true`，同一条判定给过就不再给；`next` 切幕；
第三幕 `accuse: true` 只认「指认 名字」，答对 `culprit` 且满足任意一组
`solidProof` 才走 `win`。写完记得在 `assets/js/region.js` 的 `DRAMAS` 里
加一张卡片（`id` 对上），不然地区列表里看不到。

**换成动画序章**：`PROLOGUE` 数组是现在用文字顶替的背景介绍。等你的素材做好了，把 `#scr-prologue` 里的 `.pro-text` 换成 `<video>` 或序列帧容器，播完调用 `proAct()` 即可，其余流程不用改。

## 后续可以做的

1. 序章动画（素材由你提供）
2. 孤山 / 北陆高原 / 南印洲三章内容
3. 把 `data.js` 的数据结构一比一搬到鸿蒙 ArkTS（节点就是 JSON，引擎逻辑换成 ArkUI 的状态驱动）
4. 立绘 / 场景图的按节点切换，目前是「一张地图图 + 地点色调」的方案

## 世界观速查

- 纪历 1066.6.23 南印洲卡梅迪尔医院出现"欧米伽"病毒
- 8 月全球城市沦陷，共治政府签《共济协议》建难民营，ISR 部队救援
- 10 月诺伦岛避难营沦陷，民众信任崩塌
- 11 月坂良城秋山真之政变建"帝国"；共治政府"感染战争"失败，方舟升空
- 现在是纪历 1071 年，爆发后第五年

四大势力：**帝国**（北陆高原，军事）、**贸易联盟**（西陆平原，重商）、**科技会**（方舟，中立）、**教会**（孤山，信仰）。
