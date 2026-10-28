#!/usr/bin/env python3
"""
image-factory.py — production steps for article featured images (v80).

Writes ONLY data/seo/article-images.json and assets/images/blog/*.webp, one
article id at a time, so an interrupted session resumes from the registry
(every step is idempotent and checks the current status first).

Generation itself happens outside this script (an AI image tool connected to
the session, e.g. the Figma MCP `generate_image`); `record` stores where the
raw image came from. No API key, endpoint or model call lives in the repo.

  record   ID --url URL --tool T --model M [--node N] [--width W --height H]
           → IMAGE_GENERATED (provenance + prompt sha256 from image-plan.csv)
  download ID [--raw-dir DIR]          fetch generator.source_url → DIR/ID.<ext>
  optimize ID RAW [--max-kb 200]       centre-crop 3:2 → 1200×800 → WebP
           (quality search q82→q60 until ≤ max KB; a lighter file that already
           fits is kept) → sha256 + 64-bit dHash → IMAGE_OPTIMIZED
  attach   ID --alt "..."              ALT written after LOOKING at the image
           → IMAGE_ATTACHED (alt_reviewed: true)
  qa                                   run the registry gate; on PASS promote
           every IMAGE_ATTACHED → QA_PASSED (the builder renders these)
  deployed SHA                         QA_PASSED → DEPLOYED (commit on main)
  live     [--site URL]                DEPLOYED → LIVE_VERIFIED when the live
           page references the image and the image URL answers 200 image/webp
  status                               counts per status + next pending ids

Requires Pillow (WebP support). Run from the repository root.
"""

import argparse
import csv
import hashlib
import io
import json
import os
import subprocess
import sys
import urllib.request
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REGISTRY = os.path.join(ROOT, 'data/seo/article-images.json')
PLAN = os.path.join(ROOT, 'data/seo/image-plan.csv')
IMG_DIR = 'assets/images/blog/'
WIDTH, HEIGHT = 1200, 800
STATUSES = ['IMAGE_GENERATED', 'IMAGE_OPTIMIZED', 'IMAGE_ATTACHED', 'QA_PASSED', 'DEPLOYED', 'LIVE_VERIFIED']
SITE = 'https://chatbot.thuexemaynguyentu.com/'


def rank(status):
    return STATUSES.index(status) if status in STATUSES else -1


def load_registry():
    with open(REGISTRY, encoding='utf-8') as f:
        return json.load(f)


def save_registry(reg):
    reg['images'] = dict(sorted(reg['images'].items()))
    with open(REGISTRY, 'w', encoding='utf-8') as f:
        f.write(json.dumps(reg, ensure_ascii=False, indent=2) + '\n')


def load_plan():
    with open(PLAN, encoding='utf-8', newline='') as f:
        return {r['article_id']: r for r in csv.DictReader(f)}


def entry(reg, art_id, need=None):
    e = reg['images'].get(art_id)
    if e is None:
        sys.exit(f'{art_id}: not in the registry (run record first)')
    if need and rank(e['status']) < rank(need):
        sys.exit(f'{art_id}: status {e["status"]}, needs {need}')
    return e


def dhash(img):
    """64-bit difference hash (9×8 grayscale, horizontal gradient)."""
    from PIL import Image
    g = img.convert('L').resize((9, 8), Image.LANCZOS)
    px = list(g.get_flattened_data()) if hasattr(g, "get_flattened_data") else list(g.getdata())
    bits = 0
    for y in range(8):
        for x in range(8):
            bits = (bits << 1) | (1 if px[y * 9 + x] > px[y * 9 + x + 1] else 0)
    return f'{bits:016x}'


