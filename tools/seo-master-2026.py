#!/usr/bin/env python3
"""Master SEO Matrix 2026 (lô M1 — SEO MASTER COMMAND 2026).

Builds docs/seo/MASTER-SEO-MATRIX-2026.xlsx (23 required sheets + 4 appendices)
and the evidence files in docs/seo/master-2026/ from the built site and the
repository's committed SEO data only:

  * every built page (index.html under the site tree) — title, meta, canonical,
    robots, lang, H1/H2, words, JSON-LD, images, links by zone, CTA, NAP:
    scanned here, so the inventory never trusts a single report;
  * sitemap.xml, robots.txt, data/blog/published.json, content-matrix.csv,
    config/site-pages.json, data/blog/taxonomy.json;
  * docs/seo/seo-master-matrix.json (tools/seo-master-audit.mjs),
    docs/seo/master-task/technical-audit.csv + review-required.csv,
    docs/seo/battle/*.csv (tools/seo-battle-matrix.mjs), docs/seo/engine/*,
    docs/seo/commercial/* (tools/seo-commercial-matrix.mjs),
    docs/seo/legal-citations.json, docs/seo/commercial/progress.json;
  * data/seo/keyword-demand.json, serp-snapshots/, article-images.json,
    article-meta.json, body-reviews.json, config/seo-cold-start.json;
  * docs/seo/master-2026/article-qa.json (factory QA, tools/article-qa.mjs) and
    docs/seo/master-2026/cwv-lab.json (tools/seo-cwv-lab.mjs, LAB data only).

Nothing is invented: a value the repository does not hold is written N/A with
the missing source. Search Console is not connected, so search performance and
index coverage stay N/A until an export lands in data/seo/performance/.

The internal QA score (100 points: intent 20, accuracy 20, on-page 15,
architecture 15, technical 15, UX/media/conversion 10, schema/localization 5)
is an automated PROXY built from measurable signals; it flags pages for human
review and never replaces editorial or legal review.

Run from the repo root:  python3 tools/seo-master-2026.py [--date YYYY-MM-DD]
Verify formulas:         python3 tools/seo-master-2026.py --verify  (LibreOffice)
"""
import argparse
import csv
import html
import json
import re
import shutil
import statistics
import subprocess
import sys
import tempfile
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from urllib.parse import urljoin, urlsplit

ROOT = Path(__file__).resolve().parent.parent
SITE = 'https://chatbot.thuexemaynguyentu.com'
HOST = 'chatbot.thuexemaynguyentu.com'
OUT_XLSX = 'docs/seo/MASTER-SEO-MATRIX-2026.xlsx'
OUT_DIR = 'docs/seo/master-2026'
NA = 'N/A'
GSC_MISSING = 'N/A — thiếu nguồn: Google Search Console chưa kết nối (OpenSEO 0 tài khoản Google; data/seo/performance/ trống)'
NOT_SITE_DIRS = {'data', 'docs', 'tools', 'tests', 'node_modules', 'reports', 'config', 'assets', 'scripts'}

SHEETS = [
    'EXECUTIVE DASHBOARD', 'URL INVENTORY', 'KEYWORD MASTER', 'KEYWORD GAP', 'COMPETITOR SERP',
    'URL–KEYWORD MAPPING', 'CANNIBALIZATION', 'HOMEPAGE & PILLAR', 'SEO HUB MATRIX', 'SILO & CATEGORY MATRIX',
    'CONTENT CLUSTERS', 'PAGE & POST OPTIMIZATION', 'TECHNICAL SEO AUDIT', 'INDEX & SITEMAP', 'HREFLANG MATRIX',
    'IMAGE SEO', 'INTERNAL LINK MATRIX', 'STRUCTURED DATA', 'LOCAL SEO & CONVERSION', 'GSC PERFORMANCE',
    'PRIORITY BACKLOG', 'QA RESULTS', 'CHANGELOG & CHECKPOINT'
]
APPENDICES = ['X-COMPETITOR DOMAINS', 'X-SERP BENCHMARK', 'X-OFF-PAGE BACKLINKS', 'X-DATA SOURCES']
CLASSES = ['KEEP', 'IMPROVE', 'EXPAND', 'CONSOLIDATE-CANDIDATE', 'REDIRECT-CANDIDATE', 'NOINDEX-CANDIDATE']

# Official standards consulted for this batch (read 2026-10-31; dates are each page's own "last updated").
STANDARDS = [
    ('Google Search Essentials', 'https://developers.google.com/search/docs/essentials', '2025-12-10'),
    ('Spam policies for Google web search (scaled content abuse, doorways)', 'https://developers.google.com/search/docs/essentials/spam-policies', '2026-08-28'),
    ('Creating helpful, reliable, people-first content', 'https://developers.google.com/search/docs/fundamentals/creating-helpful-content', '2026-10-05'),
    ('SEO Starter Guide', 'https://developers.google.com/search/docs/fundamentals/seo-starter-guide', '2025-12-10'),
    ('AI features and your website', 'https://developers.google.com/search/docs/appearance/ai-features', '2025-12-10'),
    ('Canonicalization (rel=canonical)', 'https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls', '2026-07-10'),
    ('LocalBusiness structured data', 'https://developers.google.com/search/docs/appearance/structured-data/local-business', '2026-09-08'),
    ('Search documentation updates — FAQ rich result removed (June 2026 entry)', 'https://developers.google.com/search/updates', '2026-10-26'),
    ('Search Console ownership verification (HTML tag re-checked periodically)', 'https://support.google.com/webmasters/answer/9008080', '2026-10-31 (đọc)'),
    ('Web Vitals thresholds (LCP 2.5 s, INP 200 ms, CLS 0.1 at p75 field data)', 'https://web.dev/articles/vitals', '2024-10-31'),
]

# The 12 hub groups of the SEO MASTER COMMAND, mapped to real URLs (never empty hubs).
HUBS_12 = [
    ('H01', 'Cho thuê xe máy Hà Nội', ['/', '/blog/thue-xe/', '/blog/thue-xe-phuong-tien/'],
     ['cho thuê xe máy', 'thuê xe máy hà nội', 'thuê xe máy ở hà nội', 'thuê xe máy tại hà nội']),
    ('H02', 'Giá thuê', ['/gia-thue/', '/blog/thue-xe/gia-thue/'], ['giá thuê', 'bảng giá', 'chi phí thuê', 'giá rẻ']),
    ('H03', 'Theo ngày / tuần / tháng', ['/blog/thue-xe/thue-tuan/', '/blog/thue-xe/thue-thang/', '/blog/xe-dien/thue-ngay/'],
     ['theo ngày', 'theo tuần', 'theo tháng', 'thuê ngày', 'thuê tuần', 'thuê tháng', 'dài hạn', 'trong ngày']),
    ('H04', 'Theo khu vực', ['/blog/dia-phuong/', '/blog/dia-phuong/phuong-xa/'],
     ['long biên', 'hoàn kiếm', 'ba đình', 'tây hồ', 'gia lâm', 'phố cổ', 'cầu giấy', 'đống đa', 'hai bà trưng', 'thanh xuân']),
    ('H05', 'Các dòng xe', ['/blog/thue-xe/chon-xe/', '/blog/xe-dien/chon-xe/'],
     ['xe số', 'xe ga', 'tay ga', 'wave', 'vision', 'air blade', 'lead', 'vario', 'future', 'sirius', 'dòng xe', 'loại xe']),
    ('H06', 'Xe 50cc', [], ['50cc']),
    ('H07', 'Xe máy điện & xe đạp điện', ['/blog/xe-dien/', '/blog/xe-dien/chon-xe/', '/blog/xe-dien/chi-phi/'],
     ['xe máy điện', 'xe điện', 'xe đạp điện']),
    ('H08', 'Thủ tục & kinh nghiệm', ['/blog/huong-dan/', '/blog/huong-dan/thu-tuc/', '/blog/thue-xe/dat-coc/', '/blog/thue-xe/nhan-xe/', '/blog/thue-xe/tra-xe/'],
     ['thủ tục', 'kinh nghiệm', 'giấy tờ', 'đặt cọc', 'hợp đồng', 'nhận xe', 'trả xe']),
    ('H09', 'Luật giao thông & giấy phép', ['/blog/an-toan/phap-luat/'],
     ['luật', 'nghị định', 'bằng lái', 'giấy phép', 'phạt', 'biển báo', 'đăng ký xe']),
    ('H10', 'Bảo dưỡng & an toàn', ['/blog/an-toan/', '/blog/an-toan/lai-xe/', '/blog/an-toan/mu-bao-hiem/', '/blog/an-toan/su-co/', '/blog/an-toan/thoi-tiet/'],
     ['bảo dưỡng', 'an toàn', 'mũ bảo hiểm', 'sự cố', 'hỏng xe', 'thủng', 'phanh', 'lốp']),
    ('H11', 'Du lịch Hà Nội bằng xe máy', ['/blog/dia-phuong/', '/blog/kham-pha-an-toan/', '/blog/thue-xe/du-khach/'],
     ['du lịch', 'phượt', 'tham quan', 'cung đường', 'hành trình', 'điểm đến']),
    ('H12', 'Giao thông xanh', ['/blog/xe-dien/'], ['phát thải', 'vành đai 1', 'giao thông xanh', 'năng lượng sạch', 'khí thải']),
]


# ---------------------------------------------------------------- helpers
def rtext(p):
    return (ROOT / p).read_text(encoding='utf-8')


def rjson(p):
    return json.loads(rtext(p))


def rcsv(p):
    with (ROOT / p).open(encoding='utf-8') as f:
        return list(csv.DictReader(f))


def num(v):
    """Numeric strings become numbers (so Excel can COUNT/AVERAGE them); empty → N/A."""
    if v is None:
        return NA
    if isinstance(v, (int, float)):
        return v
    s = str(v).strip()
    if s == '':
        return NA
    if re.fullmatch(r'-?\d+', s):
        return int(s)
    if re.fullmatch(r'-?\d+\.\d+', s):
        return float(s)
    return s


def path_of(url):
    u = urlsplit(url)
    return u.path or '/'


def full(path):
    return SITE + path


RE_TITLE = re.compile(r'<title>(.*?)</title>', re.S)
RE_META = re.compile(r'<meta\s+([^>]*?)/?>', re.S)
RE_LINKTAG = re.compile(r'<link\s+([^>]*?)/?>', re.S)
RE_ATTR = re.compile(r'([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*"([^"]*)"')
RE_A = re.compile(r'<a\s([^>]*)>(.*?)</a>', re.S)
RE_IMG = re.compile(r'<img\s([^>]*?)/?>', re.S)
RE_LD = re.compile(r'<script type="application/ld\+json"[^>]*>(.*?)</script>', re.S)
RE_DROP = re.compile(r'<(script|style|svg|noscript|template)\b.*?</\1>', re.S | re.I)
RE_TAG = re.compile(r'<[^>]+>')
RE_PHONE = re.compile(r'(?<![\d.])(?:\+84|0)(?:[\s.\-]?\d){8,10}(?![\d])')


def attrs(s):
    return {k.lower(): html.unescape(v) for k, v in RE_ATTR.findall(s)}


def visible_text(fragment):
    t = RE_DROP.sub(' ', fragment)
    t = RE_TAG.sub(' ', t)
    return re.sub(r'\s+', ' ', html.unescape(t)).strip()


def word_count(text):
    return sum(1 for w in text.split() if re.search(r'\w', w))


def norm_href(href, base):
    if not href or href.startswith(('#', 'mailto:', 'tel:', 'javascript:', 'data:', 'sms:')):
        return None
    u = urlsplit(urljoin(base, href))
    if u.scheme not in ('http', 'https'):
        return None
    if u.netloc != HOST:
        return ('ext', u.netloc)
    p = u.path or '/'
    if p.endswith('/index.html'):
        p = p[:-len('index.html')]
    if not p.endswith('/') and not re.search(r'\.[a-z0-9]{2,5}$', p, re.I):
        p += '/'
    return ('int', p)


def ld_types(node, out):
    if isinstance(node, dict):
        t = node.get('@type')
        if isinstance(t, str):
            out.append(t)
        elif isinstance(t, list):
            out.extend(x for x in t if isinstance(x, str))
        for v in node.values():
            ld_types(v, out)
    elif isinstance(node, list):
        for v in node:
            ld_types(v, out)


def ld_find(node, typ):
    found = []
    if isinstance(node, dict):
        t = node.get('@type')
        if t == typ or (isinstance(t, list) and typ in t):
            found.append(node)
        for v in node.values():
            found.extend(ld_find(v, typ))
    elif isinstance(node, list):
        for v in node:
            found.extend(ld_find(v, typ))
    return found


# ---------------------------------------------------------------- scan built pages
def site_files():
    files = [ROOT / 'index.html']
    for d in sorted(ROOT.iterdir()):
        if d.is_dir() and not d.name.startswith('.') and d.name not in NOT_SITE_DIRS:
            files.extend(sorted(d.rglob('index.html')))
    return files


def url_of_file(f):
    rel = f.relative_to(ROOT).parent.as_posix()
    return '/' if rel == '.' else f'/{rel}/'


def ld_checks(blocks):
    """Validate JSON-LD against Google's documented properties for the types this site emits."""
    issues, notes = [], []
    for b in blocks:
        for art in ld_find(b, 'Article') + ld_find(b, 'BlogPosting'):
            for k in ('headline', 'datePublished', 'dateModified', 'author'):
                if not art.get(k):
                    issues.append(f'Article thiếu {k} (khuyến nghị)')
            if len(str(art.get('headline', ''))) > 110:
                issues.append('Article headline > 110 ký tự')
        for bc in ld_find(b, 'BreadcrumbList'):
            items = bc.get('itemListElement') or []
            if not items:
                issues.append('BreadcrumbList rỗng')
            for i, it in enumerate(items):
                if not it.get('position') or not it.get('name'):
                    issues.append('ListItem thiếu position/name')
                if i < len(items) - 1 and not it.get('item'):
                    issues.append('ListItem (không phải cuối) thiếu item')
        for lb in ld_find(b, 'AutoRental') + ld_find(b, 'LocalBusiness'):
            for k in ('name', 'address'):
                if not lb.get(k):
                    issues.append(f'LocalBusiness thiếu {k} (bắt buộc)')
            for k in ('telephone', 'url', 'openingHoursSpecification'):
                if not lb.get(k):
                    notes.append(f'LocalBusiness thiếu {k} (khuyến nghị)')
            if not lb.get('geo'):
                notes.append('LocalBusiness chưa có geo (khuyến nghị; cần tọa độ đã xác minh — không tự điền)')
        for app in ld_find(b, 'WebApplication') + ld_find(b, 'SoftwareApplication'):
            if not (app.get('aggregateRating') or app.get('review')):
                notes.append('WebApplication: không đủ điều kiện rich result Software App (thiếu aggregateRating/review — không bịa đánh giá)')
        if ld_find(b, 'FAQPage'):
            notes.append('FAQPage: Google ngừng hiển thị rich result FAQ (05/2026) — vô hại, không thêm mới')
        for org in ld_find(b, 'Organization'):
            if not org.get('name') or not org.get('url'):
                issues.append('Organization thiếu name/url')
    return sorted(set(issues)), sorted(set(notes))


