"""
Tests for GitHub Pages static snapshot writer (v2.11.6)

ครอบคลุม:
  * deploy_r2.write_snapshots_to_dir() เขียนไฟล์ครบตาม SNAPSHOT_KEYS (รวม alias)
  * ตรวจ PII ก่อนเขียน — ถ้ามีฟิลด์ติดต่อหลุดต้อง raise
  * scripts/verify_pages_snapshots.py จับเคส snapshot ว่าง / ไฟล์ขาด / PII หลุด

ใช้ Python stdlib unittest เท่านั้น (เหมือนเทสต์อื่นในโปรเจกต์นี้)
"""

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from deploy_r2 import SNAPSHOT_KEYS, write_snapshots_to_dir  # noqa: E402
from scripts.verify_pages_snapshots import verify_snapshots  # noqa: E402


def make_mock_db(stations=None, recent=None):
    """สร้าง DatabaseService ปลอมที่มีข้อมูลคล้ายของจริง"""
    db = MagicMock()
    db.get_stations.return_value = stations if stations is not None else [
        {"id": 1, "village": "บ้านทดสอบ", "province": "กาญจนบุรี"},
    ]
    db.get_dashboard_payload.return_value = {
        "stats": {"surveys": len(recent or []), "stations": len(stations or []), "allowed": 0, "denied": 0},
        "recent": recent if recent is not None else [
            {"recordId": "PM-1", "station": "สถานี 1", "province": "กาญจนบุรี", "permit": "อนุญาต", "fields": {}},
        ],
        "provinces": [{"name": "กาญจนบุรี", "count": 1}],
    }
    db.check_github_auth.return_value = {"configured": False, "valid": False}
    db.get_onedrive_status.return_value = {"configured": True, "status": "synced", "surveysCount": 1}
    return db


class TestWriteSnapshots(unittest.TestCase):
    def test_writes_all_snapshot_files_including_aliases(self):
        """ต้องเขียนไฟล์ครบทุก key ใน SNAPSHOT_KEYS รวม alias ที่ไม่มี prefix /api"""
        db = make_mock_db()
        with tempfile.TemporaryDirectory() as tmp:
            with patch.dict("sys.modules", {"database": MagicMock(DatabaseService=db)}):
                written, report = write_snapshots_to_dir(Path(tmp))

            expected = {key for aliases in SNAPSHOT_KEYS.values() for key in aliases}
            actual = {p.relative_to(tmp).as_posix() for p in written}
            self.assertEqual(actual, expected, "ไฟล์ snapshot ที่เขียนไม่ตรงกับ SNAPSHOT_KEYS")

            # ไฟล์ที่เขียนต้อง parse ได้และ alias ชี้เนื้อหาเดียวกัน
            for key in SNAPSHOT_KEYS["dashboard"]:
                payload = json.loads((Path(tmp) / key).read_text(encoding="utf-8"))
                self.assertIsInstance(payload.get("recent"), list)

            self.assertIn("stations", report)

    def test_raises_when_dashboard_pii_left_in_snapshot(self):
        """ถ้า sanitize ไม่ทำงาน (มี PII ค้าง) ต้อง raise ไม่ปล่อยไฟล์ที่ทุกคนอ่านได้"""
        recent = [{
            "recordId": "PM-PII",
            "station": "สถานี",
            "province": "กาญจนบุรี",
            "fields": {"contactPhone": "0812345678"},
        }]
        db = make_mock_db(recent=recent)

        # ปิด sanitize เพื่อจำลองว่า PII หลุดผ่าน
        with tempfile.TemporaryDirectory() as tmp:
            with patch.dict("sys.modules", {"database": MagicMock(DatabaseService=db)}), \
                 patch("deploy_r2.sanitize_dashboard_payload", side_effect=lambda p: (p, 0)):
                with self.assertRaises(RuntimeError) as ctx:
                    write_snapshots_to_dir(Path(tmp))
            self.assertIn("PII", str(ctx.exception))

    def test_written_dashboard_matches_stats(self):
        """ค่าที่เขียนลงไฟล์ต้องสอดคล้องกับ stats ที่รายงาน (กัน Pages แสดง 0)"""
        db = make_mock_db()
        with tempfile.TemporaryDirectory() as tmp:
            with patch.dict("sys.modules", {"database": MagicMock(DatabaseService=db)}):
                _, report = write_snapshots_to_dir(Path(tmp))

            payload = json.loads((Path(tmp) / "api/dashboard").read_text(encoding="utf-8"))
            self.assertEqual(len(payload["recent"]), len(db.get_dashboard_payload.return_value["recent"]))
            self.assertEqual(report["surveys"], len(payload["recent"]))
            self.assertEqual(report["stations"], len(db.get_stations.return_value))


class TestVerifyPagesSnapshots(unittest.TestCase):
    def _write_minimal(self, root: Path, recent, stations=197, pii=False):
        api = root / "api"
        api.mkdir(parents=True, exist_ok=True)
        dash = {"stats": {"surveys": len(recent), "stations": stations}, "recent": recent, "provinces": []}
        (api / "dashboard").write_text(json.dumps(dash), encoding="utf-8")
        (api / "database").write_text(json.dumps({"stations": []}), encoding="utf-8")
        (api / "github-status").write_text("{}", encoding="utf-8")
        (api / "onedrive-status").write_text("{}", encoding="utf-8")

    def test_missing_snapshot_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(verify_snapshots(Path(tmp)), 1)

    def test_empty_recent_fails(self):
        """snapshot ที่ recent[] ว่างคือเคสที่ทำให้งานนี้ไม่มีประโยชน์ -> ต้อง fail"""
        with tempfile.TemporaryDirectory() as tmp:
            self._write_minimal(Path(tmp), recent=[])
            self.assertEqual(verify_snapshots(Path(tmp)), 1)

    def test_zero_stations_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            self._write_minimal(Path(tmp), recent=[{"recordId": "PM-1"}], stations=0)
            self.assertEqual(verify_snapshots(Path(tmp)), 1)

    def test_pii_leak_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            self._write_minimal(Path(tmp), recent=[{"recordId": "PM-1", "fields": {"contactPhone": "081"}}])
            self.assertEqual(verify_snapshots(Path(tmp)), 1)

    def test_valid_snapshot_passes(self):
        with tempfile.TemporaryDirectory() as tmp:
            self._write_minimal(Path(tmp), recent=[{"recordId": "PM-1", "fields": {"permit": "อนุญาต"}}])
            self.assertEqual(verify_snapshots(Path(tmp)), 0)


if __name__ == "__main__":
    unittest.main()
