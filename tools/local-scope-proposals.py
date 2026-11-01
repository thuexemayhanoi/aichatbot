#!/usr/bin/env python3
"""LOCAL-SCOPE proposals (Master SEO 2026, RR-13) — REVIEW_REQUIRED, not applied.

286 published LOCAL articles have an empty `local_scope` in
data/blog/content-matrix.csv (the owner-controlled source of truth, which
agents do not edit). This tool proposes a scope for each of them from
evidence only:

  * VERIFIED_UNIT — a ward/commune name of data/local/hanoi.json (Nghị quyết
    1656/NQ-UBTVQH15, after the 01/07/2025 reorganisation) appears as a whole
    phrase in the article's title or primary keyword;
  * CITY_WIDE — the article names "Hà Nội" only (no smaller verified unit);
  * OUTSIDE_HANOI — the title names a place outside Hà Nội (from the
    `outside` list below, which only holds province / destination names);
  * ORIGIN_ONLY — the only verified unit is the starting point ("… từ Long
    Biên", where the shop is), not the article's area: no proposal;
  * NO_PLACE — no place name at all: the owner decides.

A landmark (Hồ Tây, Phố Cổ …) is NOT mapped to a ward: a lake or a quarter can
span several wards and the mapping is unverified. Output:
docs/seo/master-2026/local-scope-proposals.csv. Nothing is published.
"""
import csv
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'docs/seo/master-2026/local-scope-proposals.csv'
OUTSIDE = ['Ninh Bình', 'Hạ Long', 'Hòa Bình', 'Mai Châu', 'Mộc Châu', 'Tam Đảo', 'Sapa', 'Sa Pa', 'Hà Giang',
           'Bắc Ninh', 'Hưng Yên', 'Văn Giang', 'Bái Đính', 'Tràng An', 'Cát Bà', 'Hải Phòng']


def nfc(s):
    return unicodedata.normalize('NFC', s or '')


def has(hay, phrase):
    return re.search(r'(?<![^\W_])' + re.escape(nfc(phrase).lower()) + r'(?![^\W_])', hay) is not None


def main():
    units = json.loads((ROOT / 'data/local/hanoi.json').read_text(encoding='utf-8'))['units']
    names = sorted({u['name'] for u in units if u.get('active', True) and u.get('name')}, key=len, reverse=True)
    utype = {u['name']: u.get('type', '') for u in units}
    meta = json.loads((ROOT / 'data/seo/article-meta.json').read_text(encoding='utf-8'))
    meta = meta.get('articles', meta)
    rows = [r for r in csv.DictReader((ROOT / 'data/blog/content-matrix.csv').open(encoding='utf-8'))
            if r['category'] == 'LOCAL' and r['status'] == 'PUBLISHED' and not r['local_scope'].strip()]
    out = []
    for r in rows:
        title = (meta.get(r['article_id'], {}).get('title') or r['working_title'])
        hay = nfc(' | '.join([title, r['primary_keyword']])).lower()
        found = [n for n in names if has(hay, n)]
        # "… từ Long Biên" names the starting point (the shop), not the article's area.
        origin = [n for n in found if has(hay, 'từ ' + n)]
        found = [n for n in found if n not in origin]
        outside = [o for o in OUTSIDE if has(hay, o)]
        if found:
            basis, proposal = 'VERIFIED_UNIT', '; '.join(found)
            kind = '; '.join(utype.get(n, '') for n in found)
        elif outside:
            basis, proposal, kind = 'OUTSIDE_HANOI', '; '.join(outside), 'ngoài Hà Nội / điểm đến'
        elif has(hay, 'hà nội'):
            basis, proposal, kind = 'CITY_WIDE', 'Hà Nội', 'thành phố'
        elif origin:
            basis, proposal, kind = 'ORIGIN_ONLY', '', 'chỉ nêu điểm xuất phát: ' + '; '.join(origin)
        else:
            basis, proposal, kind = 'NO_PLACE', '', ''
        out.append({'article_id': r['article_id'], 'title': title, 'primary_keyword': r['primary_keyword'],
                    'proposed_local_scope': proposal, 'basis': basis, 'unit_type': kind,
                    'source': 'data/local/hanoi.json (NQ 1656/NQ-UBTVQH15)' if basis == 'VERIFIED_UNIT' else '',
                    'status': 'REVIEW_REQUIRED'})
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open('w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=list(out[0].keys()), lineterminator='\n')
        w.writeheader()
        w.writerows(out)
    from collections import Counter
    print(f'wrote {OUT.relative_to(ROOT)}: {len(out)} rows', dict(Counter(o["basis"] for o in out)))


if __name__ == '__main__':
    main()
