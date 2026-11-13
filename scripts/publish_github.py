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
    GH_TAG   版本号，默认 26w46a（会读 CHANGELOG.md 里同名章节作为 Release 正文）
    GH_TITLE Release 标题，默认 "<TAG> · 项目发布"

说明：本机 github.com:443 被代理阻断，git push 不可用，因此全程走 api.github.com REST。
token 只从环境变量读取，不会写进任何文件。
"""
import os
import io
import sys
import json
import base64
import urllib.request
import urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOKEN = os.environ.get('GH_PAT')
REPO = os.environ.get('GH_REPO', 'LifeAfter')
OWNER = os.environ.get('GH_OWNER')
TAG = os.environ.get('GH_TAG', '26w46a')
TITLE = os.environ.get('GH_TITLE', TAG + ' · 项目发布')
API = 'https://api.github.com'

EXCLUDE_DIRS = {
    '.git', '.workbuddy', '.idea', '.hvigor', 'oh_modules', 'node_modules',
    'build', '.cxx', '.test', '.appanalyzer', '__pycache__', 'dist',
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
    st, c = call('POST', base + '/git/commits', {
        'message': TAG + ' · 项目发布', 'tree': t['sha'], 'parents': [],
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
    body = changelog[changelog.index(marker):].strip() if marker in changelog else TAG + ' 发布'
    st, rel = call('POST', base + '/releases', {
        'tag_name': TAG, 'target_commitish': 'main',
        'name': TITLE, 'body': body,
        'draft': False, 'prerelease': False,
    })
    if st == 201:
        print('✓ Release:', rel['html_url'])
    elif st == 422:
        st2, rs = call('GET', base + '/releases/tags/' + TAG)
        if st2 == 200:
            st3, _ = call('PATCH', base + '/releases/' + str(rs['id']), {'body': body})
            print('· Release 已存在，更新正文:', st3)
    else:
        print('· Release 创建失败（可稍后手动发）:', st, rel.get('message'))

    print('\nDONE  https://github.com/%s/%s' % (OWNER, REPO))


if __name__ == '__main__':
    main()