def cmd_record(a):
    reg = load_registry()
    plan = load_plan()
    if a.id not in plan:
        sys.exit(f'{a.id}: not in data/seo/image-plan.csv')
    p = plan[a.id]
    old = reg['images'].get(a.id)
    if old and rank(old['status']) >= rank('IMAGE_OPTIMIZED') and not a.force:
        sys.exit(f'{a.id}: already {old["status"]} — pass --force to replace the image')
    reg['images'][a.id] = {
        'status': 'IMAGE_GENERATED',
        'file': IMG_DIR + p['filename'],
        'source': 'ai',
        'generator': {k: v for k, v in {
            'tool': a.tool, 'model': a.model, 'figma_file': a.figma_file, 'figma_node': a.node,
            'source_url': a.url, 'source_expires': a.expires, 'source_width': a.width, 'source_height': a.height,
            'generated_at': date.today().isoformat(),
            'prompt_sha256': hashlib.sha256(p['prompt_en'].encode('utf-8')).hexdigest(),
        }.items() if v not in (None, '')},
        'alt_plan': p['alt_plan'],
    }
    save_registry(reg)
    print(f'{a.id}: IMAGE_GENERATED')


def cmd_download(a):
    reg = load_registry()
    e = entry(reg, a.id, 'IMAGE_GENERATED')
    url = e['generator'].get('source_url')
    if not url:
        sys.exit(f'{a.id}: no generator.source_url')
    os.makedirs(a.raw_dir, exist_ok=True)
    ext = os.path.splitext(url.split('?')[0])[1] or '.img'
    out = os.path.join(a.raw_dir, a.id + ext)
    req = urllib.request.Request(url, headers={'User-Agent': 'motoai-image-factory'})
    with urllib.request.urlopen(req, timeout=60) as r, open(out, 'wb') as f:
        f.write(r.read())
    print(out)


def cmd_optimize(a):
    from PIL import Image
    reg = load_registry()
    e = entry(reg, a.id, 'IMAGE_GENERATED')
    img = Image.open(a.raw)
    img.load()
    img = img.convert('RGB')
    # Centre crop to exactly 3:2, then resize to 1200×800.
    w, h = img.size
    if w * 2 > h * 3:
        nw = h * 3 // 2
        img = img.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    else:
        nh = w * 2 // 3
        img = img.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
    if img.size[0] < WIDTH * 0.95:
        sys.exit(f'{a.id}: source too small ({img.size}) — upscaling would blur; regenerate larger')
    img = img.resize((WIDTH, HEIGHT), Image.LANCZOS)
    limit = a.max_kb * 1024
    data = None
    for q in range(82, 59, -4):
        buf = io.BytesIO()
        img.save(buf, 'WEBP', quality=q, method=6)
        data = buf.getvalue()
        if len(data) <= limit:
            break
    if len(data) > limit:
        sys.exit(f'{a.id}: {len(data) // 1024} KB at q60 — image too detailed, review manually')
    path = os.path.join(ROOT, e['file'])
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as f:
        f.write(data)
    sha = hashlib.sha256(data).hexdigest()
    check = Image.open(io.BytesIO(data))
    e.update({
        'status': 'IMAGE_OPTIMIZED',
        'width': WIDTH, 'height': HEIGHT, 'bytes': len(data), 'quality': q,
        'sha256': sha, 'dhash': dhash(check), 'dhash_of': sha,
    })
    # A new file invalidates a previous ALT review and later steps.
    for k in ('alt', 'alt_reviewed', 'commit', 'live_verified', 'notes'):
        e.pop(k, None)
    save_registry(reg)
    print(f'{a.id}: IMAGE_OPTIMIZED {len(data) // 1024} KB q{q} {e["file"]}')


def cmd_attach(a):
    reg = load_registry()
    e = entry(reg, a.id, 'IMAGE_OPTIMIZED')
    e['alt'] = a.alt.strip()
    e['alt_reviewed'] = True
    if a.caption:
        e['caption'] = a.caption
    if rank(e['status']) < rank('IMAGE_ATTACHED'):
        e['status'] = 'IMAGE_ATTACHED'
    save_registry(reg)
    print(f'{a.id}: IMAGE_ATTACHED alt="{e["alt"]}"')


