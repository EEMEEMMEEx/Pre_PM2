"""
Tests for deploy_r2.py snapshot PII sanitization (B3 - Scrub all residual PII from public CDN snapshots)
Uses Python stdlib unittest only.
"""

import json
import unittest
from unittest.mock import MagicMock, patch

from deploy_r2 import (
    sanitize_dashboard_payload,
    sanitize_onedrive_payload,
    sanitize_github_payload,
    PUBLIC_DASHBOARD_PII_FIELDS,
    PUBLIC_ONEDRIVE_PII_FIELDS,
    PUBLIC_GITHUB_PII_FIELDS,
    preview_deployment,
)


class TestSanitizeSnapshots(unittest.TestCase):
    def test_sanitize_dashboard_removes_contact_village_and_pii(self):
        """ตรวจว่า sanitize_dashboard_payload ลบ contactVillage และฟิลด์ติดต่อทั้งหมด"""
        payload = {
            "recent": [
                {
                    "recordId": "PM-TEST-001",
                    "station": "Test Station",
                    "province": "Bangkok",
                    "contactVillage": "หมู่บ้านร่มเย็น",
                    "contactName": "นายสมชาย ใจดี",
                    "fields": {
                        "contactVillage": "หมู่บ้านร่มเย็น",
                        "contactName": "นายสมชาย ใจดี",
                        "contactPhone": "0812345678",
                        "contactPosition": "ผู้ใหญ่บ้าน",
                        "informantName": "นางสมศรี",
                        "permit": "อนุญาต",
                        "station": "Test Station",
                    },
                }
            ]
        }

        sanitized, removed = sanitize_dashboard_payload(payload)
        json_str = json.dumps(sanitized)

        # ต้องไม่มีฟิลด์ PII ใด ๆ ปรากฏใน JSON
        for pii in PUBLIC_DASHBOARD_PII_FIELDS:
            self.assertNotIn(f'"{pii}"', json_str, f"PII field {pii} still found in dashboard snapshot")

        # ข้อมูลที่ไม่ใช่ PII ต้องอยู่ครบ
        entry = sanitized["recent"][0]
        self.assertEqual(entry["recordId"], "PM-TEST-001")
        self.assertEqual(entry["station"], "Test Station")
        self.assertEqual(entry["province"], "Bangkok")
        self.assertEqual(entry["fields"]["permit"], "อนุญาต")
        self.assertGreater(removed, 0)

    def test_sanitize_onedrive_payload_removes_account_paths_and_email(self):
        """ตรวจว่า sanitize_onedrive_payload ลบ account, folder, surveysDir, dbPath และ email ใน message"""
        payload = {
            "configured": True,
            "connected": True,
            "account": "utai323@gmail.com",
            "service": "Microsoft OneDrive",
            "folder": "D:\\APP\\Pre_PM2",
            "surveysDir": "D:\\APP\\Pre_PM2\\data\\surveys",
            "surveysCount": 180,
            "photosCount": 108,
            "dbPath": "D:\\APP\\Pre_PM2\\survey.db",
            "status": "synced",
            "message": "เชื่อมต่อศูนย์กลางจัดเก็บข้อมูล Microsoft OneDrive (utai323@gmail.com) สำเร็จ",
            "updatedAt": "2026-10-21T03:59:31.208967+00:00",
        }

        sanitized, removed = sanitize_onedrive_payload(payload)
        json_str = json.dumps(sanitized)

        # ต้องไม่มีฟิลด์ path เครื่อง หรือ email บัญชี
        for pii in PUBLIC_ONEDRIVE_PII_FIELDS:
            self.assertNotIn(f'"{pii}"', json_str, f"OneDrive PII field {pii} still in snapshot")

        self.assertNotIn("utai323@gmail.com", json_str)
        self.assertNotIn("D:\\\\APP", json_str)
        self.assertNotIn("survey.db", json_str)

        # ข้อมูลสถานะทั่วไปยังคงอยู่
        self.assertTrue(sanitized["configured"])
        self.assertTrue(sanitized["connected"])
        self.assertEqual(sanitized["surveysCount"], 180)
        self.assertEqual(sanitized["photosCount"], 108)
        self.assertEqual(sanitized["status"], "synced")
        self.assertIn("OneDrive", sanitized["service"])
        self.assertEqual(sanitized["message"], "เชื่อมต่อศูนย์กลางจัดเก็บข้อมูล Microsoft OneDrive สำเร็จ")
        self.assertEqual(removed, 5)

    def test_sanitize_github_payload_removes_user(self):
        """ตรวจว่า sanitize_github_payload ลบ user (login) ออกจาก snapshot"""
        payload = {
            "configured": True,
            "valid": True,
            "user": "Thaidimaru",
            "message": "เชื่อมต่อ GitHub สำเร็จ",
            "repo": "Thaidimaru/Pre_PM2",
            "branch": "main",
        }

        sanitized, removed = sanitize_github_payload(payload)
        json_str = json.dumps(sanitized)

        for pii in PUBLIC_GITHUB_PII_FIELDS:
            self.assertNotIn(f'"{pii}"', json_str, f"GitHub PII field {pii} still in snapshot")

        self.assertNotIn('"user": "Thaidimaru"', json_str)
        self.assertTrue(sanitized["configured"])
        self.assertTrue(sanitized["valid"])
        self.assertEqual(sanitized["repo"], "Thaidimaru/Pre_PM2")
        self.assertEqual(sanitized["branch"], "main")
        self.assertEqual(removed, 1)

    def test_preview_deployment_reports_zero_pii_leftovers(self):
        """ตรวจว่า preview_deployment รันสำเร็จและไม่พบ leftover PII keys ในทุก snapshot"""
        mock_db = MagicMock()
        mock_db.get_stations.return_value = []
        mock_db.get_dashboard_payload.return_value = {
            "recent": [
                {
                    "recordId": "PM-1",
                    "contactVillage": "บ้านนา",
                    "fields": {"contactVillage": "บ้านนา", "contactName": "สมปอง"},
                }
            ]
        }
        mock_db.check_github_auth.return_value = {"configured": True, "valid": True, "user": "secret_user"}
        mock_db.get_onedrive_status.return_value = {
            "configured": True,
            "account": "secret@gmail.com",
            "folder": "C:\\secret",
            "status": "synced",
        }

        with patch.dict("sys.modules", {"database": MagicMock(DatabaseService=mock_db)}):
            code = preview_deployment(
                bucket_name="test-bucket",
                endpoint="https://test.r2.cloudflarestorage.com",
            )
            self.assertEqual(code, 0)


if __name__ == "__main__":
    unittest.main()
