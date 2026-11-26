# -*- coding: utf-8 -*-
r"""
一键把本项目发布到 GitHub（创建公开仓库 + 推送全部文件 + 发版本公告）。

用法（PowerShell）：
    $env:GH_PAT = "你的有写权限的 token"
    python scripts\publish_github.py

或 Git Bash：
    GH_PAT=你的token python scripts/publish_github.py

可选环境变量：
    GH_REPO  仓库名，默认 LifeAfter
    GH_OWNER 用户名，默认从 /user 接口自动读取
    GH_TAG   版本号，默认读取 CHANGELOG.md 最上面的 ## 26w46x 标题
    GH_TITLE Release 标题，默认 "<TAG> · 项目发布"

说明：本机 github.com:443 被代理阻断，git push 不可用，因此全程走 api.github.com REST。
token 只从环境变量读取，不会写进任何文件。
"""
import os
import io
import re
import sys
import json
import base64
import urllib.request
import urllib.error
import urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOKEN = os.environ.get('GH_PAT')
REPO = os.environ.get('GH_REPO', 'LifeAfter')
OWNER = os.environ.get('GH_OWNER')
API = 'https://api.github.com'


def detect_tag():
    """版本号取 CHANGELOG.md 里最上面的 ## 26w46x 标题。"""
    text = io.open(os.path.join(ROOT, 'CHANGELOG.md'), encoding='utf-8').read()
    m = re.search(r'^##\s+(\d{2}w\d{2}[a-z])\s*$', text, re.M)
    return m.group(1) if m else '26w46b'


TAG = os.environ.get('GH_TAG') or detect_tag()
TITLE = os.environ.get('GH_TITLE', TAG + ' · 项目发布')

EXCLUDE_DIRS = {
    '.git', '.workbuddy', '.idea', '.hvigor', 'oh_modules', 'node_modules',
    'build', '.cxx', '.test', '.appanalyzer', '__pycache__', 'dist',
    '.tmp',            # hvigor 增量编译缓存，动辄几十 MB，绝不能进仓库
    '.preview', '.gradle', 'oh-package-cache',
}
EXCLUDE_FILES = {'local.properties', '.DS_Store'}
EXCLUDE_EXT = {'.hap', '.log', '.tmp', '.pyc', '.zip'}

if not TOKEN:
    sys.exit('缺少 GH_PAT 环境变量：请先设置有一「创建仓库 + 写内容」权限的 token')


def call(method, path, payload=None):
    data = json.dumps(payload, ensure_ascii=False).encode('utf-8') if payload is not None else None
    req = urllib.request.Request(
        API + path, data=data, method=method,
        headers={
            'Authorization': 'Bearer ' + TOKEN,
            'Accept': 'application/vnd.github+json',
            'Content-Type': 'application/json',
            'User-Agent': 'lifeafter-publisher',
            'X-GitHub-Api-Version': '2022-11-28',
        })
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            body = r.read().decode('utf-8')
            return r.status, (json.loads(body) if body else {})
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode('utf-8') or '{}')


def collect():
    out = []
    for base, dirs, names in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        for n in names:
            if n in EXCLUDE_FILES or os.path.splitext(n)[1].lower() in EXCLUDE_EXT:
                continue
            full = os.path.join(base, n)
            out.append((os.path.relpath(full, ROOT).replace('\\', '/'), full))
    return sorted(out)


