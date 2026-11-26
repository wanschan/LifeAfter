# -*- coding: utf-8 -*-
"""
生成鸿蒙 ArkWeb 专用的自包含 HTML。

把 web 版的 CSS / 6 个 JS / 4 张区域图 / 25 张分场插画全部内联进单个 HTML，
放进 entry/src/main/resources/rawfile/index.html。ArkWeb 加载后零外部请求，
彻底避开 rawfile 相对路径与资源协议差异的问题。

用法：
    python scripts/build_harmony_html.py

源文件只读，不改动 web 版；每次 web 版内容变更后重跑一次即可。
"""
import os
import re
import io
import base64
import mimetypes

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_HTML = os.path.join(ROOT, 'index.html')
DST_DIR = os.path.join(ROOT, 'entry', 'src', 'main', 'resources', 'rawfile')
DST_HTML = os.path.join(DST_DIR, 'index.html')


def data_uri(path):
    ext = os.path.splitext(path)[1].lower()
    mime = mimetypes.types_map.get(ext, 'application/octet-stream')
    with open(path, 'rb') as f:
        b64 = base64.b64encode(f.read()).decode('ascii')
    return 'data:%s;base64,%s' % (mime, b64)


def webp_uri(path, max_w=1100, quality=80, tone=False):
    """按需降采样再编码成 data URI。

    鸿蒙设备上每个全屏背景都会解成一张 1600x900 的位图（约 5.7 MB），
    25 张一起预加载很容易把显存/贴图内存顶爆，这里统一降到 1100 宽。

    tone=True 时把 CSS 上原本用 filter 做的调色（提亮 + 轻微去饱和 + 压对比）
    直接烘进像素里，页面上就不用再挂整屏滤镜了——软件渲染下整屏 filter
    会多开一张 3000x2000 的渲染表面，直接导致画面缺块。"""
    try:
        from PIL import Image, ImageEnhance
    except ImportError:
        return data_uri(path)
    im = Image.open(path)
    if im.width > max_w:
        im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
    if tone:
        im = im.convert('RGB')
        gray = im.convert('L').convert('RGB')
        im = Image.blend(im, gray, 0.12)                  # grayscale(.12)
        im = ImageEnhance.Brightness(im).enhance(1.34)     # brightness(1.30~1.38)
        im = ImageEnhance.Contrast(im).enhance(0.95)       # contrast(.94~.96)
    buf = io.BytesIO()
    im.save(buf, 'WEBP', quality=quality, method=4)
    return 'data:image/webp;base64,' + base64.b64encode(buf.getvalue()).decode('ascii')


def safe_script(js):
    """防止 JS 字符串里的 </script> 提前闭合 HTML 标签。"""
    return js.replace('</script', '<\\/script')