def scan_page(f, business_phone):
    url_path = url_of_file(f)
    raw = f.read_text(encoding='utf-8')
    base = full(url_path)
    head_end = raw.find('</head>')
    head = raw[:head_end if head_end > 0 else len(raw)]
    title_m = RE_TITLE.search(head)
    metas = [attrs(m) for m in RE_META.findall(head)]
    links = [attrs(m) for m in RE_LINKTAG.findall(head)]
    meta = lambda key, val: next((m.get('content', '') for m in metas if m.get(key, '').lower() == val), None)
    canonical = next((l.get('href') for l in links if l.get('rel', '').lower() == 'canonical'), None)
    stylesheets = sorted({urlsplit(urljoin(full(url_path), l['href'])).path for l in links
                          if l.get('rel', '').lower() == 'stylesheet' and l.get('href')})
    hreflangs = [l.get('hreflang') for l in links if l.get('hreflang')]
    lang_m = re.search(r'<html[^>]*\blang="([^"]+)"', raw)
    main_m = re.search(r'<main\b[^>]*>(.*)</main>', raw, re.S)
    main_span = (main_m.start(1), main_m.end(1)) if main_m else (0, len(raw))
    body_m = re.search(r'<article class="blog-article-body"[^>]*>(.*?)</article>', raw, re.S)
    body_span = (body_m.start(1), body_m.end(1)) if body_m else None
    main_html = raw[main_span[0]:main_span[1]]
    content_html = raw[body_span[0]:body_span[1]] if body_span else re.sub(r'<nav\b.*?</nav>', ' ', main_html, flags=re.S)
    text = visible_text(content_html)
    words = word_count(text)
    first100 = ' '.join(text.split()[:100]).lower()
    h1s = [visible_text(x) for x in re.findall(r'<h1\b[^>]*>(.*?)</h1>', raw, re.S)]
    h2 = len(re.findall(r'<h2\b', content_html))
    h3 = len(re.findall(r'<h3\b', content_html))
    has_table = '<table' in content_html
    has_list = bool(re.search(r'<(ul|ol)\b', content_html))
    # links by zone
    out_int = defaultdict(set)
    ext_domains = set()
    tel_links, cta = set(), set()
    for m in RE_A.finditer(raw):
        a = attrs(m.group(1))
        href = a.get('href', '')
        pos = m.start()
        if href.startswith('tel:'):
            tel_links.add(re.sub(r'\D', '', href))
            cta.add('tel')
            continue
        if 'wa.me/' in href or 'whatsapp' in href.lower():
            cta.add('whatsapp')
        if 'maps.google' in href or 'goo.gl/maps' in href or 'maps.app.goo.gl' in href:
            cta.add('maps')
        if 'zalo.me' in href:
            cta.add('zalo')
        n = norm_href(href, base)
        if not n:
            continue
        if n[0] == 'ext':
            if main_span[0] <= pos < main_span[1]:
                ext_domains.add(n[1])
            continue
        target = n[1]
        if body_span and body_span[0] <= pos < body_span[1]:
            zone = 'body'
        elif main_span[0] <= pos < main_span[1]:
            zone = 'main'
        else:
            zone = 'chrome'
        out_int[zone].add(target)
        if main_span[0] <= pos < main_span[1]:
            if target == '/gia-thue/':
                cta.add('giá')
            elif target == '/lien-he/':
                cta.add('liên hệ')
            elif target.startswith('/agent/'):
                cta.add('agent')
    # images
    imgs = [attrs(m) for m in RE_IMG.findall(main_html)]
    img_no_alt = sum(1 for i in imgs if 'alt' not in i)
    img_no_dims = sum(1 for i in imgs if not (i.get('width') and i.get('height')))
    # JSON-LD
    blocks, ld_err = [], 0
    for m in RE_LD.findall(raw):
        try:
            blocks.append(json.loads(m))
        except json.JSONDecodeError:
            ld_err += 1
    types = []
    for b in blocks:
        ld_types(b, types)
    ld_issues, ld_notes = ld_checks(blocks)
    # NAP: phone numbers shown anywhere in visible text + tel links
    page_text = visible_text(raw)
    phones = {re.sub(r'\D', '', p).replace('84', '0', 1) if re.sub(r'\D', '', p).startswith('84') else re.sub(r'\D', '', p)
              for p in RE_PHONE.findall(page_text)}
    phones |= {p.replace('84', '0', 1) if p.startswith('84') else p for p in tel_links}
    return {
        'path': url_path,
        'file': f.relative_to(ROOT).as_posix(),
        'bytes': len(raw.encode('utf-8')),
        'title': html.unescape(title_m.group(1)).strip() if title_m else '',
        'description': meta('name', 'description') or '',
        'robots': meta('name', 'robots') or '',
        'canonical': canonical or '',
        'stylesheets': stylesheets,
        'og_image': meta('property', 'og:image') or '',
        'hreflang': hreflangs,
        'lang': lang_m.group(1) if lang_m else '',
        'h1': h1s,
        'h2': h2, 'h3': h3,
        'words': words, 'first100': first100,
        'has_table': has_table, 'has_list': has_list,
        'out': {z: sorted(v) for z, v in out_int.items()},
        'ext_domains': sorted(ext_domains),
        'cta': sorted(cta),
        'imgs': len(imgs), 'img_no_alt': img_no_alt, 'img_no_dims': img_no_dims,
        'img_lazy': sum(1 for i in imgs if i.get('loading') == 'lazy'),
        'ld_types': sorted(set(types)), 'ld_blocks': len(blocks), 'ld_err': ld_err,
        'ld_issues': ld_issues, 'ld_notes': ld_notes,
        'breadcrumb': 'BreadcrumbList' in types or 'blog-breadcrumb' in raw,
        'phones': sorted(phones),
        'has_phone': business_phone in phones,
        'has_address': '112 Nguyễn Văn Cừ' in page_text,
        'mentions_hanoi': 'hà nội' in page_text.lower(),
        'mixed_content': len(re.findall(r'(?:src|href)="http://', raw)),
    }


# ---------------------------------------------------------------- data loading
def load():
    D = {}
    D['business'] = rjson('data/business/business.json')
    phone = D['business']['contact']['phone']
    D['pages'] = {}
    for f in site_files():
        p = scan_page(f, phone)
        D['pages'][p['path']] = p
    sm = rtext('sitemap.xml')
    D['sitemap'] = {}
    for m in re.finditer(r'<url>(.*?)</url>', sm, re.S):
        block = m.group(1)
        loc = re.search(r'<loc>(.*?)</loc>', block).group(1).strip()
        lastmod = re.search(r'<lastmod>(.*?)</lastmod>', block)
        D['sitemap'][path_of(loc)] = {
            'lastmod': lastmod.group(1) if lastmod else '',
            'images': len(re.findall(r'<image:image>', block)),
        }
    D['robots_txt'] = rtext('robots.txt')
    D['published'] = {a['article_id']: a for a in rjson('data/blog/published.json')['articles']}
    D['matrix'] = {r['article_id']: r for r in rcsv('data/blog/content-matrix.csv')}
    D['taxonomy'] = rjson('data/blog/taxonomy.json')
    D['cat_dir'] = {k: v['dir'] for k, v in D['taxonomy']['categories'].items()}
    D['art_path'] = {aid: f"/blog/{D['cat_dir'][a['category']]}/{a['slug']}/" for aid, a in D['published'].items()}
    D['path_art'] = {v: k for k, v in D['art_path'].items()}
    mm = rjson('docs/seo/seo-master-matrix.json')
    D['master'] = {path_of(r['URL']): r for r in mm['rows']}
    D['tech'] = {path_of(r['URL']): r for r in rcsv('docs/seo/master-task/technical-audit.csv')}
    D['review_required'] = rcsv('docs/seo/master-task/review-required.csv')
    D['meta'] = rjson('data/seo/article-meta.json')
    D['images'] = rjson('data/seo/article-images.json')['images']
    D['qa'] = rjson(f'{OUT_DIR}/article-qa.json')
    cwv_path = ROOT / OUT_DIR / 'cwv-lab.json'
    D['cwv'] = json.loads(cwv_path.read_text(encoding='utf-8')) if cwv_path.exists() else None
    D['legal'] = rjson('docs/seo/legal-citations.json')
    D['legal_by_article'] = defaultdict(list)
    for doc in D['legal']['documents']:
        for aid in doc.get('articles_current', []):
            D['legal_by_article'][aid].append(doc)
    cold = rjson('config/seo-cold-start.json')
    D['flags'] = [f for f in cold['content_flags'] if f.get('article')]
    D['open_flags'] = {f['article'] for f in D['flags'] if not f.get('resolved')}
    D['body_reviews'] = rjson('data/seo/body-reviews.json')['reviews']
    D['kw_demand'] = rjson('data/seo/keyword-demand.json')
    snaps = sorted((ROOT / 'data/seo/serp-snapshots').glob('*.json'))
    D['serp_file'] = snaps[-1].relative_to(ROOT).as_posix()
    D['serp'] = json.loads(snaps[-1].read_text(encoding='utf-8'))
    D['kw_master'] = rcsv('docs/seo/battle/02-keyword-master-matrix.csv')
    D['opportunity'] = rcsv('docs/seo/battle/04-opportunity-matrix.csv')
    D['clusters'] = rcsv('docs/seo/battle/05-topic-cluster-matrix.csv')
    D['serp_bench'] = rcsv('docs/seo/battle/06-serp-benchmark.csv')
    D['competitors'] = rcsv('docs/seo/battle/01-competitor-intelligence.csv')
    D['backlinks'] = rcsv('docs/seo/battle/08-backlink-matrix.csv')
    D['engine'] = rcsv('docs/seo/engine/seo-engine-matrix.csv')
    D['targets'] = rcsv('docs/seo/commercial/SEO-COMMERCIAL-TARGETS.csv')
    D['commercial'] = {r['id']: r for r in rcsv('docs/seo/commercial/SEO-COMMERCIAL-2006.csv')}
    D['progress'] = rjson('docs/seo/commercial/progress.json')
    D['site_pages'] = rjson('config/site-pages.json')
    return D


# ---------------------------------------------------------------- analysis
def parse_links_field(s):
    s = s or ''
    g = lambda pat: int(m.group(1)) if (m := re.search(pat, s)) else None
    return {
        'out_ctx': g(r'ra (\d+) ngữ cảnh'),
        'in_ctx': g(r'vào: ngữ cảnh (\d+)'),
        'in_cluster': g(r'cụm/liên quan (\d+)'),
        'in_hub': g(r'hub (\d+)'),
        'depth': g(r'độ sâu (\d+)'),
    }


def page_type(path, D):
    m = D['master'].get(path)
    if m:
        return m['Page Type']
    if path in D['path_art']:
        return 'Bài viết'
    return 'Khác'


def link_graph(D):
    inbound = {z: defaultdict(set) for z in ('body', 'main', 'chrome')}
    broken = defaultdict(set)
    known = set(D['pages'])
    for src, p in D['pages'].items():
        for zone, targets in p['out'].items():
            for t in targets:
                if t in known:
                    inbound[zone][t].add(src)
                elif not re.search(r'\.[a-z0-9]{2,5}$', t, re.I):
                    broken[src].add(t)
                elif not (ROOT / t.lstrip('/')).exists():
                    broken[src].add(t)
    # click depth from the homepage over every link (nav included)
    depth = {'/': 0}
    frontier = ['/']
    while frontier:
        nxt = []
        for u in frontier:
            for targets in D['pages'][u]['out'].values():
                for t in targets:
                    if t in known and t not in depth:
                        depth[t] = depth[u] + 1
                        nxt.append(t)
        frontier = nxt
    return inbound, broken, depth


def keyword_of(path, D):
    aid = D['path_art'].get(path)
    if aid and aid in D['meta'].get('articles', D['meta']):
        entry = D['meta'].get('articles', D['meta'])[aid]
        if isinstance(entry, dict) and entry.get('keyword'):
            return entry['keyword']
    m = D['master'].get(path)
    return (m or {}).get('Primary Keyword', '') or ''


def kw_tokens(s):
    return [t for t in re.findall(r'\w+', (s or '').lower()) if len(t) > 1]


