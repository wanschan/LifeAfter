/* ============================================================
   场景插画映射
   ------------------------------------------------------------
   图片来源：docs/剧情文本-锈轨黄昏.md 的分场插画（P1-P3、S1-S22），
   2026-11-15 生成，已压成 assets/img/scenes/*.webp（1600 宽 / q82 / 共 2.52 MB）。

   用法：
     SceneImages.forNode(id)          -> 该事件节点的背景图，无图返回 null（调用方回退区域封面）
     SceneImages.forPrologueLine(i)   -> 序章第 i 行的背景图
     SceneImages.cover(rid)           -> 剧本详情页头图，无图返回 null

   维护：补齐 S23-S37 / E1-E5 / D1-D3 后，只需在 NODE_MAP 里给
   sui* / t* 节点补上对应项，其余代码不用动。
   ============================================================ */
(function () {
  var DIR = 'assets/img/scenes/';

  /* 节点 -> 场景。按剧情文本的画面内容一对一配，同一张图可被多个相邻节点复用。 */
  var NODE_MAP = {
    /* ---- 第一幕 · 七道调车场（S1-S9） ---- */
    q01: 's1',            // 三十一台锈死的 ND5
    q02_signal: 's3',     // 第七道的灯 / 信号房
    q02b_relay: 's3',
    q02_tower: 's4',      // 水塔视角
    q02b_count: 's4',
    q02_leave: 's2',      // 空工具箱
    q03_grass: 's6',      // 趴在草里看车窗
    q03_train: 's5',      // 车头「货 四十七」
    q04_board: 's7',      // 四十六个有人
    q05_pull: 's7',
    q05_ticket: 's8',     // 铜票
    q05_face: 's6',       // 帆布下那张脸
    q04_cab: 's5',        // 驾驶室记录仪
    q05_record: 's5',
    q05_coat: 's9',       // 白雨衣 / K.V.-04
    q06_face: 's9',
    q06_name: 's9',
    q06_alive: 's9',
    q06_me: 's8',
    q06_show: 's8',
    q06_follow: 's7',
    q06_watch: 's7',
    q06_run: 's1',
    q04_after: 's9',

    /* ---- 第二幕 · 快乐 101（S10-S16） ---- */
    k01: 's10',           // 三百个集装箱白城
    k02_tax: 's12',       // 锈秤交易所
    k02_paid: 's12',
    k02_bluff: 's16',     // K.V.-07 / 牛皮纸袋
    k02_wait: 's11',      // 安检门
    k02_board: 's13',     // 悬赏板
    k03_old: 's14',       // 举牌的老太太
    k03_letter: 's14',
    k03_give: 's14',
    k03_truth: 's14',
    k03_lie: 's14',
    k03_sign: 's13',
    k03_end: 's10',
    k05_signed: 's16',
    k04_kelan: 's15',     // 帘子后面
    k06_report: 's15',
    k06_refuse: 's15',

    /* ---- 第三幕 · 远星城 · 旧百货（S17-S22） ---- */
    y01: 's17',           // 塌了三层
    y02_stalls: 's18',    // 摊位
    y02_names: 's19',     // 收名字的男孩
    y02_names_free: 's19',
    y02_scale: 's20',     // 秤爷
    y03_trade: 's20',
    y03_errand: 's21',    // 地下二层的水
    y04_warehouse: 's21',
    y05_back: 's22',      // 一沓信
    y03_know: 's20',
    y03_why: 's20',
    y03_me: 's20',
    y06_truth: 's22',
    y06_end: 's17'

    /* ---- TODO 第四幕 sui*（18 个）/ 第五幕 t*（7 个）----
       等 S23-S37 生成后在这里补；目前这些节点回退到区域封面。
       优先补：S25 墙上有一层东西、S29 满墙的「四十七个」、
               S34 塌了一半的顶棚、E3 脱轨。 */
  };

  /* 序章 11 行：医院 -> 熄灯 -> 方舟 -> 回到西陆平原的铁轨 */
  var PROLOGUE_LINES = [
    'p1', 'p1', 'p1',
    'p2', 'p2',
    'p3', 'p3', 'p3',
    's1', 's1', 's1'
  ];

  /* 剧本详情页头图：脚本指定 S1 为「西陆平原卡片封面 / 剧本页背景」 */
  var COVER = { xilu: 's1' };

  function url(name) { return DIR + name + '.webp'; }

  /* 预加载：把**当前进度附近**用到的插画解码进缓存。
     全量 25 张一起解码在低显存设备上会把贴图内存吃爆（ArkWeb 会直接丢帧/不画内容），
     所以默认只预热前 PRELOAD_MAX 张，其余在用到前由 warm() 补。 */
  var PRELOAD_MAX = 8;

  function preload() {
    var urls = [];
    Object.keys(COVER).forEach(function (k) { urls.push(url(COVER[k])); });
    PROLOGUE_LINES.forEach(function (n) { urls.push(url(n)); });
    Object.keys(NODE_MAP).forEach(function (k) { urls.push(url(NODE_MAP[k])); });
    var seen = {}, n = 0;
    for (var i = 0; i < urls.length; i++) {
      var u = urls[i];
      if (seen[u]) { continue; }
      seen[u] = 1;
      if (n++ >= PRELOAD_MAX) { break; }
      warmUrl(u);
    }
  }

  function warmUrl(u) {
    var im = new Image();
    im.src = u;
    if (im.decode) { im.decode().catch(function () {}); }
  }

  /* 提前把某个节点要用的图解码好（进节点前调用） */
  function warm(id) {
    if (!id) { return; }
    var n = NODE_MAP[id];
    if (n) { warmUrl(url(n)); }
  }

  window.SceneImages = {
    forNode: function (id) { return NODE_MAP[id] ? url(NODE_MAP[id]) : null; },
    forPrologueLine: function (i) {
      return url(PROLOGUE_LINES[i] || PROLOGUE_LINES[PROLOGUE_LINES.length - 1]);
    },
    cover: function (rid) { return COVER[rid] ? url(COVER[rid]) : null; },
    warm: warm,
    count: Object.keys(NODE_MAP).length,
    total: 25,
    preload: preload
  };

  // 首屏加载完再预热，不跟标题页抢带宽
  if (window.addEventListener) {
    window.addEventListener('load', function () { setTimeout(preload, 500); });
  }
})();
