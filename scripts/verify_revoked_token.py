#!/usr/bin/env python3
"""ตรวจว่า GitHub token ที่เคยรั่วถูกเพิกถอนแล้วหรือยัง (read-only)

รวบรวมค่า token จากแหล่งที่เคยเผยแพร่สาธารณะ (bundle เก่าบน Cloudflare R2 และ blob ใน git history)
แล้วทดสอบกับ GitHub API โดย **ไม่พิมพ์ค่า token** — แสดงเฉพาะ fingerprint SHA-256 (16 ตัวแรก)

ตัวอย่าง:
    python scripts/verify_revoked_token.py                     # ตรวจทุกแหล่ง (ต้องต่อเน็ต)
    python scripts/verify_revoked_token.py --no-network        # แค่สกัดค่า + fingerprint
    python scripts/verify_revoked_token.py --source r2-bundle-a
    python scripts/verify_revoked_token.py --json

ผลลัพธ์ที่คาดหวังหลัง revoke: ทุกแหล่งได้ HTTP 401 (Bad credentials)
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import urllib.error
import urllib.request

R2_BASE = "https://pub-bc30fda8b7654fa09add325ab0f468e0.r2.dev"
GITHUB_API = "https://api.github.com"

# แหล่งที่รู้ว่าเคยมีค่าฝังอยู่ (เพิ่มได้เมื่อพบแหล่งใหม่)
SOURCES = {
    "r2-bundle-a": f"{R2_BASE}/assets/index-Bo0eDo-P.js",
    "r2-bundle-b": f"{R2_BASE}/assets/index-DOixsAy_.js",
    "git-history": "https://raw.githubusercontent.com/Thaidimaru/Pre_PM2/3e0baa7/src/lib/api.js",
}

# รูปแบบเดิมในโค้ด: ['gh','o_','xxxx','yyyy','zzzz','wwww'].join('')
SPLIT_TOKEN_RE = re.compile(
    r"""\[\s*["']gh["']\s*,\s*["']o_["']\s*,\s*["']([A-Za-z0-9]+)["']\s*,\s*["']([A-Za-z0-9]+)["']"""
    r"""\s*,\s*["']([A-Za-z0-9]+)["']\s*,\s*["']([A-Za-z0-9]+)["']\s*\]\s*\.join\(\s*["']["']\s*\)"""
)


def fetch(url: str, timeout: int = 20) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "prepm-verify-revoked-token"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", "replace")


def fingerprint(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()[:16]


def extract_token(text: str):
    match = SPLIT_TOKEN_RE.search(text or "")
    if not match:
        return None
    return "gh" + "o_" + "".join(match.groups())


def probe_github(token: str) -> dict:
    """เรียก GitHub API ด้วย token เพื่อดูว่ายังใช้ได้หรือถูกเพิกถอน (ไม่บันทึกค่า)"""
    headers = {
        "Authorization": "Bearer " + token,
        "Accept": "application/vnd.github+json",
        "User-Agent": "prepm-verify-revoked-token",
    }
    out = {}
    for label, path in (("user", "/user"), ("rate_limit", "/rate_limit"), ("repo", "/repos/Thaidimaru/Pre_PM2")):
        req = urllib.request.Request(GITHUB_API + path, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                body = json.loads(resp.read().decode("utf-8") or "{}")
                out[label] = {"status": resp.status, "login": body.get("login")}
        except urllib.error.HTTPError as err:
            message = ""
            try:
                message = json.loads(err.read().decode("utf-8") or "{}").get("message", "")
            except Exception:
                pass
            out[label] = {"status": err.code, "message": message}
        except Exception as err:  # network error
            out[label] = {"status": None, "error": str(err)}
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description="ตรวจว่า token ที่เคยรั่วถูกเพิกถอนแล้ว (read-only)")
    parser.add_argument("--source", choices=sorted(SOURCES), help="ตรวจเฉพาะแหล่งที่ระบุ")
    parser.add_argument("--no-network", action="store_true", help="ไม่เรียก GitHub API (สกัดค่า + fingerprint เท่านั้น)")
    parser.add_argument("--json", action="store_true", help="แสดงผลเป็น JSON")
    args = parser.parse_args()

    targets = [args.source] if args.source else sorted(SOURCES)
    report = []
    for name in targets:
        url = SOURCES[name]
        entry = {"source": name, "url": url}
        try:
            token = extract_token(fetch(url))
        except Exception as err:
            entry["result"] = "fetch_error"
            entry["error"] = str(err)
            report.append(entry)
            continue
        if not token:
            entry["result"] = "no_token_found"
            report.append(entry)
            continue
        entry["result"] = "token_found"
        entry["fingerprint"] = fingerprint(token)
        entry["token_length"] = len(token)
        if not args.no_network:
            probes = probe_github(token)
            entry["probes"] = probes
            user_status = probes.get("user", {}).get("status")
            if user_status == 401:
                entry["verdict"] = "REVOKED (401 Bad credentials)"
            elif user_status == 200:
                entry["verdict"] = "STILL VALID — ต้อง revoke ทันที"
            else:
                entry["verdict"] = "UNKNOWN (HTTP %s)" % user_status
        report.append(entry)

    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        for entry in report:
            line = "[%s] %s" % (entry["result"], entry["source"])
            if entry.get("fingerprint"):
                line += " | fingerprint=%s | len=%d" % (entry["fingerprint"], entry["token_length"])
            if entry.get("verdict"):
                line += " | %s" % entry["verdict"]
            if entry.get("error"):
                line += " | error=%s" % entry["error"]
            print(line)
        if any(e.get("verdict", "").startswith("STILL VALID") for e in report):
            print("\n[WARN] พบ credential ที่ยังใช้ได้ — ต้อง revoke ที่ต้นทางก่อนทำความสะอาด artifact")
            return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