def cmd_qa(_a):
    r = subprocess.run(['node', 'tools/article-images.mjs', '--check'], cwd=ROOT)
    if r.returncode != 0:
        sys.exit('QA FAIL — nothing promoted')
    reg = load_registry()
    n = 0
    for e in reg['images'].values():
        if e['status'] == 'IMAGE_ATTACHED':
            e['status'] = 'QA_PASSED'
            n += 1
    save_registry(reg)
    print(f'QA PASS — {n} promoted to QA_PASSED')


def cmd_deployed(a):
    reg = load_registry()
    n = 0
    for e in reg['images'].values():
        if e['status'] == 'QA_PASSED':
            e['status'] = 'DEPLOYED'
            e['commit'] = a.sha
            n += 1
    save_registry(reg)
    print(f'{n} marked DEPLOYED @ {a.sha}')


def cmd_live(a):
    plan = load_plan()
    reg = load_registry()
    n = bad = 0
    for art_id, e in reg['images'].items():
        if e['status'] != 'DEPLOYED':
            continue
        page = plan[art_id]['url'].replace(SITE, a.site)
        img_url = a.site + e['file']
        try:
            with urllib.request.urlopen(page, timeout=30) as r:
                html = r.read().decode('utf-8', 'replace')
            ok_page = ('/' + e['file']) in html
            with urllib.request.urlopen(urllib.request.Request(img_url, method='HEAD'), timeout=30) as r:
                ok_img = r.status == 200 and 'image/webp' in r.headers.get('Content-Type', '')
        except Exception as x:  # network errors keep the entry DEPLOYED
            print(f'{art_id}: live check error {x}')
            bad += 1
            continue
        if ok_page and ok_img:
            e['status'] = 'LIVE_VERIFIED'
            e['live_verified'] = date.today().isoformat()
            n += 1
        else:
            print(f'{art_id}: page has image={ok_page} image served={ok_img}')
            bad += 1
    save_registry(reg)
    print(f'{n} LIVE_VERIFIED, {bad} not yet')


def cmd_status(_a):
    reg = load_registry()
    plan = load_plan()
    counts = {s: 0 for s in STATUSES}
    for e in reg['images'].values():
        counts[e['status']] = counts.get(e['status'], 0) + 1
    pending = [i for i, r in plan.items() if r['scope'] == 'TARGET' and i not in reg['images']]
    print(json.dumps({'registry': len(reg['images']), 'counts': counts,
                      'target_without_image': len(pending), 'next': pending[:10]}, ensure_ascii=False, indent=2))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    p = sub.add_parser('record')
    p.add_argument('id'); p.add_argument('--url', required=True); p.add_argument('--tool', required=True)
    p.add_argument('--model', required=True); p.add_argument('--node'); p.add_argument('--figma-file')
    p.add_argument('--expires'); p.add_argument('--width', type=int); p.add_argument('--height', type=int)
    p.add_argument('--force', action='store_true')
    p = sub.add_parser('download'); p.add_argument('id'); p.add_argument('--raw-dir', default='/tmp/motoai-image-raw')
    p = sub.add_parser('optimize'); p.add_argument('id'); p.add_argument('raw'); p.add_argument('--max-kb', type=int, default=200)
    p = sub.add_parser('attach'); p.add_argument('id'); p.add_argument('--alt', required=True); p.add_argument('--caption')
    sub.add_parser('qa')
    p = sub.add_parser('deployed'); p.add_argument('sha')
    p = sub.add_parser('live'); p.add_argument('--site', default=SITE)
    sub.add_parser('status')
    a = ap.parse_args()
    {'record': cmd_record, 'download': cmd_download, 'optimize': cmd_optimize, 'attach': cmd_attach,
     'qa': cmd_qa, 'deployed': cmd_deployed, 'live': cmd_live, 'status': cmd_status}[a.cmd](a)


if __name__ == '__main__':
    main()