def main():
    html = io.open(SRC_HTML, encoding='utf-8').read()

    # 1) CSS 内联
    css_path = os.path.join(ROOT, 'assets', 'css', 'app.css')
    css = io.open(css_path, encoding='utf-8').read()
    html, n = re.subn(
        r'<link[^>]*href="assets/css/app\.css"[^>]*>',
        lambda m: '<style>\n' + css + '\n</style>', html)
    if n != 1:
        raise SystemExit('CSS 替换数量异常: %d' % n)

    # 2) JS 按原顺序内联
    scripts = [
        'assets/map3d/three.min.js',
        'assets/map3d/tex.js',
        'assets/map3d/map3d.js',
        'assets/js/data.js',
        'assets/js/scenes.js',
        'assets/js/region.js',
        'assets/js/drama-data.js',
        'assets/js/drama.js',
        'assets/js/game.js',
    ]
    for rel in scripts:
        path = os.path.join(ROOT, rel.replace('/', os.sep))
        js = io.open(path, encoding='utf-8').read()
        pattern = r'<script[^>]*src="' + re.escape(rel) + r'"[^>]*>\s*</script>'
        html, n = re.subn(pattern,
                          lambda m, j=js: '<script>\n' + safe_script(j) + '\n</script>',
                          html, count=1)
        if n != 1:
            raise SystemExit('JS 替换失败 %s (%d)' % (rel, n))

    # 3) 手绘纸图 + 4 张区域图 -> data URI（HTML 内联样式 + data.js）
    regions = [
        ('atlas.webp', None),
        ('title-bg.webp', None),
        ('map-beilu.jpg', 1100),
        ('map-xilu.jpg', 1100),
        ('map-gushan.jpg', 1100),
        ('map-nanyin.jpg', 1100),
    ]
    for name, max_w in regions:
        path = os.path.join(ROOT, 'assets', 'img', name)
        uri = webp_uri(path, max_w=max_w) if max_w else data_uri(path)
        html = html.replace('assets/img/' + name, uri)
        print('  区域图', name, '%.0f KB' % (len(uri) / 1024))

    # 3.6) 鸿蒙专用瘦身样式：软件渲染下，滤镜 / backdrop-filter / mix-blend-mode
    #      都会额外开一张整屏渲染表面，贴图内存一超限 Chromium 就报
    #      "tile memory limits exceeded, some content may not draw"，
    #      表现就是整条内容不画。这里统一关掉，观感损失很小。
    hm_style = (
        '<style>\n'
        '/* ---- 鸿蒙 ArkWeb 专用瘦身（由 build_harmony_html.py 注入）----\n'
        '   软件渲染下，滤镜 / backdrop-filter / mix-blend-mode / 全屏噪点层\n'
        '   都会额外开一张整屏渲染表面；贴图内存一超限，Chromium 就\n'
        '   "tile memory limits exceeded, some content may not draw"（整条不画）。\n'
        '   这几项在手机屏幕上几乎看不出来，直接关掉。 */\n'
        '.atlas-shot,.pro-bg,.play-bg.has-scene,.sc-bg.has-scene{filter:none!important}\n'
        '.fx-grain,.map-bg::after{display:none!important}\n'
        '*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;'
        'mix-blend-mode:normal!important}\n'
        '</style>\n'
    )
    if '</head>' not in html:
        raise SystemExit('未找到 </head>，无法注入鸿蒙样式')
    hm_flag = (
        '<script>\n'
        '/* 鸿蒙端用单层直切背景：两层全屏图叠加会让软件合成器丢下半屏的 tile。\n'
        '   图片已预解码，直切不会黑帧。 */\n'
        'window.__HM_NO_XFADE = true;\n'
        '</script>\n'
    )
    html = html.replace('</head>', hm_style + hm_flag + '</head>', 1)

    # 4) 25 张分场插画 -> scenes.js 里的映射表改成 data URI 字典
    scene_dir = os.path.join(ROOT, 'assets', 'img', 'scenes')
    names = ['p1', 'p2', 'p3'] + ['s%d' % i for i in range(1, 23)]
    entries = []
    for n in names:
        uri = webp_uri(os.path.join(scene_dir, n + '.webp'), tone=True)
        entries.append("    %s: '%s'" % (n, uri))
    scene_map = 'var SCENE_IMGS = {\n' + ',\n'.join(entries) + '\n  };\n'
    old_url = "  function url(name) { return DIR + name + '.webp'; }"
    if old_url not in html:
        raise SystemExit('scenes.js 的 url() 未找到，构建中止')
    html = html.replace(old_url, scene_map + '  function url(name) { return SCENE_IMGS[name] || ""; }')
    print('  分场插画 %d 张，总 %.2f MB' % (len(names), sum(len(e) for e in entries) / 1048576))

    # 5) 注入返回键桥接：ArkTS 侧 onBackPress 调用它，返回 true 表示已处理
    back_bridge = r"""
<script>
(function () {
  var on = function (id) {
    var el = document.getElementById(id);
    return !!(el && el.classList.contains('on'));
  };
  var click = function (sel) {
    var el = document.querySelector(sel);
    if (el) { el.click(); return true; }
    return false;
  };
  // 诊断：ArkTS 侧可调用 window.__diag() 拿 WebGL / 地图引擎 / 视口状态
  window.__diag = function () {
    var c = document.createElement('canvas');
    var gl = null, err = '';
    try { gl = c.getContext('webgl') || c.getContext('experimental-webgl'); }
    catch (e) { err = String(e); }
    return JSON.stringify({
      webglClass: !!window.WebGLRenderingContext,
      glOk: !!gl,
      glErr: err,
      map3d: typeof window.Map3D,
      supported: (window.Map3D && window.Map3D.supported) ? window.Map3D.supported() : null,
      canvasCount: document.querySelectorAll('#map3d canvas').length,
      atlasHidden: (function(){var a=document.getElementById('atlas-wrap'); return a ? a.hidden : null})(),
      iw: window.innerWidth,
      ih: window.innerHeight,
      dpr: window.devicePixelRatio,
      vv: window.visualViewport ? window.visualViewport.height : null,
      sw: window.screen.width,
      sh: window.screen.height,
      docH: document.documentElement.clientHeight,
      docW: document.documentElement.clientWidth,
      bodyH: document.body.scrollHeight
    });
  };
  // 布局稳定后再报一次，方便从 hilog 里看真实视口尺寸
  window.addEventListener('load', function () {
    setTimeout(function () { try { console.log('DIAG2 ' + window.__diag()); } catch (e) {} }, 3000);
    // 临时排查：把几个背景容器的盒子打出来（定位「背景只铺一半」的问题）
    var n = 0;
    var t = setInterval(function () {
      try {
        var b = function (sel) {
          var el = document.querySelector(sel);
          if (!el) { return sel + '=null'; }
          var r = el.getBoundingClientRect();
          var cs = getComputedStyle(el);
          return sel + '=' + Math.round(r.width) + 'x' + Math.round(r.height) +
            '@' + Math.round(r.top) + ' pos:' + cs.position + ' h:' + cs.height + ' d:' + cs.display;
        };
        console.log('BOX ' + ['.pro-bg', '.pro-bg .pb-layer', '#scr-prologue', '#play-bg', '#play-bg .pb-layer'].map(b).join(' | '));
      } catch (e) {}
      if (++n > 10) { clearInterval(t); }
    }, 2000);
  });
  window.addEventListener('resize', function () {
    setTimeout(function () { try { console.log('DIAG-RESIZE ' + window.__diag()); } catch (e) {} }, 300);
  });
  // 返回 true = 消费了返回键；false = 已在标题页，交给系统退出
  window.__appBack = function () {
    if (on('modal')) { click('.modal-x'); return true; }
    if (on('scr-ending')) { click('#scr-ending [data-act=toMap]'); return true; }
    if (on('scr-sheet')) { click('#jr-panel-x'); return true; }
    if (on('scr-script')) { click('#jr-back'); return true; }
    if (on('scr-drama')) { click('#dr-back'); return true; }
    if (on('scr-enter')) { return true; }   // 入场动画不响应返回，点屏可跳过
    if (on('scr-places')) { click('#scr-places [data-act=toMap]'); return true; }
    if (on('scr-scenario')) { click('#sc-back'); return true; }
    if (on('scr-play')) { click('.hud [data-act=menu]'); return true; }
    if (on('scr-map')) {
      var card = document.getElementById('map-card');
      if (card && card.classList.contains('on')) { click('#mc-close2'); return true; }
      // 「地区」页签下先切回「世界」，再按一次才回标题页
      if (window.RegionTab && window.RegionTab.isRegion()) { window.RegionTab.set('world'); return true; }
      // 大地图没有「回标题」按钮，通过菜单里的 toMap 之外的路径回不去；
      // 这里用最外层 screen 切换回标题页（不重置存档）。
      var screens = document.querySelectorAll('.screen');
      for (var i = 0; i < screens.length; i++) { screens[i].classList.remove('on'); }
      var title = document.getElementById('scr-title');
      if (title) title.classList.add('on');
      if (window.Map3D) window.Map3D.hide();
      return true;
    }
    if (on('scr-prologue')) { return true; } // 序章不响应返回，避免跳过
    return false;
  };
})();
</script>
"""
    html = html.replace('</body>', back_bridge + '\n</body>', 1)

    # 6) 校验：不应再有任何 assets/ 外部引用（注释里的说明文字除外）
    leftovers = re.findall(r'(?:src|href)="assets/|url\([\'\"]?assets/', html)
    if leftovers:
        raise SystemExit('仍有未内联的外部引用: %s' % leftovers)

    # 6) 视口诊断：ArkTS 侧 onConsole 会把 console 转发到 hilog（tag LifeAfterWeb）
    #    排查「页面只画了上半截」这类问题时，先看这里的数值：
    #    如果 innerHeight 远小于屏幕高度 CSS 值，是 Web 组件尺寸问题；
    #    如果数值正常但画面缺块，就是合成器丢 tile。
    viewport_probe = r"""
<script>
(function () {
  function vp(tag) {
    try {
      var vv = window.visualViewport;
      console.log('[vp' + tag + '] inner ' + window.innerWidth + 'x' + window.innerHeight +
        ' dpr ' + (window.devicePixelRatio || 1) +
        ' visual ' + (vv ? Math.round(vv.width) + 'x' + Math.round(vv.height) : '-') +
        ' docH ' + document.documentElement.scrollHeight +
        ' bodyH ' + (document.body ? document.body.scrollHeight : 0));
    } catch (e) { console.log('[vp] err ' + e); }
  }
  vp('');
  setTimeout(function () { vp('+1.5s'); }, 1500);
  setTimeout(function () { vp('+5s'); }, 5000);
  setTimeout(function () { vp('+12s'); }, 12000);
})();
</script>
"""
    html = html.replace('<script>\n(function () {\n  var on = function (id) {',
                        viewport_probe + '<script>\n(function () {\n  var on = function (id) {', 1)

    os.makedirs(DST_DIR, exist_ok=True)
    io.open(DST_HTML, 'w', encoding='utf-8').write(html)
    print('已生成:', DST_HTML)
    print('大小: %.2f MB' % (os.path.getsize(DST_HTML) / 1048576))


if __name__ == '__main__':
    main()