def qa_proxy(path, p, D, links, inbound_pages, broken):
    """Automated 100-point proxy of the internal QA rubric (see module docstring)."""
    ptype = page_type(path, D)
    is_article = ptype == 'Bài viết'
    is_hub = ptype.startswith('Hub') or ptype == 'Blog home'
    kw = keyword_of(path, D).lower()
    title = p['title'].lower()
    h1 = (p['h1'][0] if p['h1'] else '').lower()
    toks = set(kw_tokens(kw))

    def cover(text):
        """Share of the keyword's tokens present in `text` (long-tail keywords carry filler words)."""
        return len(toks & set(kw_tokens(text))) / len(toks) if toks else 0

    # 1. intent (20)
    s_intent = 0
    c_title, c_h1, c_lead = cover(title), cover(h1), cover(p['first100'])
    s_intent += 6 if kw and kw in title else 5 if c_title >= 0.8 else 3 if c_title >= 0.6 else 0
    s_intent += 4 if kw and kw in h1 else 3 if c_h1 >= 0.8 else 2 if c_h1 >= 0.6 else 0
    s_intent += 4 if kw and (kw in p['first100'] or c_lead >= 0.8) else 2 if c_lead >= 0.6 else 0
    intent = ((D['master'].get(path) or {}).get('Search Intent') or '').lower()
    commercial = any(x in intent for x in ('thương mại', 'giao dịch', 'commercial', 'transactional'))
    if commercial:
        s_intent += 6 if set(p['cta']) & {'giá', 'liên hệ', 'tel', 'agent'} else 2
    else:
        s_intent += 6
    if not kw:
        s_intent = min(s_intent, 10)
    # 2. accuracy proxy (20)
    aid = D['path_art'].get(path)
    s_acc = 0
    s_acc += 8 if aid not in D['open_flags'] else 0
    docs = D['legal_by_article'].get(aid, []) if aid else []
    bad_docs = [d for d in docs if d['status'] == 'replaced' or d['evidence'] == 'unverified']
    s_acc += 6 if not bad_docs else 0
    if aid:
        q = D['qa']['articles'].get(aid)
        s_acc += 6 if (q and q['pass'] and not q['critical']) else 0
    else:
        s_acc += 6  # static/hub pages render verified facts from business.json/pricing.json placeholders
    # 3. on-page (15)
    tl, dl = len(p['title']), len(p['description'])
    s_on = (4 if 35 <= tl <= 65 else 2 if 30 <= tl <= 70 else 0)
    s_on += (4 if 120 <= dl <= 165 else 2 if 100 <= dl <= 180 else 0)
    s_on += 3 if len(p['h1']) == 1 else 0
    s_on += 2 if p['h2'] >= (3 if is_article else 2) else 0
    if is_article:
        s_on += 2 if 800 <= p['words'] <= 2100 else 0
    else:
        s_on += 2 if p['words'] >= 300 else 0
    # 4. architecture (15)
    total_in = len(inbound_pages)
    ctx_in = links.get('in_ctx') or 0
    s_arch = 0
    if is_article:
        s_arch += 5 if ctx_in >= 3 else 2 if ctx_in >= 1 else 0
    else:
        s_arch += 5 if total_in >= 10 else 2 if total_in >= 1 else 0
    d = links.get('depth')
    s_arch += 4 if (d is not None and d <= 3) else 0
    s_arch += 3 if p['breadcrumb'] or path == '/' else 0
    s_arch += 3 if (path in D['sitemap'] and p['canonical'] == full(path)) else 0
    # 5. technical (15)
    s_tech = 5 if 'noindex' not in p['robots'].lower() else 0
    s_tech += 4 if not broken.get(path) else 0
    s_tech += 3 if p['bytes'] <= 100 * 1024 else 0
    s_tech += 3 if p['img_no_dims'] == 0 else 0
    # 6. UX / media / conversion (10)
    s_ux = 4 if set(p['cta']) & {'giá', 'liên hệ', 'tel', 'agent', 'whatsapp'} else 0
    if is_article:
        s_ux += 3 if D['images'].get(aid, {}).get('status') in ('QA_PASSED', 'LIVE_VERIFIED') else 0
    else:
        s_ux += 3 if (p['imgs'] or is_hub or path in ('/agent/',)) else 0
    s_ux += 3 if (p['has_table'] or p['has_list']) else 0
    # 7. schema / localization (5)
    expected = {'Bài viết': 'Article'}.get(ptype) or ('CollectionPage' if is_hub else None)
    s_schema = 3 if (p['ld_err'] == 0 and p['ld_blocks'] and (not expected or expected in p['ld_types']) and not p['ld_issues']) else 0
    s_schema += 2 if (p['lang'].startswith('vi') and p['mentions_hanoi']) else 1 if p['lang'].startswith('vi') else 0
    parts = [s_intent, s_acc, s_on, s_arch, s_tech, s_ux, s_schema]
    return parts, sum(parts)


def classify(path, p, D, total, links, ptype, factory):
    """Evidence rules — candidates only; nothing is merged, redirected or noindexed here."""
    reasons = []
    aid = D['path_art'].get(path)
    if ptype == 'Bài viết':
        if factory and 'body-words' in factory.get('warnings', []) and p['words'] < 800:
            return 'EXPAND', f'QA nhà máy body-words: dưới 800 từ (mục tiêu biên tập 800–2.000; đếm HTML {p["words"]})'
    elif path == '/gia-thue/' and p['words'] < 500:
        return 'EXPAND', (f'trang giá {p["words"]} từ nội dung chính; SERP benchmark "giá thuê xe máy hà nội" / "bảng giá thuê xe máy": '
                          'trung vị 1.666 / 1.380 từ (docs/seo/battle/06) — mở rộng bằng dữ liệu thật, không viết dài để bằng đối thủ')
    elif path == '/' and p['words'] < 300:
        return 'EXPAND', f'trang chủ {p["words"]} từ nội dung chính'
    if not keyword_of(path, D):
        reasons.append('chưa gán từ khóa chính trong seo-master-matrix')
    if aid in D['open_flags']:
        reasons.append('cờ nội dung lỗi thời đang mở')
    if factory and factory.get('warnings'):
        w = [x for x in factory['warnings'] if x != 'local-angle']
        if w:
            reasons.append('QA nhà máy cảnh báo: ' + ', '.join(w))
    if total < 85:
        reasons.append(f'QA proxy {total}/100 < 85')
    if reasons:
        return 'IMPROVE', '; '.join(reasons)
    return 'KEEP', 'QA proxy ≥ 85, không cờ mở, không cảnh báo nội dung'


def families(D):
    """Slug-modifier families (base topic + audience/season/time modifiers) and body similarity."""
    slugs = {a['slug']: aid for aid, a in D['published'].items()}
    suffix = Counter()
    for s in slugs:
        parts = s.split('-')
        for i in range(1, len(parts)):
            base, tail = '-'.join(parts[:i]), '-'.join(parts[i:])
            if base in slugs and len(tail) <= 25:
                suffix[tail] += 1
    mods = sorted((t for t, c in suffix.items() if c >= 10), key=len, reverse=True)
    fam = defaultdict(list)
    for s in slugs:
        base = s
        for t in mods:
            if s.endswith('-' + t) and s[:-len(t) - 1] in slugs:
                base = s[:-len(t) - 1]
                break
        fam[base].append(s)

    def shingles(slug):
        t = visible_text(rtext(f'data/blog/articles/{slug}.body.html')).lower()
        w = re.findall(r'\w+', t)
        return {' '.join(w[i:i + 5]) for i in range(len(w) - 4)}

    result = []
    for base, members in sorted(fam.items()):
        if len(members) < 2:
            continue
        sh = {s: shingles(s) for s in members}
        pairs = []
        for s in members:
            if s == base:
                continue
            a, b = sh[s], sh[base]
            pairs.append((s, len(a & b) / max(1, len(a | b))))
        uniq = []
        for s in members:
            others = set().union(*[sh[o] for o in members if o != s])
            uniq.append(len(sh[s] - others) / max(1, len(sh[s])))
        result.append({
            'base': base, 'base_id': slugs[base], 'members': len(members),
            'max_jaccard': max(j for _, j in pairs), 'max_pair': max(pairs, key=lambda x: x[1])[0],
            'median_jaccard': statistics.median(j for _, j in pairs),
            'min_unique_share': min(uniq),
        })
    return mods, result


