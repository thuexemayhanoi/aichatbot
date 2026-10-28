#!/usr/bin/env python3
"""
image-ingest.py — carry raw AI source images from the generator's host to the
authoring container when the container's network policy blocks that host.

The generator (Figma MCP `generate_image`, Canva `generate-image` + export)
returns a signed download URL on www.figma.com / *.canva.com. Those hosts are
unreachable from the session container, but not from a GitHub Actions runner:

  fetch   (runner, stdlib only)  read "BA-XXXX URL" lines on stdin, download
          each allow-listed URL into OUT/BA-XXXX.<ext> and write
          OUT/manifest.json (bytes, sha256, type, host/path — no query string,
          so no signature is ever committed). Used by
          .github/workflows/image-ingest.yml, which parks OUT on a transient
          branch image-ingest/run-<run_id> (a root commit with only these files).
  pull    (container)  BRANCH [--raw-dir DIR] [--keep]  fetch that branch,
          verify every file against the manifest, write DIR/BA-XXXX.<ext>
          for `image-factory.py optimize`, then delete the transient branch.

No API key, token or model call lives here; the runner only downloads.
"""

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone

ID = re.compile(r'^BA-\d{4}$')
# Hosts that serve generated images (initial URL; redirects to their CDNs are followed).
HOSTS = ('www.figma.com', 'figma.com', 's3-alpha-sig.figma.com', 'export-download.canva.com',
         'document-export.canva.com', 'media.canva.com')
MAX_ITEMS = 20
MAX_BYTES = 20 * 1024 * 1024
MAGIC = ((b'\xff\xd8\xff', '.jpg'), (b'\x89PNG\r\n\x1a\n', '.png'), (b'RIFF', '.webp'))


def kind(data):
    for magic, ext in MAGIC:
        if data.startswith(magic) and (ext != '.webp' or data[8:12] == b'WEBP'):
            return ext
    return None


def parse_items(text):
    items, errors = [], []
    for n, line in enumerate(text.splitlines(), 1):
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        parts = line.split()
        if len(parts) != 2 or not ID.match(parts[0]):
            errors.append(f'line {n}: expected "BA-XXXX URL"')
            continue
        url = urllib.parse.urlsplit(parts[1])
        if url.scheme != 'https' or url.hostname not in HOSTS:
            errors.append(f'line {n}: {parts[0]} host {url.hostname!r} is not an image generator host')
            continue
        items.append((parts[0], parts[1]))
    ids = [i for i, _ in items]
    if len(set(ids)) != len(ids):
        errors.append('an article id appears twice')
    if len(items) > MAX_ITEMS:
        errors.append(f'{len(items)} items; at most {MAX_ITEMS} per run')
    if not items and not errors:
        errors.append('no items')
    return items, errors


def cmd_fetch(a):
    items, errors = parse_items(sys.stdin.read())
    if errors:
        sys.exit('\n'.join(errors))
    os.makedirs(a.out, exist_ok=True)
    manifest = {}
    failed = []
    for art_id, url in items:
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'motoai-image-ingest'})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read(MAX_BYTES + 1)
                ctype = r.headers.get('Content-Type', '')
            if len(data) > MAX_BYTES:
                raise ValueError('larger than 20 MB')
            ext = kind(data)
            if not ext:
                raise ValueError(f'not a JPEG/PNG/WebP image (Content-Type {ctype!r})')
        except Exception as x:  # one bad URL must not hide the others
            failed.append(f'{art_id}: {x}')
            continue
        with open(os.path.join(a.out, art_id + ext), 'wb') as f:
            f.write(data)
        u = urllib.parse.urlsplit(url)
        manifest[art_id] = {'file': art_id + ext, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(),
                            'content_type': ctype, 'source': f'{u.hostname}{u.path}',
                            'fetched_at': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}
        print(f'{art_id}: {len(data)} bytes {ext}')
    with open(os.path.join(a.out, 'manifest.json'), 'w', encoding='utf-8') as f:
        f.write(json.dumps({'images': manifest, 'failed': failed}, indent=2) + '\n')
    for line in failed:
        print(f'FAILED {line}', file=sys.stderr)
    if not manifest:
        sys.exit('nothing downloaded')


def git(*args, **kw):
    return subprocess.run(['git', *args], check=True, capture_output=True, **kw).stdout


def cmd_pull(a):
    if not re.match(r'^image-ingest/run-\d+$', a.branch):
        sys.exit('branch must be image-ingest/run-<run_id>')
    git('fetch', '--depth=1', 'origin', f'refs/heads/{a.branch}')
    manifest = json.loads(git('show', 'FETCH_HEAD:manifest.json'))
    os.makedirs(a.raw_dir, exist_ok=True)
    for art_id, m in sorted(manifest['images'].items()):
        data = git('show', f'FETCH_HEAD:{m["file"]}')
        if hashlib.sha256(data).hexdigest() != m['sha256']:
            sys.exit(f'{art_id}: sha256 differs from the manifest')
        out = os.path.join(a.raw_dir, m['file'])
        with open(out, 'wb') as f:
            f.write(data)
        print(f'{out}  ({m["bytes"]} bytes from {m["source"]})')
    for line in manifest.get('failed', []):
        print(f'not downloaded: {line}', file=sys.stderr)
    if not a.keep:
        git('push', 'origin', '--delete', a.branch)
        print(f'deleted transient branch {a.branch}')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    p = sub.add_parser('fetch'); p.add_argument('--out', required=True)
    p = sub.add_parser('pull'); p.add_argument('branch')
    p.add_argument('--raw-dir', default='/tmp/motoai-image-raw'); p.add_argument('--keep', action='store_true')
    a = ap.parse_args()
    {'fetch': cmd_fetch, 'pull': cmd_pull}[a.cmd](a)


if __name__ == '__main__':
    main()
