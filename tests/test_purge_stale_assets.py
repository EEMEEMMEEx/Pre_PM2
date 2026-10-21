"""
Tests for deploy_r2.py stale assets purging (B2 - Purge stale hashed assets from Cloudflare R2)
Uses Python stdlib unittest only.
"""

from pathlib import Path
import unittest
from unittest.mock import MagicMock, patch

from deploy_r2 import (
    DIST_DIR,
    find_stale_assets,
    purge_stale_assets,
    preview_deployment,
    deploy_frontend_to_r2,
)


class TestPurgeStaleAssets(unittest.TestCase):
    def setUp(self):
        self.mock_s3 = MagicMock()
        self.bucket = "test-bucket"

    def test_find_stale_assets_filters_correctly(self):
        """ตรวจว่า find_stale_assets คืนเฉพาะไฟล์ใต้ assets/ ที่ไม่อยู่ใน dist/ และไม่แตะไฟล์อื่น"""
        # สมมติมีไฟล์ใน bucket 5 ไฟล์:
        # - assets/index-Bo0eDo-P.js (stale - bundle เก่าที่เคยมี token)
        # - assets/index-DOixsAy_.js (stale - bundle เก่าที่เคยมี token)
        # - assets/forth-logo-sf6LiV7p.png (current - อยู่ใน dist)
        # - index.html (root file - ต้องห้ามลบ)
        # - api/dashboard (snapshot - ต้องห้ามลบ)
        mock_paginator = MagicMock()
        mock_paginator.paginate.return_value = [
            {
                "Contents": [
                    {"Key": "assets/index-Bo0eDo-P.js"},
                    {"Key": "assets/index-DOixsAy_.js"},
                    {"Key": "assets/forth-logo-sf6LiV7p.png"},
                    {"Key": "index.html"},
                    {"Key": "api/dashboard"},
                ]
            }
        ]
        self.mock_s3.get_paginator.return_value = mock_paginator

        stale = find_stale_assets(self.mock_s3, self.bucket, DIST_DIR)

        # ต้องตรวจเจอ 2 คีย์เก่าที่มีปัญหา
        self.assertIn("assets/index-Bo0eDo-P.js", stale)
        self.assertIn("assets/index-DOixsAy_.js", stale)

        # ต้องไม่รวม asset ปัจจุบันที่อยู่ใน dist/assets/
        self.assertNotIn("assets/forth-logo-sf6LiV7p.png", stale)

        # ต้องไม่รวมไฟล์นอก assets/
        self.assertNotIn("index.html", stale)
        self.assertNotIn("api/dashboard", stale)

    def test_purge_stale_assets_dry_run_does_not_delete(self):
        """ตรวจว่า purge_stale_assets ในโหมด dry_run=True จะไม่เรียก delete_object"""
        mock_paginator = MagicMock()
        mock_paginator.paginate.return_value = [
            {
                "Contents": [
                    {"Key": "assets/index-Bo0eDo-P.js"},
                    {"Key": "assets/index-DOixsAy_.js"},
                ]
            }
        ]
        self.mock_s3.get_paginator.return_value = mock_paginator

        result = purge_stale_assets(self.mock_s3, self.bucket, DIST_DIR, dry_run=True)

        self.assertEqual(len(result), 2)
        self.mock_s3.delete_object.assert_not_called()

    def test_purge_stale_assets_live_deletes_only_stale_assets(self):
        """ตรวจว่า purge_stale_assets โหมดปกติเรียก delete_object เฉพาะ key ที่เป็น stale assets"""
        mock_paginator = MagicMock()
        mock_paginator.paginate.return_value = [
            {
                "Contents": [
                    {"Key": "assets/index-Bo0eDo-P.js"},
                    {"Key": "assets/index-DOixsAy_.js"},
                ]
            }
        ]
        self.mock_s3.get_paginator.return_value = mock_paginator

        purged = purge_stale_assets(self.mock_s3, self.bucket, DIST_DIR, dry_run=False)

        self.assertEqual(len(purged), 2)
        self.assertEqual(self.mock_s3.delete_object.call_count, 2)
        self.mock_s3.delete_object.assert_any_call(
            Bucket=self.bucket, Key="assets/index-Bo0eDo-P.js"
        )
        self.mock_s3.delete_object.assert_any_call(
            Bucket=self.bucket, Key="assets/index-DOixsAy_.js"
        )

    def test_preview_deployment_with_purge_stale_assets(self):
        """ตรวจว่า preview_deployment รันสำเร็จเมื่อเปิด purge_stale_assets_enabled"""
        mock_paginator = MagicMock()
        mock_paginator.paginate.return_value = [
            {"Contents": [{"Key": "assets/index-Bo0eDo-P.js"}]}
        ]
        self.mock_s3.get_paginator.return_value = mock_paginator

        with patch("deploy_r2.get_s3_client", return_value=self.mock_s3):
            # Mock database so snapshot preview runs smoothly
            mock_db = MagicMock()
            mock_db.get_stations.return_value = []
            mock_db.get_dashboard_payload.return_value = {"recent": []}

            with patch.dict("sys.modules", {"database": MagicMock(DatabaseService=mock_db)}):
                code = preview_deployment(
                    bucket_name="test-bucket",
                    endpoint="https://test.r2.cloudflarestorage.com",
                    purge_stale_assets_enabled=True,
                    key_id="dummy_key",
                    secret="dummy_secret",
                )
                self.assertEqual(code, 0)

    def test_deploy_frontend_runs_purge_stale_after_upload(self):
        """ตรวจว่า deploy_frontend_to_r2 ที่เปิด purge_stale=True จะรัน purge_stale_assets หลัง upload เสร็จสิ้น"""
        operations = []

        def fake_put_object(**kwargs):
            operations.append(("put", kwargs.get("Key")))
            return {}

        def fake_delete_object(**kwargs):
            operations.append(("delete", kwargs.get("Key")))
            return {}

        self.mock_s3.put_object.side_effect = fake_put_object
        self.mock_s3.delete_object.side_effect = fake_delete_object

        mock_paginator = MagicMock()
        mock_paginator.paginate.return_value = [
            {"Contents": [{"Key": "assets/index-Bo0eDo-P.js"}]}
        ]
        self.mock_s3.get_paginator.return_value = mock_paginator

        with patch("deploy_r2.get_s3_client", return_value=self.mock_s3):
            mock_db = MagicMock()
            mock_db.get_stations.return_value = []
            mock_db.get_dashboard_payload.return_value = {"recent": []}
            mock_db.check_github_auth.return_value = {"authenticated": False}
            mock_db.get_onedrive_status.return_value = {"connected": False}

            with patch.dict("sys.modules", {"database": MagicMock(DatabaseService=mock_db)}):
                deploy_frontend_to_r2(
                    key_id="test_key",
                    secret="test_secret",
                    bucket_name="test_bucket",
                    endpoint="https://test.r2.cloudflarestorage.com",
                    purge_stale=True,
                )

        # ยืนยันว่ามีการ put_object ของ index.html
        put_keys = [key for op, key in operations if op == "put"]
        self.assertIn("index.html", put_keys)
        index_html_idx = [i for i, (op, key) in enumerate(operations) if op == "put" and key == "index.html"][0]

        # ยืนยันว่าการลบ stale asset เกิดขึ้น "หลัง" การอัปโหลด index.html เสมอ
        delete_stale_idx = [i for i, (op, key) in enumerate(operations) if op == "delete" and key == "assets/index-Bo0eDo-P.js"][0]
        self.assertGreater(
            delete_stale_idx,
            index_html_idx,
            "Stale assets must be deleted AFTER index.html is uploaded",
        )


if __name__ == "__main__":
    unittest.main()