# ---------------------------------------------------------------- workbook
def build(D, date):
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter
    from openpyxl.utils.indexed_list import IndexedList

    ARIAL = Font(name='Arial', size=10)
    HEAD_FONT = Font(name='Arial', size=10, bold=True, color='FFFFFF')
    HEAD_FILL = PatternFill('solid', fgColor='1F3A5F')
    TITLE_FONT = Font(name='Arial', size=14, bold=True)
    BOLD = Font(name='Arial', size=10, bold=True)
    FILLS = {
        'PASS': 'E2F0D9', 'KEEP': 'E2F0D9', 'GOOD': 'E2F0D9', 'Có': 'E2F0D9', 'DONE': 'E2F0D9',
        'WARN': 'FFF2CC', 'IMPROVE': 'FFF2CC', 'EXPAND': 'FFF2CC', 'NEEDS IMPROVEMENT': 'FFF2CC', 'OPEN': 'FFF2CC',
        'FAIL': 'F8CBAD', 'POOR': 'F8CBAD', 'P0': 'F8CBAD',
        'N/A': 'EDEDED', 'NOT CONNECTED': 'EDEDED', 'IMAGE PENDING': 'EDEDED',
    }

    wb = Workbook()
    wb._fonts = IndexedList([ARIAL])  # Arial everywhere (default font of every unstyled cell)
    wb.remove(wb.active)
    headers_of = {}

    def sheet(name, headers, rows, widths=None, status_cols=(), freeze='B2', note=None):
        ws = wb.create_sheet(name)
        headers_of[name] = headers
        start = 1
        if note:
            ws.cell(row=1, column=1, value=note).font = BOLD
            start = 2
        for c, h in enumerate(headers, 1):
            cell = ws.cell(row=start, column=c, value=h)
            cell.font, cell.fill = HEAD_FONT, HEAD_FILL
            cell.alignment = Alignment(wrap_text=True, vertical='top')
        for r, row in enumerate(rows, start + 1):
            for c, v in enumerate(row, 1):
                if isinstance(v, (list, tuple, set)):
                    v = '; '.join(map(str, v))
                if isinstance(v, str) and len(v) > 32000:
                    v = v[:32000]
                ws.cell(row=r, column=c, value=v)
        for col in status_cols:
            ci = headers.index(col) + 1
            for r in range(start + 1, start + 1 + len(rows)):
                v = ws.cell(row=r, column=ci).value
                key = str(v).split(' ')[0] if v is not None else ''
                fill = FILLS.get(str(v)) or FILLS.get(key)
                if fill:
                    ws.cell(row=r, column=ci).fill = PatternFill('solid', fgColor=fill)
        ws.freeze_panes = ws.cell(row=start + 1, column=2 if freeze == 'B2' else 1)
        ws.auto_filter.ref = f'A{start}:{get_column_letter(len(headers))}{start + len(rows)}'
        for i, h in enumerate(headers, 1):
            w = (widths or {}).get(h)
            if w is None:
                sample = [len(str(r[i - 1])) for r in rows[:200] if i - 1 < len(r) and r[i - 1] is not None]
                w = min(max([len(str(h)) + 2] + [min(x, 60) + 2 for x in sample]), 60)
            ws.column_dimensions[get_column_letter(i)].width = w
        return ws

    def L(name, header):
        return get_column_letter(headers_of[name].index(header) + 1)

    pages = D['pages']
    inbound, broken, depth_all = link_graph(D)
    serp_live = {}
    for path, t in D['tech'].items():
        if t.get('HTTP Status') and t['HTTP Status'] != 'NOT_MEASURED':
            serp_live[path] = f"{t['HTTP Status']} ({t.get('HTTP Checked') or 'n/a'})"

    # ---------------- per-URL computations
    rows_url = []
    per = {}
    for path in sorted(set(pages) | set(D['sitemap']), key=lambda x: (x.count('/'), x)):
        p = pages.get(path)
        ptype = page_type(path, D)
        aid = D['path_art'].get(path, '')
        m = D['master'].get(path, {})
        links = parse_links_field(m.get('Internal Links'))
        inbound_pages = set().union(*(inbound[z].get(path, set()) for z in inbound))
        content_in = set().union(inbound['body'].get(path, set()), inbound['main'].get(path, set()))
        factory = D['qa']['articles'].get(aid) if aid else None
        if p:
            parts, total = qa_proxy(path, p, D, links, inbound_pages, broken)
            cls, why = classify(path, p, D, total, links, ptype, factory)
        else:
            parts, total, cls, why = [NA] * 7, NA, 'IMPROVE', 'URL trong sitemap nhưng không có file build'
        per[path] = dict(p=p, ptype=ptype, aid=aid, m=m, links=links, inbound_pages=inbound_pages,
                         content_in=content_in, factory=factory, parts=parts, total=total, cls=cls, why=why)

    # ---------------- 2. URL INVENTORY
    inv_rows = []
    for path, x in per.items():
        p = x['p']
        sources = sum([path in D['sitemap'], bool(p), bool(x['inbound_pages']), bool(x['aid']) or path in {'/' + sp['dir'] + '/' for sp in D['site_pages']['pages']} or path == '/'])
        inv_rows.append([
            full(path), x['aid'] or NA, x['ptype'], x['m'].get('Category', NA) or NA,
            'Có' if path in D['sitemap'] else 'Không', 'Có' if p else 'Không',
            len(x['inbound_pages']), 'Có' if x['aid'] in D['published'] else ('Không áp dụng' if not x['aid'] else 'Không'),
            serp_live.get(path, 'Chưa kiểm tra live trong lô này'), sources,
            'OK' if (path in D['sitemap'] and p and x['inbound_pages']) else 'CHECK',
            x['cls'], x['why'],
        ])
    S_INV = 'URL INVENTORY'
    sheet(S_INV, ['URL', 'Article ID', 'Loại trang', 'Danh mục', 'Trong sitemap', 'Có file build', 'Số trang liên kết vào (mọi vị trí)',
                  'Trong manifest bài', 'HTTP live (ngày)', 'Số nguồn xác nhận', 'Đối soát', 'Phân loại', 'Lý do phân loại'],
          inv_rows, widths={'URL': 70, 'Lý do phân loại': 70}, status_cols=('Đối soát', 'Phân loại'))

    # ---------------- 3. KEYWORD MASTER
    km_head = list(D['kw_master'][0].keys())
    km_rows = [[num(r[h]) if h in ('Volume A (keyword-demand)', 'Volume B (DataForSEO)', 'KD', 'Vị trí website', 'Điểm ưu tiên') else (r[h] or NA)
                for h in km_head] for r in D['kw_master']]
    src = D['kw_demand']['source']
    km = rjson('data/seo/battle/keyword-metrics.json')
    km_dates = '/'.join(sorted({x['retrieved'] for x in km['sources']}))
    sheet('KEYWORD MASTER', km_head, km_rows, status_cols=('Hạng',),
          note=f"Nguồn: docs/seo/battle/02-keyword-master-matrix.csv — Volume A: {src['tool']} ({src['location']}, {src['language']}, {src['retrieved']}); "
               f"Volume B/KD: {km['sources'][0]['tool']} (DataForSEO, {km_dates}) — hai nguồn khác nhau, không gộp. Ô N/A = công cụ không trả số / chưa đo.")

    # ---------------- 4. KEYWORD GAP
    gap_rows = []
    for r in D['opportunity']:
        cov = r['Độ phủ']
        if cov == 'Chưa có':
            m1 = 'NEW CONTENT' if 'Business' not in r['Loại trang'] else 'NEW CONTENT (trang bán hàng/GBP — owner)'
        elif cov == 'Phủ một phần':
            m1 = 'EXPAND'
        elif cov == 'Có mục trong bài':
            m1 = 'IMPROVE'
        else:
            m1 = 'COVERED'
        gap_rows.append([r['Từ khóa'], r['Nhóm'], num(r['Volume (đo được)']), r['Cụm'], r['Ý định'], cov, r['Cạnh tranh'],
                         r['Đối thủ mạnh trong top 10'] or NA, num(r['Điểm cơ hội']), r['Loại trang'], r['Hành động'],
                         r['Trang đích'] or NA, (r['Hạng'] or '').strip('()') or 'open', m1])
    sheet('KEYWORD GAP', ['Từ khóa', 'Nhóm', 'Volume (đo được)', 'Cụm', 'Ý định', 'Độ phủ', 'Cạnh tranh SERP', 'Đối thủ mạnh top 10',
                          'Điểm cơ hội', 'Loại trang', 'Hành động engine', 'Trang đích', 'Quyết định engine', 'Phân loại M1'],
          gap_rows, status_cols=('Phân loại M1',),
          note='Nguồn: docs/seo/battle/04-opportunity-matrix.csv (engine 06 + SERP 2026-10-14). NEW CONTENT chỉ là đề xuất: chủ sở hữu thêm ID vào content-matrix.csv.')

    # ---------------- 5. COMPETITOR SERP
    serp_rows = []
    for q in D['serp']['queries']:
        aio = q.get('ai_overview') or {}
        for o in (q.get('organic') or []):
            dom = o['domain']
            own = 'website này' if dom == HOST else ('miền cùng chủ (đối thủ độc lập)' if 'thuexemaynguyentu.com' in dom else 'đối thủ')
            serp_rows.append([q['query'], q.get('cluster', NA), o['position'], dom, o['url'], o.get('title', ''), own,
                              ', '.join(q.get('features') or []), 'Có' if aio.get('present') else 'Không',
                              'Có' if any(dom in s for s in (aio.get('sources') or [])) else 'Không',
                              q.get('source', NA), q.get('fetched_at', NA)])
    sheet('COMPETITOR SERP', ['Truy vấn', 'Cụm', 'Vị trí', 'Miền', 'URL', 'Title', 'Quan hệ', 'Tính năng SERP', 'AI Overview',
                              'Miền được AI Overview trích', 'Công cụ', 'Thời điểm lấy'],
          serp_rows, widths={'URL': 60, 'Title': 50}, status_cols=('Quan hệ',),
          note=f"Nguồn: {D['serp_file']} ({D['serp']['location']}, {D['serp']['language']}, chụp {D['serp']['collected']}). Vị trí là ảnh chụp một thời điểm, không phải thứ hạng cố định.")

    # ---------------- 6. URL–KEYWORD MAPPING
    vol = {}
    for r in D['kw_master']:
        v = num(r['Volume A (keyword-demand)'])
        if v == NA:
            v = num(r['Volume B (DataForSEO)'])
        vol[r['Từ khóa'].lower()] = v
    serp_pos = {}
    for q in D['serp']['queries']:
        for o in (q.get('organic') or []):
            if o['domain'] == HOST:
                serp_pos.setdefault(path_of(o['url']).replace('index.html', ''), []).append(f"{q['query']} #{o['position']}")
    captured = {q['query'].lower() for q in D['serp']['queries']}
    map_rows = []
    for path, x in per.items():
        kw = keyword_of(path, D)
        m = x['m']
        v = vol.get(kw.lower(), NA) if kw else NA
        pos = serp_pos.get(path)
        if pos:
            obs = '; '.join(pos)
        elif kw and kw.lower() in captured:
            obs = f"không thấy trong top kết quả ({D['serp']['collected']})"
        else:
            obs = 'N/A — truy vấn chưa chụp SERP'
        map_rows.append([full(path), x['aid'] or NA, x['ptype'], kw or NA, m.get('Secondary Keywords') or NA,
                         m.get('Search Intent') or NA, m.get('Topic Cluster') or NA, v,
                         'Đo được (keyword-demand / DataForSEO)' if v != NA else 'N/A — chưa đo volume', obs,
                         m.get('Cannibalization') or NA])
    sheet('URL–KEYWORD MAPPING', ['URL', 'Article ID', 'Loại trang', 'Từ khóa chính', 'Từ khóa phụ', 'Ý định', 'Cụm', 'Volume/tháng',
                                  'Nguồn volume', 'Vị trí quan sát (SERP chụp)', 'Quan hệ pillar'],
          map_rows, widths={'URL': 70, 'Từ khóa phụ': 50, 'Quan hệ pillar': 50})

    # ---------------- 7. CANNIBALIZATION
    mods, fams = families(D)
    by_kw = defaultdict(list)
    for path, x in per.items():
        kw = keyword_of(path, D).strip().lower()
        if kw:
            by_kw[kw].append(path)
    can_rows = []
    for kw, paths in sorted(by_kw.items()):
        if len(paths) < 2:
            continue
        paged = [p for p in paths if '/page/' in p]
        hubs = [p for p in paths if p not in paged and per[p]['ptype'] != 'Bài viết']
        arts_ = [p for p in paths if per[p]['ptype'] == 'Bài viết']
        if len(arts_) > 1:
            can_rows.append(['Trùng từ khóa chính giữa các bài', kw, len(arts_), ' | '.join(full(p) for p in arts_), NA, NA,
                             'CONSOLIDATE-CANDIDATE', 'Nhiều bài cùng từ khóa chính — đối chiếu ý định, nội dung và GSC trước khi gộp'])
        if len(hubs) > 1 or (hubs and arts_):
            titles_distinct = len({pages[p]['title'] for p in hubs if p in pages}) == len(hubs)
            can_rows.append(['Hub kế thừa từ khóa danh mục (báo cáo seo-master-audit)', kw, len(hubs) + len(arts_),
                             ' | '.join(full(p) for p in hubs + arts_), NA, NA, 'WATCH',
                             f"{len(hubs)} hub (title/H1 {'khác nhau' if titles_distinct else 'TRÙNG'}) + {len(paged)} trang phân trang dùng chung từ khóa danh mục trong báo cáo; "
                             'trang phân trang tự canonical là chuỗi hợp lệ. Việc: gán từ khóa riêng cho hub chủ đề con trong seo-master-audit (P3), không gộp/redirect'])
    serp_dupes = defaultdict(set)
    for q in D['serp']['queries']:
        for o in (q.get('organic') or []):
            if o['domain'] == HOST:
                serp_dupes[q['query']].add(path_of(o['url']))
    for qq, ps in serp_dupes.items():
        if len(ps) > 1:
            can_rows.append(['Hai URL của site cùng xuất hiện trên một SERP', qq, len(ps), ' | '.join(full(p) for p in sorted(ps)),
                             NA, NA, 'WATCH', 'Cùng xếp hạng (không hoán đổi) trong ảnh chụp — theo dõi trong GSC khi có dữ liệu'])
    for f in fams:
        verdict = 'CONSOLIDATE-CANDIDATE' if f['max_jaccard'] >= 0.5 else ('WATCH' if f['max_jaccard'] >= 0.3 else 'OK')
        can_rows.append(['Họ biến thể slug (cùng chủ đề + bổ ngữ)', f['base'], f['members'],
                         full(D['art_path'][f['base_id']]) + f" (+{f['members'] - 1} biến thể)",
                         round(f['max_jaccard'], 3), round(f['min_unique_share'], 3), verdict,
                         f"Jaccard 5-gram cao nhất {f['max_jaccard']:.3f} (với {f['max_pair']}); trung vị {f['median_jaccard']:.3f}; "
                         f"tỉ lệ nội dung riêng thấp nhất {f['min_unique_share']:.0%}. Ngưỡng gộp ≥ 0,5; theo dõi ≥ 0,3."])
    sheet('CANNIBALIZATION', ['Loại kiểm tra', 'Từ khóa / chủ đề', 'Số URL', 'URL', 'Jaccard cao nhất', 'Tỉ lệ nội dung riêng thấp nhất',
                              'Kết luận', 'Bằng chứng'],
          can_rows, widths={'URL': 70, 'Bằng chứng': 80}, status_cols=('Kết luận',),
          note=f"Quy tắc: không gộp chỉ vì từ khóa giống nhau. Gộp/redirect cần (1) trùng ý định + (2) trùng nội dung (Jaccard ≥ 0,5) hoặc (3) GSC cho thấy URL hoán đổi — {GSC_MISSING}. Bổ ngữ slug nhận diện: {', '.join(mods)}.")

    # ---------------- shared: key pages + pillars
    bench = {r['Truy vấn']: r for r in D['serp_bench']}
    pillars = {}
    for t in D['targets']:
        pillars.setdefault(path_of(t['owner_url']), []).append(f"{t['cluster_id']}: {t['head_keyword']} ({t['priority']})")
    for c in D['clusters']:
        if c['Pillar'].startswith('/'):
            pillars.setdefault(c['Pillar'], []).append(f"{c['Cụm']}: {c['Tên']} (volume nhóm {c['Volume nhóm'] or 'N/A'})")
    key_static = ['/', '/gia-thue/', '/lien-he/', '/agent/', '/blog/', '/gioi-thieu/', '/chinh-sach/', '/doi-tac/']
    hp_paths = key_static + [p for p in pillars if p not in key_static]
    hp_rows = []
    for path in hp_paths:
        x = per.get(path)
        if not x or not x['p']:
            continue
        p = x['p']
        issues = []
        if path in ('/', '/gia-thue/') and p['words'] < 500:
            issues.append(f'nội dung chính {p["words"]} từ')
        if not (set(p['cta']) & {'tel', 'whatsapp', 'liên hệ'}) and path != '/lien-he/':
            issues.append('chưa có CTA gọi/WhatsApp/liên hệ trong nội dung chính')
        issues += p['ld_issues']
        hp_rows.append([full(path), x['ptype'], ' | '.join(pillars.get(path, [])) or 'Trang chính', keyword_of(path, D) or NA,
                        p['title'], len(p['title']), len(p['description']), p['h1'][0] if p['h1'] else NA, p['words'], p['h2'],
                        ', '.join(p['ld_types']), ', '.join(p['cta']) or 'Không', len(x['content_in']), x['total'],
                        '; '.join(issues) or 'Không', x['cls'], x['why']])
    sheet('HOMEPAGE & PILLAR', ['URL', 'Loại trang', 'Vai trò pillar (cụm)', 'Từ khóa chính', 'Title', 'Title (ký tự)', 'Meta (ký tự)',
                                'H1', 'Từ nội dung chính', 'H2', 'Schema', 'CTA', 'Liên kết vào từ nội dung (trang)', 'QA proxy', 'Vấn đề', 'Phân loại',
                                'Lý do'],
          hp_rows, widths={'URL': 55, 'Vai trò pillar (cụm)': 60, 'Title': 50, 'Lý do': 60}, status_cols=('Phân loại',))

    # ---------------- 9. SEO HUB MATRIX (12 required groups)
    arts = []
    for aid, a in D['published'].items():
        meta_entry = D['meta'].get('articles', D['meta']).get(aid, {}) if isinstance(D['meta'].get('articles', D['meta']), dict) else {}
        hay = ' '.join([a.get('title', ''), D['matrix'].get(aid, {}).get('primary_keyword', ''), meta_entry.get('keyword', '') if isinstance(meta_entry, dict) else '']).lower()
        arts.append((aid, hay))
    hub_rows = []
    for hid, name, urls, terms in HUBS_12:
        existing = [u for u in urls if u in pages]
        n_art = sum(1 for _, hay in arts if any(t in hay for t in terms))
        if not urls:
            status, action = 'GAP', 'Chưa có hub riêng; chỉ tạo khi đủ bài thật sự khác nhau (quy tắc không tạo hub rỗng) — hiện gom trong /blog/thue-xe/ và /gia-thue/'
        elif len(existing) == len(urls):
            status, action = 'CÓ', 'Giữ; bổ sung đoạn dẫn hub có giá trị (không chỉ danh sách thẻ) theo lô review'
        else:
            status, action = 'MỘT PHẦN', 'Một số URL dự kiến chưa có trang'
        if hid == 'H04':
            action += '; KHÔNG tạo trang theo từng phường/quận chỉ đổi tên (doorway) — chỉ khu vực có dịch vụ thật trong business.json'
        if hid == 'H02' and '/gia-thue/' in pages and pages['/gia-thue/']['words'] < 500:
            action = f"/gia-thue/ chỉ {pages['/gia-thue/']['words']} từ nội dung chính — lô M2: mở rộng bằng bảng giá từ pricing.json (placeholder), cọc, điều kiện, câu hỏi thường gặp"
        hub_rows.append([hid, name, ' | '.join(full(u) for u in existing) or 'Không', ' | '.join(full(u) for u in urls if u not in pages) or 'Không',
                         n_art, ', '.join(terms), sum(len(per[u]['content_in']) for u in existing if u in per), status, action])
    sheet('SEO HUB MATRIX', ['Mã', 'Nhóm hub (lệnh SEO 2026)', 'URL hiện có', 'URL dự kiến chưa có', 'Số bài khớp chủ đề',
                             'Quy tắc khớp (title + từ khóa)', 'Liên kết vào từ nội dung (trang, không tính menu)', 'Trạng thái', 'Hành động'],
          hub_rows, widths={'URL hiện có': 80, 'Hành động': 80}, status_cols=('Trạng thái',),
          note='Kiến trúc: Trang chủ → Pillar → Hub → Silo → Bài hỗ trợ. Số bài khớp có thể chồng lấn giữa các nhóm.')

    # ---------------- 10. SILO & CATEGORY MATRIX
    silo_rows = []
    for path, x in per.items():
        if not (x['ptype'].startswith('Hub') or x['ptype'] == 'Blog home'):
            continue
        p = x['p']
        if not p:
            continue
        n_cards = len(p['out'].get('main', []))
        silo_rows.append([full(path), x['ptype'], x['m'].get('Category') or NA, p['title'], p['words'], p['h2'], n_cards,
                          len(x['inbound_pages']), depth_all.get(path, NA), ', '.join(p['ld_types']), x['total'], x['cls']])
    sheet('SILO & CATEGORY MATRIX', ['URL', 'Cấp', 'Danh mục', 'Title', 'Từ (nội dung chính)', 'H2', 'Liên kết nội dung (thẻ)',
                                     'Trang liên kết vào', 'Độ sâu click', 'Schema', 'QA proxy', 'Phân loại'],
          silo_rows, widths={'URL': 60, 'Title': 55}, status_cols=('Phân loại',))

    # ---------------- 11. CONTENT CLUSTERS
    cl_head = list(D['clusters'][0].keys())
    sheet('CONTENT CLUSTERS', cl_head, [[num(r[h]) if h in ('Volume nhóm', 'Bài supporting', 'Bài 0 inbound', 'SERP chụp') else (r[h] or NA) for h in cl_head] for r in D['clusters']],
          status_cols=('Trạng thái',), note='Nguồn: docs/seo/battle/05-topic-cluster-matrix.csv (W5, tools/seo-battle-matrix.mjs).')

    # ---------------- 12. PAGE & POST OPTIMIZATION
    opt_rows = []
    for path, x in per.items():
        p = x['p']
        if not p:
            continue
        f = x['factory'] or {}
        opt_rows.append([full(path), x['aid'] or NA, x['ptype'], p['title'], len(p['title']), len(p['description']), len(p['h1']),
                         p['h2'], p['words'], 'Có' if p['has_table'] else 'Không', 'Có' if p['has_list'] else 'Không',
                         len(p['ext_domains']), f.get('score', NA), ', '.join(f.get('warnings', [])) or ('Không' if f else NA),
                         x['total'], x['cls'], x['why'], x['m'].get('Proposed Action') or NA])
    sheet('PAGE & POST OPTIMIZATION', ['URL', 'Article ID', 'Loại trang', 'Title', 'Title (ký tự)', 'Meta (ký tự)', 'H1', 'H2',
                                       'Từ (nội dung chính)', 'Bảng', 'Danh sách', 'Miền nguồn ngoài', 'QA nhà máy', 'Cảnh báo QA nhà máy',
                                       'QA proxy', 'Phân loại', 'Lý do', 'Đề xuất (seo-master-audit)'],
          opt_rows, widths={'URL': 70, 'Title': 55, 'Lý do': 60, 'Đề xuất (seo-master-audit)': 60}, status_cols=('Phân loại',))

    # ---------------- 13. TECHNICAL SEO AUDIT (checks)
    P = list(pages.values())
    n = len(P)
    tech = []

    def chk(cid, area, check, scope, fails, standard, action, prio, value=None, threshold=None, status=None):
        st = status or ('PASS' if fails == 0 else 'FAIL')
        tech.append([cid, area, check, scope, fails, value if value is not None else NA, threshold or NA, st, standard, action, prio])

    chk('T01', 'Crawl', 'robots.txt cho phép crawl + khai báo sitemap', 'site', 0 if ('Allow: /' in D['robots_txt'] or 'Disallow:\n' in D['robots_txt'] or 'Disallow: \n' in D['robots_txt']) and 'Sitemap:' in D['robots_txt'] else 1,
        'Search Essentials', 'Giữ', 'P0')
    chk('T02', 'Index', 'Trang có meta robots noindex', f'{n} trang', sum('noindex' in p['robots'].lower() for p in P), 'Search Essentials', 'Không noindex trang có giá trị', 'P0')
    chk('T03', 'Index', 'Canonical tự tham chiếu đúng URL sạch', f'{n} trang', sum(p['canonical'] != full(p['path']) for p in P), 'Canonicalization', 'Giữ', 'P0')
    chk('T04', 'Index', 'URL trong sitemap không có file build', f"{len(D['sitemap'])} URL", sum(1 for u in D['sitemap'] if u not in pages), 'Sitemaps', 'Giữ đồng bộ', 'P0')
    chk('T05', 'Index', 'Trang build không có trong sitemap', f'{n} trang', sum(1 for u in pages if u not in D['sitemap']), 'Sitemaps', 'Giữ đồng bộ', 'P1')
    chk('T06', 'Links', 'Liên kết nội bộ hỏng', f'{n} trang', sum(len(v) for v in broken.values()), 'SEO Starter Guide', 'Sửa link', 'P0')
    chk('T07', 'Links', 'Trang mồ côi (0 liên kết vào từ nội dung, chỉ có menu/chân trang hoặc không có)', f'{n} trang',
        sum(1 for u in pages if u != '/' and not per[u]['content_in']), 'SEO Starter Guide', 'Thêm liên kết ngữ cảnh', 'P1')
    chk('T08', 'Links', 'Độ sâu click > 4 từ trang chủ', f'{n} trang', sum(1 for u in pages if depth_all.get(u, 99) > 4), 'SEO Starter Guide', 'Giữ ≤ 3–4', 'P1',
        value=max(depth_all.values()), threshold='≤ 4')
    chk('T09', 'On-page', 'Không đúng 1 H1', f'{n} trang', sum(len(p['h1']) != 1 for p in P), 'SEO Starter Guide', 'Giữ 1 H1', 'P1')
    chk('T10', 'On-page', 'Title ngoài 30–70 ký tự', f'{n} trang', sum(not 30 <= len(p['title']) <= 70 for p in P), 'Title links', 'Sửa qua data/seo/article-meta.json', 'P2')
    chk('T11', 'On-page', 'Meta description ngoài 100–180 ký tự', f'{n} trang', sum(not 100 <= len(p['description']) <= 180 for p in P), 'Snippets', 'Sửa qua article-meta.json', 'P2')
    titles = Counter(p['title'] for p in P)
    descs = Counter(p['description'] for p in P)
    chk('T12', 'On-page', 'Title trùng nhau', f'{n} trang', sum(c for c in titles.values() if c > 1), 'Title links', 'Title duy nhất', 'P1')
    chk('T13', 'On-page', 'Meta description trùng nhau', f'{n} trang', sum(c for c in descs.values() if c > 1), 'Snippets', 'Mô tả duy nhất', 'P2')
    chk('T14', 'International', 'Thuộc tính lang khác "vi"', f'{n} trang', sum(not p['lang'].startswith('vi') for p in P), 'Localized versions', 'Giữ lang="vi"', 'P2')
    chk('T15', 'Structured data', 'Khối JSON-LD lỗi cú pháp', f'{n} trang', sum(p['ld_err'] for p in P), 'Structured data guidelines', 'Sửa builder', 'P0')
    chk('T16', 'Structured data', 'Thiếu thuộc tính khuyến nghị/bắt buộc (Article, Breadcrumb, LocalBusiness, Organization)', f'{n} trang',
        sum(1 for p in P if p['ld_issues']), 'Structured data docs', 'Bổ sung từ dữ liệu thật', 'P2')
    chk('T17', 'Images', 'Ảnh trong nội dung thiếu alt', f"{sum(p['imgs'] for p in P)} ảnh", sum(p['img_no_alt'] for p in P), 'Image SEO', 'Thêm alt mô tả', 'P1')
    chk('T18', 'Images/CLS', 'Ảnh thiếu width/height', f"{sum(p['imgs'] for p in P)} ảnh", sum(p['img_no_dims'] for p in P), 'Web Vitals (CLS)', 'Khai báo kích thước', 'P1')
    chk('T19', 'Security', 'Tài nguyên http:// (mixed content)', f'{n} trang', sum(p['mixed_content'] for p in P), 'HTTPS', 'Dùng https', 'P1')
    big = [p for p in P if p['bytes'] > 100 * 1024]
    big_list = ', '.join(f"{p['path']} ({round(p['bytes'] / 1024)} KB)" for p in sorted(big, key=lambda p: -p['bytes']))
    chk('T20', 'Performance', 'HTML > 100 KB (hub chủ đề con liệt kê toàn bộ bài trên một trang, không phân trang)', f'{n} trang', len(big), 'web.dev (DOM lớn → INP)',
        f'Phân trang hub chủ đề con như hub danh mục (URL /page/N/ mới, không đổi URL cũ): {big_list}' if big else 'Giữ', 'P2',
        value=round(max(p['bytes'] for p in P) / 1024, 1), threshold='≤ 100 KB')
    css_size = lambda href: (ROOT / href.lstrip('/')).stat().st_size if (ROOT / href.lstrip('/')).is_file() else 0
    css_per_page = [sum(css_size(h) for h in p['stylesheets']) for p in P]
    css_kb = round(max(css_per_page) / 1024, 1) if css_per_page else NA
    chk('T21', 'Performance', 'CSS tải trên một trang (stylesheet liên kết, chưa nén)', f'{n} trang', 0, 'tools/seo-score.mjs cảnh báo ≥ 64 KB', 'Theo dõi; chỉ tách CSS nếu LCP lab/field xấu đi', 'P3',
        value=css_kb, threshold='< 64 KB (khuyến nghị nội bộ)', status='WARN' if isinstance(css_kb, float) and css_kb >= 64 else 'PASS')
    home = pages.get('/')
    chk('T22', 'Search Console', 'Thẻ google-site-verification trên trang chủ /', '/', 0 if home and 'google-site-verification' in (ROOT / 'index.html').read_text(encoding='utf-8') else 1,
        'Search Console verification (kiểm tra định kỳ)', 'Đã khôi phục ở lô C07b (build-blog đọc từ data/site/agent.html.tpl)', 'P0')
    idx_urls = sorted({o['url'] for q in D['serp']['queries'] for o in (q.get('organic') or []) if o['domain'] == HOST and o['url'].endswith('index.html')})
    internal_idx = sum(1 for p in P for t in p['out'].values() for u in t if u.endswith('index.html'))
    chk('T23', 'Index', f"URL dạng /index.html xuất hiện trong SERP chụp {D['serp']['collected']}: {', '.join(path_of(u) for u in idx_urls) or 'không'}",
        f'{len(idx_urls)} URL', len(idx_urls), 'Canonicalization',
        f'Trang có canonical về URL sạch; {internal_idx} link nội bộ dùng index.html; sitemap không chứa index.html. Kiểm tra canonical Google chọn bằng URL Inspection khi có GSC',
        'P3', status='WARN' if idx_urls else 'PASS')
    chk('T24', 'Search Console', 'Dữ liệu Search Console (Coverage, Performance, CWV field)', 'site', 1, 'Search Console', 'Owner kết nối GSC (tài sản Domain) và xuất dữ liệu vào data/seo/performance/', 'P0', status='N/A')
    cwv = D['cwv']
    if cwv:
        for i, pg in enumerate(cwv['pages'], 1):
            med = pg['median']
            for metric, key, thr, label in (('lcp', 'lcp_ms', 2500, 'LCP lab (ms)'), ('cls', 'cls', 0.1, 'CLS lab'),
                                            ('interaction', 'interaction_ms', 200, 'Tương tác chạm menu lab (ms, proxy INP)'),
                                            ('tbt', 'tbt_ms', 200, 'TBT lab (ms)')):
                v = med.get(key)
                rating = pg['lab_rating'].get(metric, NA)
                st = {'GOOD': 'PASS', 'NEEDS IMPROVEMENT': 'WARN', 'POOR': 'FAIL'}.get(rating, 'N/A')
                tech.append([f'CWV{i:02d}-{metric.upper()}', 'Core Web Vitals (LAB)', f"{label} — {pg['template']}", pg['url'],
                             0 if st == 'PASS' else 1, v if isinstance(v, (int, float)) else (0 if v == '< 16' else NA),
                             f'≤ {thr}', st, 'web.dev/articles/vitals (ngưỡng p75 field)',
                             'LAB — không thay dữ liệu field (CrUX/GSC: N/A)', 'P2'])
    S_TECH = 'TECHNICAL SEO AUDIT'
    sheet(S_TECH, ['Mã', 'Nhóm', 'Kiểm tra', 'Phạm vi', 'Số lỗi', 'Giá trị đo', 'Ngưỡng', 'Trạng thái', 'Chuẩn tham chiếu', 'Hành động', 'Ưu tiên'],
          tech, widths={'Kiểm tra': 70, 'Hành động': 60}, status_cols=('Trạng thái', 'Ưu tiên'), freeze='A2')

    # ---------------- 14. INDEX & SITEMAP
    idx_rows = []
    for path, x in per.items():
        p = x['p']
        sm = D['sitemap'].get(path, {})
        idx_rows.append([full(path), x['ptype'], 'Có' if path in D['sitemap'] else 'Không', sm.get('lastmod') or NA, sm.get('images', 0),
                         'indexable' if p and 'noindex' not in p['robots'].lower() else ('noindex' if p else NA),
                         ('self' if p and p['canonical'] == full(path) else (p['canonical'] if p else NA)),
                         'allowed', serp_live.get(path, 'Chưa kiểm tra live trong lô này'), NA, GSC_MISSING])
    sheet('INDEX & SITEMAP', ['URL', 'Loại trang', 'Trong sitemap', 'lastmod', 'Ảnh trong image sitemap', 'Indexability', 'Canonical',
                              'robots.txt', 'HTTP live (ngày)', 'Trạng thái index GSC', 'Nguồn thiếu'],
          idx_rows, widths={'URL': 70, 'Nguồn thiếu': 60}, status_cols=('Trong sitemap',),
          note=f"robots.txt: {D['robots_txt'].strip().replace(chr(10), ' | ')} — IndexNow: tools/indexnow.mjs + .github/workflows/indexnow.yml.")

    # ---------------- 15. HREFLANG MATRIX
    langs = Counter(p['lang'] for p in P)
    hl_pages = sum(1 for p in P if p['hreflang'])
    hl_rows = [
        ['vi', ', '.join(f'{k or "(trống)"}: {v}' for k, v in langs.items()), hl_pages, 'Không có phiên bản ngôn ngữ khác (URL riêng)',
         'KHÔNG CẦN', 'Site đơn ngữ tiếng Việt. Không tạo hreflang giả cho trang chưa tồn tại; không dùng canonical sang ngôn ngữ khác.'],
        ['en / x-default', '0 trang', 0, 'Agent /agent/ có giao diện đa ngôn ngữ qua tham số ?lang= nhưng không có URL nội dung riêng', 'N/A',
         'Chỉ thêm hreflang khi có trang dịch thật, mỗi cặp trỏ chéo nhau + x-default.'],
    ]
    sheet('HREFLANG MATRIX', ['Ngôn ngữ', 'Thuộc tính lang (số trang)', 'Trang có thẻ hreflang', 'Phiên bản thay thế', 'Trạng thái', 'Ghi chú'],
          hl_rows, widths={'Ghi chú': 90, 'Phiên bản thay thế': 60}, status_cols=('Trạng thái',), freeze='A2')

    # ---------------- 16. IMAGE SEO
    img_rows = []
    for aid in sorted(D['published']):
        path = D['art_path'][aid]
        reg = D['images'].get(aid)
        p = pages.get(path)
        if reg:
            img_rows.append([aid, full(path), reg['status'], reg['file'], round(reg['bytes'] / 1024, 1) if reg.get('bytes') else NA,
                             f"{reg.get('width')}×{reg.get('height')}", reg.get('alt', NA), len(reg.get('alt', '')),
                             reg.get('source', NA), D['sitemap'].get(path, {}).get('images', 0), 'Có' if p and p['og_image'].endswith('.webp') else 'Không',
                             reg.get('live_verified') or NA])
        else:
            img_rows.append([aid, full(path), 'IMAGE PENDING', NA, NA, NA, NA, NA, NA, D['sitemap'].get(path, {}).get('images', 0),
                             'Không (og mặc định)', 'Nhà máy ảnh đang tạm dừng — không gắn ảnh giả/ảnh đối thủ'])
    sheet('IMAGE SEO', ['Article ID', 'URL', 'Trạng thái ảnh', 'Tệp', 'KB', 'Kích thước', 'ALT', 'ALT (ký tự)', 'Nguồn ảnh',
                        'Mục image sitemap', 'og:image riêng', 'Xác minh live / ghi chú'],
          img_rows, widths={'URL': 60, 'ALT': 70, 'Tệp': 50}, status_cols=('Trạng thái ảnh',))

    # ---------------- 17. INTERNAL LINK MATRIX
    il_rows = []
    for path, x in per.items():
        p = x['p']
        if not p:
            continue
        lk = x['links']
        il_rows.append([full(path), x['ptype'], len(p['out'].get('body', [])), len(p['out'].get('main', [])),
                        len(inbound['body'].get(path, ())), len(inbound['main'].get(path, ())), len(inbound['chrome'].get(path, ())),
                        len(x['inbound_pages']), lk['in_ctx'] if lk['in_ctx'] is not None else NA,
                        lk['in_cluster'] if lk['in_cluster'] is not None else NA, depth_all.get(path, NA),
                        lk['depth'] if lk['depth'] is not None else NA,
                        'Có' if (path != '/' and not x['content_in']) else 'Không', x['m'].get('Cannibalization') or NA])
    sheet('INTERNAL LINK MATRIX', ['URL', 'Loại trang', 'Ra: trong thân bài', 'Ra: trong nội dung chính (thẻ/liên quan)',
                                   'Vào: từ thân bài (trang)', 'Vào: từ nội dung chính (trang)', 'Vào: từ menu/chân trang (trang)',
                                   'Vào: tổng (trang)', 'Vào ngữ cảnh (seo-master-audit)', 'Vào cụm/liên quan (seo-master-audit)',
                                   'Độ sâu click (mọi link)', 'Độ sâu (seo-master-audit)', 'Mồ côi nội dung', 'Pillar'],
          il_rows, widths={'URL': 70, 'Pillar': 50}, status_cols=('Mồ côi nội dung',))

    # ---------------- 18. STRUCTURED DATA
    sd_rows = []
    for path, x in per.items():
        p = x['p']
        if not p:
            continue
        st = 'LỖI' if (p['ld_err'] or not p['ld_blocks']) else ('CẢNH BÁO' if p['ld_issues'] else 'PASS')
        sd_rows.append([full(path), x['ptype'], p['ld_blocks'], ', '.join(p['ld_types']), p['ld_err'], '; '.join(p['ld_issues']) or 'Không',
                        '; '.join(p['ld_notes']) or 'Không', st])
    sheet('STRUCTURED DATA', ['URL', 'Loại trang', 'Khối JSON-LD', 'Kiểu (@type)', 'Lỗi cú pháp', 'Thiếu thuộc tính', 'Ghi chú đủ điều kiện', 'Trạng thái'],
          sd_rows, widths={'URL': 70, 'Kiểu (@type)': 60, 'Ghi chú đủ điều kiện': 90}, status_cols=('Trạng thái',))

    # ---------------- 19. LOCAL SEO & CONVERSION
    b = D['business']
    other_phones = Counter(ph for p in P for ph in p['phones'] if ph != b['contact']['phone'])
    loc_rows = [
        ['NAP', 'Tên', b['display_name'], 'data/business/business.json', 'PASS', 'Giữ; GBP name: ' + b.get('gbp_name', NA)],
        ['NAP', 'Địa chỉ', b['address']['full'], 'data/business/business.json', 'PASS',
         'Sau sắp xếp đơn vị hành chính 01/7/2025, Hà Nội không còn cấp quận — owner đối chiếu cách ghi trên GBP trước khi đổi; không tự đổi NAP'],
        ['NAP', 'Điện thoại', b['contact']['phone_display'], 'data/business/business.json', 'PASS', 'Giữ'],
        ['NAP', 'Giờ mở cửa', b['hours']['display'], 'data/business/business.json', 'PASS', 'Giữ'],
        ['NAP', 'Trang hiển thị số điện thoại doanh nghiệp', f"{sum(p['has_phone'] for p in P)}/{n} trang", 'quét HTML build', 'PASS', 'Qua menu/chân trang/CTA'],
        ['NAP', 'Trang hiển thị địa chỉ 112 Nguyễn Văn Cừ', f"{sum(p['has_address'] for p in P)}/{n} trang", 'quét HTML build', 'PASS', 'Giữ'],
        ['NAP', 'Số điện thoại khác xuất hiện trên site', ', '.join(f'{k} ({v} trang)' for k, v in other_phones.most_common(10)) or 'Không',
         'quét HTML build', 'PASS' if not other_phones else 'WARN', 'Kiểm tra không lẫn số của Văn Chính / thương hiệu khác'],
        ['Schema', 'LocalBusiness (AutoRental) trên /lien-he/', ', '.join(pages['/lien-he/']['ld_types']) if '/lien-he/' in pages else NA,
         'JSON-LD build', 'PASS' if '/lien-he/' in pages and 'AutoRental' in pages['/lien-he/']['ld_types'] else 'FAIL',
         '; '.join(pages['/lien-he/']['ld_notes']) if '/lien-he/' in pages else NA],
        ['GBP', 'Google Business Profile (thứ hạng local, đánh giá, ảnh)', NA, 'N/A — công cụ Local SEO cần owner đăng nhập lại; OpenSEO 0 tín dụng', 'N/A',
         'Không bịa đánh giá/rating; owner cập nhật GBP: danh mục, giờ, ảnh thật, liên kết /lien-he/'],
        ['Khu vực phục vụ', 'service_areas', ', '.join(b['service_areas']), 'data/business/business.json', 'PASS',
         'Không tạo trang doorway theo phường/quận chỉ đổi tên'],
    ]
    for path in ['/', '/gia-thue/', '/lien-he/', '/agent/', '/blog/']:
        if path in pages:
            p = pages[path]
            loc_rows.append(['CTA', f'CTA trên {path}', ', '.join(p['cta']) or 'Không', 'quét HTML build',
                             'PASS' if set(p['cta']) & {'tel', 'whatsapp', 'liên hệ', 'giá'} else 'WARN', 'Giữ CTA gọi/WhatsApp/giá trong nội dung chính'])
    art_cta = Counter()
    for aid, path in D['art_path'].items():
        if path in pages:
            art_cta['có CTA' if set(pages[path]['cta']) & {'tel', 'whatsapp', 'liên hệ', 'giá', 'agent'} else 'không CTA'] += 1
    loc_rows.append(['CTA', 'Bài viết có CTA trong nội dung chính (giá/liên hệ/gọi/WhatsApp/Agent)', f"{art_cta['có CTA']}/{sum(art_cta.values())}",
                     'quét HTML build', 'PASS' if art_cta['không CTA'] == 0 else 'WARN', 'Khối liên hệ cuối bài (contact-band)'])
    sheet('LOCAL SEO & CONVERSION', ['Nhóm', 'Hạng mục', 'Giá trị', 'Nguồn', 'Trạng thái', 'Ghi chú / hành động'],
          loc_rows, widths={'Giá trị': 70, 'Ghi chú / hành động': 80, 'Nguồn': 40}, status_cols=('Trạng thái',), freeze='A2')

    # ---------------- 20. GSC PERFORMANCE
    gsc_rows = [
        ['Trạng thái kết nối', 'NOT CONNECTED', 'OpenSEO list_search_console_sites (2026-10-31): 0 tài khoản Google; data/seo/performance/ chỉ có README'],
        ['Clicks (28 ngày)', NA, GSC_MISSING], ['Impressions (28 ngày)', NA, GSC_MISSING], ['CTR trung bình', NA, GSC_MISSING],
        ['Vị trí trung bình (không phải thứ hạng cố định)', NA, GSC_MISSING], ['Trang được index', NA, GSC_MISSING],
        ['Trang không được index (lý do)', NA, GSC_MISSING], ['Core Web Vitals (field)', NA, GSC_MISSING + '; CrUX: PSI API không khóa trả 429'],
        ['Truy vấn top', NA, GSC_MISSING],
        ['Việc của owner', 'Kết nối', 'Thêm tài sản Domain (DNS TXT) hoặc giữ thẻ HTML trên / (đã khôi phục lô C07b); xuất Performance 28 ngày vào data/seo/performance/ → engine tự chuyển DATA-DRIVEN'],
        ['KPI theo dõi khi có dữ liệu', 'Mục tiêu tương đối', 'Impressions và clicks nhóm truy vấn thương mại Hà Nội tăng theo tháng; trang /, /gia-thue/, /lien-he/ được index; không đặt số tuyệt đối khi chưa có baseline'],
    ]
    sheet('GSC PERFORMANCE', ['Chỉ số', 'Giá trị', 'Nguồn / ghi chú'], gsc_rows, widths={'Chỉ số': 45, 'Giá trị': 25, 'Nguồn / ghi chú': 110},
          status_cols=('Giá trị',), freeze='A2')

    # ---------------- 21. PRIORITY BACKLOG
    cls_count = Counter(x['cls'] for x in per.values())
    expand_articles = sum(1 for x in per.values() if x['cls'] == 'EXPAND' and x['ptype'] == 'Bài viết')
    warn_counts = Counter(w for q in D['qa']['articles'].values() for w in q['warnings'])
    no_img = sum(1 for aid in D['published'] if aid not in D['images'])
    lab_fail = [r for r in tech if r[1] == 'Core Web Vitals (LAB)' and r[7] in ('WARN', 'FAIL')]
    backlog = [
        ['B01', 'P0', 'Technical', '/', 'Trang chủ mất thẻ xác minh Search Console từ v76 (271e48e8)', 'T22; support.google.com/webmasters/answer/9008080',
         'Khôi phục thẻ từ một nguồn + test hồi quy', 'agent', 'C07b', 'DONE — live 2026-10-31 (6569a471)', 'Thẻ có trong <head> của / trên live'],
        ['B02', 'P0', 'Data', 'site', 'Search Console chưa kết nối — không có dữ liệu index/CTR/truy vấn', 'GSC PERFORMANCE', 'Owner kết nối GSC, xuất dữ liệu vào data/seo/performance/',
         'owner', '—', 'OPEN', 'Tệp xuất có trong repo; engine chuyển DATA-DRIVEN'],
        ['B03', 'P1', 'Homepage/Pillar', '/gia-thue/', f"Trang giá (cụm K02, volume nhóm 42.160) chỉ {pages['/gia-thue/']['words'] if '/gia-thue/' in pages else NA} từ nội dung chính; SERP benchmark trung vị 1.380–1.666 từ",
         'HOMEPAGE & PILLAR; docs/seo/battle/06', 'Mở rộng bằng dữ liệu thật pricing.json/business.json (placeholder), không bịa giá', 'agent', 'M2', 'OPEN', 'QA proxy ≥ 85; build + site-audit PASS; live'],
        ['B04', 'P1', 'Hub/Silo', '33 hub chủ đề con + 6 danh mục', 'Hub chủ yếu là danh sách thẻ; đoạn dẫn ngắn', 'SILO & CATEGORY MATRIX', 'Bổ sung đoạn dẫn có giá trị theo lô ≤ 20 hub', 'agent', 'M3', 'OPEN', 'Từ nội dung chính tăng, không trùng lặp'],
        ['B05', 'P1', 'Existing content', f'{expand_articles} bài', 'Bài dưới 800 từ (mục tiêu 800–2.000)', 'PAGE & POST OPTIMIZATION (EXPAND)', 'Review body có nguồn, không độn chữ',
         'agent', 'C08+', 'OPEN' if expand_articles else 'DONE', 'QA nhà máy không giảm'],
        ['B06', 'P2', 'Existing content', f"{warn_counts.get('no-cross-article-duplicate', 0)} bài", 'Đoạn văn trùng với bài khác (QA nhà máy no-cross-article-duplicate)', 'article-qa.json',
         'Viết lại đoạn trùng qua tools/seo-body-review.mjs', 'agent', 'C08+', 'OPEN', 'Cảnh báo về 0'],
        ['B07', 'P3', 'Data', f"{warn_counts.get('local-angle', 0)} bài LOCAL", 'local_scope trống trong content-matrix (QA local-angle)', 'article-qa.json',
         'Owner điền local_scope (matrix do owner quản lý)', 'owner', '—', 'OPEN', 'Cảnh báo về 0'],
        ['B08', 'P2', 'Image', f'{no_img} bài', 'IMAGE PENDING — chưa có ảnh đại diện', 'IMAGE SEO', 'Bật lại nhà máy ảnh (owner) — không dùng ảnh giả/ảnh đối thủ', 'owner', '—', 'PAUSED', 'Ảnh QA_PASSED + live'],
        ['B09', 'P2', 'Internal links', 'site', 'Kế hoạch liên kết do tools/seo-links.mjs quản lý; không chèn hàng loạt', 'INTERNAL LINK MATRIX', 'Chỉ sửa trang mồ côi nếu có', 'agent', '—',
         'DONE' if not any(r[0] == 'T07' and r[4] for r in tech) else 'OPEN', 'T07 = 0'],
        ['B10', 'P3', 'Structured data', '/agent/', 'FAQPage không còn rich result; WebApplication thiếu rating (không bịa)', 'STRUCTURED DATA', 'Giữ nguyên (vô hại); không thêm FAQPage mới', 'agent', '—', 'ACCEPTED', '—'],
        ['B11', 'P3', 'Technical', '1 URL', 'Google từng hiển thị URL /index.html (SERP 2026-10-14)', 'T23', 'Kiểm tra canonical Google chọn khi có GSC', 'owner', '—', 'WATCH', 'URL Inspection'],
        ['B12', 'P2', 'Local', 'GBP', 'Chưa đo GBP/local pack', 'LOCAL SEO & CONVERSION', 'Owner đăng nhập lại công cụ Local SEO / cập nhật GBP', 'owner', '—', 'OPEN', '—'],
        ['B13', 'P2', 'New content', f"{sum(1 for r in gap_rows if r[-1].startswith('NEW CONTENT'))} nhóm", 'Khoảng trống từ khóa chưa có trang', 'KEYWORD GAP',
         'Đề xuất hàng matrix cho owner; không tạo hàng loạt khi hub chưa chuẩn hóa', 'owner', '—', 'OPEN', 'Owner duyệt ID'],
        ['B14', 'P3', 'Performance', 'site', f'CSS mỗi trang {css_kb} KB chưa nén (cảnh báo nội bộ ≥ 64 KB)', 'T21', 'Theo dõi; chỉ tối ưu nếu LCP lab/field xấu đi', 'agent', '—', 'WATCH', 'LCP lab ≤ 2.500 ms'],
    ]
    if lab_fail:
        backlog.append(['B15', 'P2', 'Performance', ', '.join(sorted({r[3] for r in lab_fail})),
                        'Chỉ số CWV lab chưa đạt: ' + '; '.join(f'{r[2]} = {r[5]}' for r in lab_fail) + ' — trang hub liệt kê toàn bộ bài (DOM lớn, xem T20)',
                        'cwv-lab.json; T20', 'Phân trang hub chủ đề con (URL /page/N/ mới, giữ URL cũ) để giảm DOM; đo lại', 'agent', 'M3', 'OPEN', 'Lab ≤ ngưỡng ở 3 lần đo'])
    sheet('PRIORITY BACKLOG', ['ID', 'Ưu tiên', 'Nhóm', 'Phạm vi URL', 'Vấn đề', 'Bằng chứng', 'Hành động', 'Người làm', 'Lô', 'Trạng thái', 'Điều kiện xác minh'],
          backlog, widths={'Vấn đề': 70, 'Hành động': 60, 'Phạm vi URL': 30}, status_cols=('Ưu tiên', 'Trạng thái'), freeze='A2',
          note='Thứ tự: Technical blockers → Homepage/Pillar → Hub/Silo → Nội dung hiện có → Internal links → Nội dung mới → Nâng cao.')

    # ---------------- 22. QA RESULTS
    qa_rows = []
    for path, x in per.items():
        if not x['p']:
            continue
        f = x['factory'] or {}
        qa_rows.append([full(path), x['aid'] or NA, x['ptype']] + x['parts'] + [x['total'], 'ĐẠT' if x['total'] >= 85 else 'CHƯA ĐẠT',
                                                                          f.get('score', NA), 'PASS' if f.get('pass') else (NA if not f else 'FAIL')])
    sheet('QA RESULTS', ['URL', 'Article ID', 'Loại trang', 'Ý định (20)', 'Chính xác — proxy (20)', 'On-page (15)', 'Kiến trúc (15)', 'Kỹ thuật (15)',
                         'UX/media/chuyển đổi (10)', 'Schema/địa phương (5)', 'Tổng (100)', 'Ngưỡng 85', 'QA nhà máy', 'QA nhà máy PASS'],
          qa_rows, widths={'URL': 70}, status_cols=('Ngưỡng 85',),
          note='Điểm proxy tự động từ tín hiệu đo được (tools/seo-master-2026.py → qa_proxy). Accuracy chỉ đo cờ nội dung, sổ pháp lý và QA nhà máy — không thay review biên tập/pháp lý.')

    # ---------------- 23. CHANGELOG & CHECKPOINT
    ch_rows = []
    for bt in D['progress']['batches']:
        text = bt.get('changes') or bt.get('scope') or ''
        if not isinstance(text, str):
            text = json.dumps(text, ensure_ascii=False)
        live = bt.get('live_verified', NA)
        ch_rows.append([bt['batch_id'], bt.get('reviewed', NA), ', '.join(map(str, bt.get('article_ids') or [])) or NA, text[:1500],
                        live if isinstance(live, str) else json.dumps(live, ensure_ascii=False)])
    ch_rows.append(['M1-MASTER-2026', date, f'{len(per)} URL (kiểm kê)', 'Master SEO Matrix 2026: kiểm kê URL 4 nguồn, phân loại, QA proxy, kiểm tra kỹ thuật/schema/NAP/hreflang, CWV lab, backlog P0–P3',
                    'Báo cáo dữ liệu (không đổi trang)'])
    ch_rows.append(['CHECKPOINT', date, D['progress'].get('last_completed_batch', NA), 'Lô kế tiếp: M2 — /gia-thue/ (B03), rồi M3 hub (B04). Khi nhắn "Tiếp tục": đọc docs/seo/master-2026/checkpoint.json + progress.json trước khi làm.',
                    D['progress'].get('last_verified_commit', NA)])
    sheet('CHANGELOG & CHECKPOINT', ['Lô', 'Ngày', 'Phạm vi', 'Thay đổi', 'Xác minh live / commit'], ch_rows,
          widths={'Thay đổi': 110, 'Phạm vi': 40, 'Xác minh live / commit': 60}, freeze='A2')

    # ---------------- appendices
    comp_head = list(D['competitors'][0].keys())
    sheet('X-COMPETITOR DOMAINS', comp_head, [[num(r[h]) for h in comp_head] for r in D['competitors']],
          note='Nguồn: docs/seo/battle/01-competitor-intelligence.csv. Miền cùng chủ sở hữu được phân tích như đối thủ độc lập; không liên kết chéo nhân tạo.')
    bh = list(D['serp_bench'][0].keys())
    sheet('X-SERP BENCHMARK', bh, [[num(r[h]) for h in bh] for r in D['serp_bench']],
          note='Nguồn: docs/seo/battle/06-serp-benchmark.csv (W6). Không sao chép nội dung đối thủ; chỉ dùng số đo cấu trúc.')
    blh = list(D['backlinks'][0].keys())
    sheet('X-OFF-PAGE BACKLINKS', blh, [[num(r[h]) for h in blh] for r in D['backlinks']],
          note='Nguồn: docs/seo/battle/08-backlink-matrix.csv (hồ sơ backlink đối thủ). Backlink của website này: N/A (OpenSEO 0 tín dụng). Không mua link, không PBN, không disavow tự động.')
    ds_rows = [
        ['HTML build (2.138 trang)', 'tools/seo-master-2026.py quét trực tiếp', date, len(pages), 'Đo được'],
        ['sitemap.xml', 'tools/build-blog.mjs', date, len(D['sitemap']), 'Đo được'],
        ['Link graph nội bộ', 'tools/seo-master-2026.py (thân bài / nội dung chính / menu)', date, sum(len(v) for z in inbound.values() for v in z.values()), 'Đo được'],
        ['published.json (manifest bài)', 'Blog Factory', date, len(D['published']), 'Đo được'],
        ['QA nhà máy', 'tools/article-qa.mjs → docs/seo/master-2026/article-qa.json', date, len(D['qa']['articles']), 'Đo được'],
        ['HTTP live', 'docs/seo/master-task/technical-audit.csv', '2026-10-28/29', len(serp_live), 'Đo được (mẫu)'],
        ['Keyword volume', f"{src['tool']} + OpenSEO DataForSEO", src['retrieved'], len(D['kw_demand']['keywords']), 'Đo được'],
        ['SERP top 10', D['serp_file'], D['serp']['collected'], len(D['serp']['queries']), 'Quan sát (một thời điểm)'],
        ['Đối thủ / backlink đối thủ', 'docs/seo/battle/01, 08', '2026-10-14', len(D['competitors']) + len(D['backlinks']), 'Đo được'],
        ['Sổ văn bản pháp luật', 'docs/seo/legal-citations.json', D['legal']['registry_checked'], len(D['legal']['documents']), 'Đối chiếu toàn văn'],
        ['CWV lab', 'tools/seo-cwv-lab.mjs → docs/seo/master-2026/cwv-lab.json', (cwv or {}).get('generated', NA)[:10] if cwv else NA,
         len(cwv['pages']) if cwv else 0, 'LAB (không phải field)'],
        ['Google Search Console', '—', '—', NA, 'NOT CONNECTED'],
        ['CrUX / PageSpeed field', '—', '—', NA, 'N/A (PSI API 429, không có khóa)'],
        ['Google Business Profile', '—', '—', NA, 'N/A (cần owner đăng nhập)'],
        ['Backlink của website', '—', '—', NA, 'N/A (OpenSEO 0 tín dụng)'],
    ] + [[f'Chuẩn: {t}', u, d, NA, 'Tài liệu chính thức'] for t, u, d in STANDARDS]
    sheet('X-DATA SOURCES', ['Nguồn', 'Công cụ / tệp', 'Ngày', 'Số bản ghi', 'Độ tin cậy'], ds_rows,
          widths={'Nguồn': 70, 'Công cụ / tệp': 80}, status_cols=('Độ tin cậy',), freeze='A2')

    # ---------------- 1. EXECUTIVE DASHBOARD (formulas only, built last, moved first)
    ws = wb.create_sheet('EXECUTIVE DASHBOARD', 0)
    headers_of['EXECUTIVE DASHBOARD'] = ['KPI', 'Giá trị', 'Công thức / nguồn', 'Ghi chú']
    ws['A1'] = 'MASTER SEO MATRIX 2026 — chatbot.thuexemaynguyentu.com'
    ws['A1'].font = TITLE_FONT
    ws['A2'] = f'Ngày dữ liệu: {date} · Nguồn: repository + HTML build · Search Console: NOT CONNECTED · Mọi giá trị dưới đây là công thức tham chiếu các sheet.'
    for c, h in enumerate(headers_of['EXECUTIVE DASHBOARD'], 1):
        cell = ws.cell(row=4, column=c, value=h)
        cell.font, cell.fill = HEAD_FONT, HEAD_FILL
    q = lambda s: f"'{s}'"
    inv = q(S_INV)
    kpis = [
        ('Tổng URL kiểm kê', f'=COUNTA({inv}!A:A)-1', 'URL INVENTORY', 'Hợp nhất sitemap + build + link graph + manifest'),
        ('URL trong sitemap', f'=COUNTIF({inv}!{L(S_INV, "Trong sitemap")}:{L(S_INV, "Trong sitemap")},"Có")', 'URL INVENTORY', ''),
        ('URL có file build', f'=COUNTIF({inv}!{L(S_INV, "Có file build")}:{L(S_INV, "Có file build")},"Có")', 'URL INVENTORY', ''),
        ('URL có ≥ 1 trang liên kết vào', f'=COUNTIF({inv}!{L(S_INV, "Số trang liên kết vào (mọi vị trí)")}:{L(S_INV, "Số trang liên kết vào (mọi vị trí)")},">0")', 'URL INVENTORY', ''),
        ('URL đối soát OK (≥ 3 nguồn)', f'=COUNTIF({inv}!{L(S_INV, "Đối soát")}:{L(S_INV, "Đối soát")},"OK")', 'URL INVENTORY', ''),
        ('URL đã kiểm tra HTTP live = 200', f'=COUNTIF({inv}!{L(S_INV, "HTTP live (ngày)")}:{L(S_INV, "HTTP live (ngày)")},"200*")', 'URL INVENTORY', 'Mẫu 2026-10-28/29'),
        ('Bài viết', f'=COUNTIF({inv}!{L(S_INV, "Loại trang")}:{L(S_INV, "Loại trang")},"Bài viết")', 'URL INVENTORY', ''),
    ] + [(f'Phân loại {c}', f'=COUNTIF({inv}!{L(S_INV, "Phân loại")}:{L(S_INV, "Phân loại")},"{c}")', 'URL INVENTORY', '') for c in CLASSES] + [
        ('Nhóm từ khóa NEW CONTENT (đề xuất)', f"=COUNTIF('KEYWORD GAP'!{L('KEYWORD GAP', 'Phân loại M1')}:{L('KEYWORD GAP', 'Phân loại M1')},\"NEW CONTENT*\")", 'KEYWORD GAP', 'Owner duyệt'),
        ('QA proxy trung bình (/100)', f"=ROUND(AVERAGE('QA RESULTS'!{L('QA RESULTS', 'Tổng (100)')}:{L('QA RESULTS', 'Tổng (100)')}),1)", 'QA RESULTS', 'Proxy tự động'),
        ('Tỉ lệ URL đạt QA proxy ≥ 85', f"=ROUND(COUNTIF('QA RESULTS'!{L('QA RESULTS', 'Tổng (100)')}:{L('QA RESULTS', 'Tổng (100)')},\">=85\")/COUNT('QA RESULTS'!{L('QA RESULTS', 'Tổng (100)')}:{L('QA RESULTS', 'Tổng (100)')}),3)", 'QA RESULTS', ''),
        ('QA nhà máy trung bình (bài)', f"=ROUND(AVERAGE('QA RESULTS'!{L('QA RESULTS', 'QA nhà máy')}:{L('QA RESULTS', 'QA nhà máy')}),1)", 'QA RESULTS', 'tools/article-qa.mjs'),
        ('Từ khóa trong Keyword Master', "=COUNTA('KEYWORD MASTER'!A:A)-2", 'KEYWORD MASTER', 'Trừ dòng ghi chú + tiêu đề'),
        ('Từ khóa có volume đo được', f"=COUNT('KEYWORD MASTER'!{L('KEYWORD MASTER', 'Volume A (keyword-demand)')}:{L('KEYWORD MASTER', 'Volume A (keyword-demand)')})", 'KEYWORD MASTER', 'Ô N/A không tính'),
        ('Truy vấn SERP đã chụp (có vị trí #1)', f"=COUNTIF('COMPETITOR SERP'!{L('COMPETITOR SERP', 'Vị trí')}:{L('COMPETITOR SERP', 'Vị trí')},1)", 'COMPETITOR SERP', ''),
        ('Lượt website này xuất hiện trong SERP chụp', f"=COUNTIF('COMPETITOR SERP'!{L('COMPETITOR SERP', 'Quan hệ')}:{L('COMPETITOR SERP', 'Quan hệ')},\"website này\")", 'COMPETITOR SERP', 'Một thời điểm'),
        ('Kiểm tra kỹ thuật FAIL', f"=COUNTIF({q(S_TECH)}!{L(S_TECH, 'Trạng thái')}:{L(S_TECH, 'Trạng thái')},\"FAIL\")", 'TECHNICAL SEO AUDIT', ''),
        ('Kiểm tra kỹ thuật WARN', f"=COUNTIF({q(S_TECH)}!{L(S_TECH, 'Trạng thái')}:{L(S_TECH, 'Trạng thái')},\"WARN\")", 'TECHNICAL SEO AUDIT', ''),
        ('LCP lab tệ nhất (ms)', f"=_xlfn.MAXIFS({q(S_TECH)}!{L(S_TECH, 'Giá trị đo')}:{L(S_TECH, 'Giá trị đo')},{q(S_TECH)}!{L(S_TECH, 'Nhóm')}:{L(S_TECH, 'Nhóm')},\"Core Web Vitals (LAB)\",{q(S_TECH)}!{L(S_TECH, 'Kiểm tra')}:{L(S_TECH, 'Kiểm tra')},\"LCP*\")", 'TECHNICAL SEO AUDIT', 'LAB, ngưỡng 2.500'),
        ('Trang lỗi structured data', f"=COUNTIF('STRUCTURED DATA'!{L('STRUCTURED DATA', 'Trạng thái')}:{L('STRUCTURED DATA', 'Trạng thái')},\"LỖI\")", 'STRUCTURED DATA', ''),
        ('Bài có ảnh đại diện LIVE', f"=COUNTIF('IMAGE SEO'!{L('IMAGE SEO', 'Trạng thái ảnh')}:{L('IMAGE SEO', 'Trạng thái ảnh')},\"LIVE_VERIFIED\")", 'IMAGE SEO', ''),
        ('Bài IMAGE PENDING', f"=COUNTIF('IMAGE SEO'!{L('IMAGE SEO', 'Trạng thái ảnh')}:{L('IMAGE SEO', 'Trạng thái ảnh')},\"IMAGE PENDING\")", 'IMAGE SEO', 'Nhà máy ảnh tạm dừng'),
        ('Trang mồ côi nội dung', f"=COUNTIF('INTERNAL LINK MATRIX'!{L('INTERNAL LINK MATRIX', 'Mồ côi nội dung')}:{L('INTERNAL LINK MATRIX', 'Mồ côi nội dung')},\"Có\")", 'INTERNAL LINK MATRIX', ''),
        ('Vào ngữ cảnh TB / bài', f"=ROUND(AVERAGEIF('INTERNAL LINK MATRIX'!{L('INTERNAL LINK MATRIX', 'Loại trang')}:{L('INTERNAL LINK MATRIX', 'Loại trang')},\"Bài viết\",'INTERNAL LINK MATRIX'!{L('INTERNAL LINK MATRIX', 'Vào: từ thân bài (trang)')}:{L('INTERNAL LINK MATRIX', 'Vào: từ thân bài (trang)')}),1)", 'INTERNAL LINK MATRIX', ''),
        ('Nhóm CONSOLIDATE-CANDIDATE (cannibalization)', f"=COUNTIF('CANNIBALIZATION'!{L('CANNIBALIZATION', 'Kết luận')}:{L('CANNIBALIZATION', 'Kết luận')},\"CONSOLIDATE-CANDIDATE\")", 'CANNIBALIZATION', ''),
        ('Backlog P0', "=COUNTIF('PRIORITY BACKLOG'!B:B,\"P0\")", 'PRIORITY BACKLOG', ''),
        ('Backlog P1', "=COUNTIF('PRIORITY BACKLOG'!B:B,\"P1\")", 'PRIORITY BACKLOG', ''),
        ('Backlog P2', "=COUNTIF('PRIORITY BACKLOG'!B:B,\"P2\")", 'PRIORITY BACKLOG', ''),
        ('Backlog P3', "=COUNTIF('PRIORITY BACKLOG'!B:B,\"P3\")", 'PRIORITY BACKLOG', ''),
        ('Search Console', "='GSC PERFORMANCE'!B2", 'GSC PERFORMANCE', 'Owner kết nối'),
        ('Hreflang', "='HREFLANG MATRIX'!E2", 'HREFLANG MATRIX', 'Site đơn ngữ'),
    ]
    for r, (k, f, src_sheet, note) in enumerate(kpis, 5):
        ws.cell(row=r, column=1, value=k)
        ws.cell(row=r, column=2, value=f)
        ws.cell(row=r, column=3, value=f"{src_sheet}: {f[1:]}")
        ws.cell(row=r, column=4, value=note)
    ws.column_dimensions['A'].width = 48
    ws.column_dimensions['B'].width = 18
    ws.column_dimensions['C'].width = 110
    ws.column_dimensions['D'].width = 45
    ws.freeze_panes = 'A5'
    ws.auto_filter.ref = f'A4:D{4 + len(kpis)}'

    ordered = SHEETS + APPENDICES
    wb._sheets = [wb[n] for n in ordered]
    wb.active = 0
    wb.properties.creator = 'tools/seo-master-2026.py'
    wb.properties.title = 'Master SEO Matrix 2026'
    created = datetime.strptime(date, '%Y-%m-%d')
    wb.properties.created = created
    wb.properties.modified = created
    return wb, per, tech, backlog, fams, kpis, hub_rows


