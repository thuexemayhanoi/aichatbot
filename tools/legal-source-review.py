#!/usr/bin/env python3
"""Read-only primary-document review, bounded downloads and original excerpts."""
import hashlib
import json
import re
import signal
import ssl
from pathlib import Path
import subprocess
import urllib.request
import urllib.error
from urllib.parse import urlsplit

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


def issuer_uri(details):
    match = re.search(r"CA Issuers - URI:(https?://[^\s]+)", details)
    if not match:
        raise ValueError("certificate has no CA issuer URI")
    url = match.group(1)
    parsed = urlsplit(url)
    domains = ("sectigo.com", "comodoca.com", "digicert.com", "globalsign.com", "godaddy.com", "entrust.net", "ssl.com", "geotrust.com")
    if not parsed.hostname or parsed.username or parsed.password or parsed.port or not any(parsed.hostname == d or parsed.hostname.endswith("." + d) for d in domains):
        raise ValueError("issuer URI is outside the supported public CA domains")
    return url

def complete_verified_chain(url, root):
    """Repair only a missing intermediate; never add an untrusted root."""
    hostname = urlsplit(url).hostname
    if hostname != "moc.gov.vn":
        raise ValueError("no certificate-chain repair for this primary host")
    result = subprocess.run(["openssl", "s_client", "-connect", hostname + ":443", "-servername", hostname, "-showcerts"],
                            input="", capture_output=True, text=True, timeout=15)
    certs = re.findall(r"-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----", result.stdout, re.S)
    if not certs:
        raise ValueError("primary server did not expose a certificate")
    leaf = root / "moc-leaf.pem"
    leaf.write_text(certs[0] + "\n")
    current = leaf
    chain = []
    for index in range(2):
        details = subprocess.run(["openssl", "x509", "-in", str(current), "-noout", "-ext", "authorityInfoAccess"],
                                 capture_output=True, text=True, check=True, timeout=10).stdout
        ca_url = issuer_uri(details)
        with urllib.request.urlopen(ca_url, timeout=15) as response:
            data = response.read(1_000_001)
        if len(data) > 1_000_000:
            raise ValueError("CA issuer certificate is oversized")
        encoded = root / ("moc-issuer-" + str(index) + ".crt")
        encoded.write_bytes(data)
        pem = root / ("moc-issuer-" + str(index) + ".pem")
        args = ["openssl", "x509", "-in", str(encoded), "-out", str(pem)]
        if not data.startswith(b"-----BEGIN"):
            args += ["-inform", "DER"]
        subprocess.run(args, check=True, capture_output=True, timeout=10)
        chain.append(pem.read_text())
        bundle = root / "moc-issuer-chain.pem"
        bundle.write_text("\n".join(chain))
        trusted = ssl.get_default_verify_paths().cafile
        if not trusted:
            raise ValueError("system trusted CA bundle missing")
        verification = subprocess.run(["openssl", "verify", "-purpose", "sslserver", "-verify_hostname", hostname,
                                       "-CAfile", trusted, "-untrusted", str(bundle), str(leaf)],
                                      capture_output=True, text=True, timeout=10)
        if verification.returncode == 0:
            context = ssl.create_default_context()
            context.load_verify_locations(cafile=str(bundle))
            print("SOURCE | certificate chain verified against system roots: " + verification.stdout.strip(), flush=True)
            return context
        current = pem
    raise ValueError("issuer chain does not verify against system trusted roots")

def source_timeout(_signal, _frame):
    raise TimeoutError("primary source exceeded its 80-second total review budget")

def main():
    root = Path("ops/out/legal-source-review")
    root.mkdir(parents=True, exist_ok=True)
    signal.signal(signal.SIGALRM, source_timeout)
    records = []
    print("SOURCE | READ ONLY: downloads do not certify any article or enable production.")
    for name, url, terms in SOURCES:
        record = {"id": name, "url": url}
        try:
            signal.alarm(80)
            request = urllib.request.Request(url, headers={"User-Agent": "MotoAI-primary-source-review/1.0"})
            try:
                response = urllib.request.urlopen(request, timeout=20)
            except urllib.error.URLError as error:
                if not isinstance(error.reason, ssl.SSLCertVerificationError):
                    raise
                context = complete_verified_chain(url, root)
                response = urllib.request.urlopen(request, timeout=20, context=context)
                record["verified_chain_completed"] = True
            with response:
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
        finally:
            signal.alarm(0)
        records.append(record)
    (root / "records.json").write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n")
    # Refusals remain explicit. A source read never changes factory state.
    return 0 if all(r["status"] == "READ" for r in records) else 1

if __name__ == "__main__":
    raise SystemExit(main())
