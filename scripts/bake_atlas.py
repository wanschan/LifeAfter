# -*- coding: utf-8 -*-
"""
重建手绘纸图（地图选择页在无 WebGL 时的降级视图）。

流程：
    assets/map3d/atlas-bake.html  (SVG 源 + app.css)
        -> 无头 Chrome 渲染成 1600x1000 PNG
        -> 压成 assets/img/atlas.webp

改完纸图想重新出图时跑一次：
    python scripts/bake_atlas.py

页面里纸图是 <img>，四个区域的点击热区在 index.html 的 .atlas-pin 上，
位置用百分比定位（换算自 SVG 里 .rlabel 的坐标），改纸图布局记得同步那四个百分比。
"""
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BAKE_HTML = os.path.join(ROOT, 'assets', 'map3d', 'atlas-bake.html')
TMP_PNG = os.path.join(ROOT, '.tmp', 'atlas-bake.png')
OUT_WEBP = os.path.join(ROOT, 'assets', 'img', 'atlas.webp')


def find_node():
    for p in (
        os.path.expandvars(r'%APPDATA%\..\..\Program Files\nodejs\node.exe'),
        r'C:\Program Files\nodejs\node.exe',
    ):
        if os.path.exists(p):
            return p
    return 'node'


def main():
    os.makedirs(os.path.dirname(TMP_PNG), exist_ok=True)
    url = 'file:///' + BAKE_HTML.replace('\\', '/')
    node = find_node()
    cmd = [node, os.path.join(ROOT, 'scripts', 'bake_atlas.js'), url, TMP_PNG]
    print('渲染纸图 ...')
    r = subprocess.run(cmd, cwd=ROOT)
    if r.returncode != 0 or not os.path.exists(TMP_PNG):
        raise SystemExit('渲染失败，检查 Chrome/Edge 是否安装')

    from PIL import Image
    im = Image.open(TMP_PNG).convert('RGBA')
    im.save(OUT_WEBP, 'WEBP', quality=86, method=6)
    print('已更新 %s  (%d x %d, %.0f KB)' % (
        os.path.relpath(OUT_WEBP, ROOT), im.width, im.height,
        os.path.getsize(OUT_WEBP) / 1024))


if __name__ == '__main__':
    main()