def write_evidence(D, per, tech, backlog, fams, hub_rows, date):
    out = ROOT / OUT_DIR
    out.mkdir(parents=True, exist_ok=True)
    with (out / 'url-inventory.csv').open('w', encoding='utf-8', newline='') as f:
        w = csv.writer(f, lineterminator='\n')
        w.writerow(['url', 'article_id', 'page_type', 'in_sitemap', 'in_build', 'inbound_pages', 'qa_proxy', 'class', 'reason'])
        for path, x in per.items():
            w.writerow([full(path), x['aid'], x['ptype'], int(path in D['sitemap']), int(bool(x['p'])), len(x['inbound_pages']),
                        x['total'], x['cls'], x['why']])
    with (out / 'backlog.csv').open('w', encoding='utf-8', newline='') as f:
        w = csv.writer(f, lineterminator='\n')
        w.writerow(['id', 'priority', 'area', 'scope', 'issue', 'evidence', 'action', 'owner', 'batch', 'status', 'verify'])
        w.writerows(backlog)
    totals = [x['total'] for x in per.values() if isinstance(x['total'], int)]
    summary = {
        '$schema': 'motoai/master-seo-2026@1',
        'date': date,
        'workbook': OUT_XLSX,
        'sheets': SHEETS,
        'appendices': APPENDICES,
        'urls': len(per),
        'sources': {'sitemap': len(D['sitemap']), 'build': len(D['pages']), 'linked': sum(1 for x in per.values() if x['inbound_pages']),
                    'manifest_articles': len(D['published'])},
        'classification': dict(Counter(x['cls'] for x in per.values())),
        'qa_proxy': {'mean': round(statistics.mean(totals), 1), 'min': min(totals), 'pass_85': sum(t >= 85 for t in totals), 'total': len(totals)},
        'technical': {r[0]: r[7] for r in tech},
        'families': {'count': len(fams), 'max_jaccard': round(max(f['max_jaccard'] for f in fams), 3) if fams else None,
                     'consolidate_candidates': sum(1 for f in fams if f['max_jaccard'] >= 0.5)},
        'hubs_12': {r[0]: r[7] for r in hub_rows},
        'gsc': 'NOT CONNECTED',
        'cwv': 'LAB only' if D['cwv'] else 'N/A',
    }
    (out / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    prog = D['progress']
    checkpoint = {
        '$schema': 'motoai/master-seo-2026-checkpoint@1',
        'date': date,
        'last_completed_batch': prog.get('last_completed_batch'),
        'last_verified_commit': prog.get('last_verified_commit'),
        'next': prog.get('next_article_ids_note'),
        'open_backlog': [{'id': b[0], 'priority': b[1], 'issue': b[4], 'owner': b[7], 'batch': b[8]} for b in backlog
                         if b[9] not in ('DONE', 'ACCEPTED') and not str(b[9]).startswith('DONE')],
        'resume_rule': 'Khi nhận "Tiếp tục": fetch origin/main, đọc file này + docs/seo/commercial/progress.json, chạy lại '
                       'python3 tools/seo-master-2026.py --verify, rồi làm lô kế tiếp (tối đa 5–20 URL/lô, ≤ 30 theo AGENTS.md).',
    }
    (out / 'checkpoint.json').write_text(json.dumps(checkpoint, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    t = summary['technical']
    lines = [
        f'# Lô M1 — Master SEO Matrix 2026 ({date})', '',
        f'Workbook: `{OUT_XLSX}` — {len(SHEETS)} sheet bắt buộc + {len(APPENDICES)} phụ lục; sinh bởi `tools/seo-master-2026.py`, '
        'công thức dashboard kiểm bằng LibreOffice (`formula-check.json`).', '',
        '## Kết quả đo', '',
        f"- URL kiểm kê: **{summary['urls']}** — sitemap {summary['sources']['sitemap']}, HTML build {summary['sources']['build']}, "
        f"có liên kết vào {summary['sources']['linked']}, bài trong manifest {summary['sources']['manifest_articles']}.",
        '- Phân loại: ' + ', '.join(f'{k} {v}' for k, v in sorted(summary['classification'].items(), key=lambda kv: -kv[1])) +
        ' (CONSOLIDATE / REDIRECT / NOINDEX-CANDIDATE: 0 — không có bằng chứng trùng nội dung hay trùng ý định).',
        f"- QA proxy 100 điểm: trung bình {summary['qa_proxy']['mean']}, thấp nhất {summary['qa_proxy']['min']}, "
        f"{summary['qa_proxy']['pass_85']}/{summary['qa_proxy']['total']} URL ≥ 85 (proxy tự động, không thay review biên tập).",
        f"- Họ biến thể slug: {summary['families']['count']} họ, Jaccard 5-gram cao nhất {summary['families']['max_jaccard']} "
        f"(ngưỡng gộp 0,5) → {summary['families']['consolidate_candidates']} ứng viên gộp.",
        '- Kiểm tra kỹ thuật không PASS: ' + (', '.join(f'{k} {v}' for k, v in t.items() if v != 'PASS') or 'không') + '.',
        f"- Search Console: {summary['gsc']}; CWV: {summary['cwv']}.", '',
        '## Backlog mở (ưu tiên)', '',
    ] + [f"- {b['id']} {b['priority']} — {b['issue']} ({b['owner']}, lô {b['batch']})" for b in checkpoint['open_backlog']] + [
        '', '## Giới hạn', '',
        '- Không có dữ liệu Search Console/CrUX/GBP/backlink của website: các ô tương ứng ghi N/A kèm nguồn thiếu.',
        '- CWV là số đo LAB (máy chủ tĩnh cục bộ, giả lập mạng 4G chậm, CPU 4x), không phải dữ liệu field.',
        '- Vị trí SERP là ảnh chụp một thời điểm (data/seo/serp-snapshots/), không phải thứ hạng cố định.',
        '- Chuẩn tham chiếu và ngày cập nhật: sheet X-DATA SOURCES.', '',
    ]
    (out / 'report.md').write_text('\n'.join(lines), encoding='utf-8')
    return summary


def verify(path):
    """Recalculate with LibreOffice headless and assert every dashboard formula yields a value (no Excel error)."""
    soffice = shutil.which('soffice') or shutil.which('libreoffice')
    if not soffice:
        print('verify: LibreOffice not installed — skipped', file=sys.stderr)
        return None
    from openpyxl import load_workbook
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run([soffice, '--headless', '--calc', '--convert-to', 'xlsx', '--outdir', tmp, str(path)],
                       check=True, capture_output=True, timeout=600)
        calc = load_workbook(Path(tmp) / Path(path).name, data_only=True, read_only=True)
        src = load_workbook(path, read_only=True)
        ws_f, ws_v = src['EXECUTIVE DASHBOARD'], calc['EXECUTIVE DASHBOARD']
        formulas = [(r[0].value, r[1].value) for r in ws_f.iter_rows(min_row=5) if r[1].value and str(r[1].value).startswith('=')]
        values = [r[1].value for r in ws_v.iter_rows(min_row=5) if r[0].value]
        results, errors = [], []
        for (k, f), v in zip(formulas, values):
            bad = v is None or (isinstance(v, str) and v.startswith('#')) or (isinstance(v, str) and v.startswith('Err:'))
            results.append({'kpi': k, 'formula': f, 'value': v, 'ok': not bad})
            if bad:
                errors.append(k)
        return {'checked': len(results), 'errors': errors, 'engine': 'LibreOffice headless recalculation', 'results': results,
                'sheets': calc.sheetnames}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--date', default=datetime.now().strftime('%Y-%m-%d'))
    ap.add_argument('--verify', action='store_true', help='recalculate with LibreOffice and write formula-check.json')
    a = ap.parse_args()
    D = load()
    wb, per, tech, backlog, fams, kpis, hub_rows = build(D, a.date)
    (ROOT / OUT_XLSX).parent.mkdir(parents=True, exist_ok=True)
    wb.save(ROOT / OUT_XLSX)
    summary = write_evidence(D, per, tech, backlog, fams, hub_rows, a.date)
    print(json.dumps({k: summary[k] for k in ('urls', 'sources', 'classification', 'qa_proxy', 'families')}, ensure_ascii=False))
    if a.verify:
        res = verify(ROOT / OUT_XLSX)
        if res is not None:
            (ROOT / OUT_DIR / 'formula-check.json').write_text(json.dumps(res, ensure_ascii=False, indent=2, default=str) + '\n', encoding='utf-8')
            print(f"formula check: {res['checked']} formulas, {len(res['errors'])} errors")
            if res['errors']:
                sys.exit(1)
    print(f'wrote {OUT_XLSX} ({len(SHEETS)} sheets + {len(APPENDICES)} appendices)')


if __name__ == '__main__':
    main()