def main():
    global OWNER
    st, me = call('GET', '/user')
    if st != 200:
        sys.exit('token 无效：%s %s' % (st, me.get('message')))
    OWNER = OWNER or me['login']
    print('账号:', OWNER)

    desc = '余烬纪 OMEGA CHRONICLE — 末日生存文字冒险网页原型，含 3D 实时地形大地图'
    st, repo = call('GET', '/repos/%s/%s' % (OWNER, REPO))
    if st == 404:
        st, repo = call('POST', '/user/repos', {
            'name': REPO, 'description': desc, 'private': False,
            'auto_init': False, 'has_issues': True, 'has_wiki': False,
        })
        if st != 201:
            sys.exit('创建仓库失败 %s %s（token 需要「创建仓库」权限）' % (st, repo.get('message')))
        print('✓ 已创建公开仓库', repo['html_url'])
    else:
        print('· 仓库已存在:', repo['html_url'])

    base = '/repos/%s/%s' % (OWNER, REPO)

    # 空仓库还没有 git 数据库，直接调 Git Data API 会返回 409 Git Repository is empty。
    # 先用 Contents API 造一个初始提交把它初始化，稍后根提交会把这个临时提交整体覆盖掉。
    st_c, commits = call('GET', base + '/commits')
    if st_c == 409 or (st_c == 200 and not commits):
        st_i, ini = call('PUT', base + '/contents/.gitkeep', {
            'message': 'chore: initialize repository',
            'content': base64.b64encode(b'').decode('ascii'),
            'branch': 'main',
        })
        if st_i not in (200, 201):
            sys.exit('初始化空仓库失败 %s %s' % (st_i, ini.get('message')))
        print('· 已初始化空的 Git 数据库（随后由根提交覆盖）')

    files = collect()
    print('待上传 %d 个文件，%.2f MB' % (len(files), sum(os.path.getsize(p) for _, p in files) / 1048576))

    tree = []
    for i, (rel, full) in enumerate(files, 1):
        raw = open(full, 'rb').read()
        st, b = call('POST', base + '/git/blobs', {
            'content': base64.b64encode(raw).decode('ascii'), 'encoding': 'base64'})
        if st != 201:
            sys.exit('blob 失败 %s：%s %s（token 需要 Contents 写权限且授权到本仓库）' % (rel, st, b.get('message')))
        tree.append({'path': rel, 'mode': '100644', 'type': 'blob', 'sha': b['sha']})
        if i % 15 == 0 or i == len(files):
            print('  blob %d/%d' % (i, len(files)))

    st, t = call('POST', base + '/git/trees', {'tree': tree})
    if st != 201:
        sys.exit('tree 失败 %s %s' % (st, t.get('message')))
    # 保留远端历史：以当前 main 的 HEAD 作为父提交（仓库为空时才建根提交）
    parents = []
    st_h, head = call('GET', base + '/git/ref/heads/main')
    if st_h == 200 and head.get('object', {}).get('sha'):
        parents = [head['object']['sha']]
    st, c = call('POST', base + '/git/commits', {
        'message': TAG + ' · 项目更新', 'tree': t['sha'], 'parents': parents,
        'author': {'name': OWNER, 'email': OWNER + '@users.noreply.github.com'},
        'committer': {'name': OWNER, 'email': OWNER + '@users.noreply.github.com'},
    })
    if st != 201:
        sys.exit('commit 失败 %s %s' % (st, c.get('message')))
    print('✓ commit', c['sha'][:8])

    st, r = call('POST', base + '/git/refs', {'ref': 'refs/heads/main', 'sha': c['sha']})
    if st == 201:
        print('✓ refs/heads/main')
    else:
        st2, r2 = call('PATCH', base + '/git/refs/heads/main', {'sha': c['sha'], 'force': True})
        if st2 != 200:
            sys.exit('ref 更新失败 %s %s' % (st2, r2.get('message')))
        print('✓ refs/heads/main 已更新')

    call('PATCH', base, {'default_branch': 'main', 'description': desc})

    # Release
    changelog = io.open(os.path.join(ROOT, 'CHANGELOG.md'), encoding='utf-8').read()
    marker = '## ' + TAG
    if marker in changelog:
        tail = changelog[changelog.index(marker):]
        nxt = re.search(r'^##\s+\d{2}w\d{2}[a-z]\s*$', tail[len(marker):], re.M)
        body = tail[:len(marker) + nxt.start()].strip() if nxt else tail.strip()
    else:
        body = TAG + ' 发布'
    st, rel = call('POST', base + '/releases', {
        'tag_name': TAG, 'target_commitish': 'main',
        'name': TITLE, 'body': body,
        'draft': False, 'prerelease': False,
    })
    rel_id = None
    if st == 201:
        rel_id = rel['id']
        print('✓ Release:', rel['html_url'], '(%s)' % TAG)
    elif st == 422:
        st2, rs = call('GET', base + '/releases/tags/' + TAG)
        if st2 == 200:
            rel_id = rs['id']
            st3, _ = call('PATCH', base + '/releases/' + str(rel_id), {'body': body})
            print('· Release 已存在，更新正文:', st3)
        else:
            print('· Release 已存在但读不到:', st2)
    else:
        print('· Release 创建失败（可稍后手动发）:', st, rel.get('message'))

    # 把编译好的 HAP 挂到 Release 附件，用户可以直接下载安装
    if rel_id:
        upload_asset(base, rel_id, TAG)

    # Pages 通常会自动重建；这里补一次显式请求（没权限也不影响发布）
    call('POST', base + '/pages/builds', {})

    print('\nDONE  仓库: https://github.com/%s/%s' % (OWNER, REPO))
    print('      站点: https://%s.github.io/%s/' % (OWNER, REPO))


def find_hap():
    """取最近编译出来的 HAP；没有就返回 None（附件是可选项）。"""
    out_dir = os.path.join(ROOT, 'entry', 'build', 'default', 'outputs', 'default')
    if not os.path.isdir(out_dir):
        return None
    cands = [os.path.join(out_dir, n) for n in os.listdir(out_dir) if n.endswith('.hap')]
    if not cands:
        return None
    return max(cands, key=os.path.getmtime)


def upload_asset(base, rel_id, tag):
    hap = find_hap()
    if not hap:
        print('· 没有找到 HAP，跳过附件上传')
        return
    name = 'LifeAfter-%s-harmony-unsigned.hap' % tag
    raw = open(hap, 'rb').read()
    # 已存在同名附件就先删掉，避免 422 already_exists
    st, assets = call('GET', base + '/releases/%d/assets' % rel_id)
    if st == 200:
        for a in assets:
            if a.get('name') == name:
                call('DELETE', '/repos/%s/%s/releases/assets/%d' % (OWNER, REPO, a['id']))
    url = 'https://uploads.github.com/repos/%s/%s/releases/%d/assets?name=%s' % (
        OWNER, REPO, rel_id, urllib.parse.quote(name))
    req = urllib.request.Request(url, data=raw, method='POST', headers={
        'Authorization': 'Bearer ' + TOKEN,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/vnd.harmonyos.hap',
        'User-Agent': 'lifeafter-publisher',
        'X-GitHub-Api-Version': '2022-11-28',
    })
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            info = json.loads(r.read().decode('utf-8'))
        print('✓ 附件 %s (%.2f MB)' % (info.get('name'), len(raw) / 1048576))
    except urllib.error.HTTPError as e:
        msg = e.read().decode('utf-8') or '{}'
        print('· 附件上传失败 %s %s' % (e.code, msg[:200]))
    except Exception as e:                     # 网络抖动不影响主流程
        print('· 附件上传异常:', e)


if __name__ == '__main__':
    main()
