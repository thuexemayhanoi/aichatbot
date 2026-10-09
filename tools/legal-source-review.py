#!/usr/bin/env python3
"""Read-only primary-document review, bounded downloads and original excerpts."""
import hashlib
import json
from pathlib import Path
import subprocess
import urllib.request

SOURCES = [
    ("speed-2026", "https://moc.gov.vn/Images/FileVanBan/BXD_74-2026-VBHN-TT-BXD_15092026.pdf",
     ["Thông tư số", "Điều 3.", "Điều 6.", "Điều 7.", "Điều 11.", "09/2025"]),
    ("health-36-2024", "https://syt.gialai.gov.vn/vi/laws/detail/Quy-dinh-ve-tieu-chuan-suc-khoe-viec-kham-suc-khoe-doi-voi-nguoi-lai-xe-nguoi-dieu-khien-xe-may-chuyen-dung-viec-kham-suc-khoe-dinh-ky-doi-voi-nguoi-hanh-nghe-lai-xe-o-to-co-so-du-lieu-ve-suc-khoe-cua-nguoi-lai-xe-nguoi-dieu-khien-xe-may-chuyen-dung-225/?download=1&id=0",
     ["Điều 2.", "Điều 3.", "Điều 4.", "lái xe"]),
    ("consumer-19-2023", "https://pbgdpl.quangninh.gov.vn/wp-content/uploads/2026/01/Luat-bao-ve-quyen-loi-nguoi-tieu-dung.pdf",
     ["Điều 4.", "Điều 10.", "Điều 31.", "Điều 56.", "thương lượng"]),
]
MAX_BYTES = 20_000_000

def excerpts(text, terms, radius=1100):
    """Original text with positions; an excerpt is not a content approval."""
    found = []
    folded = text.casefold()
    for term in terms:
        at = folded.find(term.casefold())
        if at >= 0:
            found.append({"term": term, "position": at, "text": text[max(0, at - 200):at + radius]})
        else:
            found.append({"term": term, "position": None, "text": "TERM NOT FOUND"})
    return found

def main():
    root = Path("ops/out/legal-source-review")
    root.mkdir(parents=True, exist_ok=True)
    records = []
    print("SOURCE | READ ONLY: downloads do not certify any article or enable production.")
    for name, url, terms in SOURCES:
        record = {"id": name, "url": url}
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "MotoAI-primary-source-review/1.0"})
            with urllib.request.urlopen(request, timeout=40) as response:
                data = response.read(MAX_BYTES + 1)
                record["final_url"] = response.url
                record["content_type"] = response.headers.get("content-type")
            if len(data) > MAX_BYTES:
                raise ValueError("primary document exceeds review byte limit")
            if not data.startswith(b"%PDF"):
                raise ValueError("primary URL did not return a PDF")
            pdf = root / (name + ".pdf")
            txt = root / (name + ".txt")
            pdf.write_bytes(data)
            subprocess.run(["pdftotext", "-enc", "UTF-8", str(pdf), str(txt)], check=True, timeout=40)
            text = txt.read_text()
            if len(text.strip()) < 300:
                raise ValueError("PDF has no adequate extractable text; inspect the original artifact")
            record.update(status="READ", bytes=len(data), sha256=hashlib.sha256(data).hexdigest(), characters=len(text))
            print("SOURCE | " + json.dumps(record, ensure_ascii=False))
            for excerpt in excerpts(text, terms):
                print("SOURCE | " + json.dumps(excerpt, ensure_ascii=False))
        except Exception as error:
            record.update(status="REFUSED", error=str(error))
            print("SOURCE | " + json.dumps(record, ensure_ascii=False))
        records.append(record)
    (root / "records.json").write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n")
    # Refusals remain explicit. A source read never changes factory state.
    return 0 if all(r["status"] == "READ" for r in records) else 1

if __name__ == "__main__":
    raise SystemExit(main())
