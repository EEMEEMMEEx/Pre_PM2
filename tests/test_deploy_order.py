"""
Tests for deploy_r2.py upload ordering (B9 - Atomic upload sequence against cancel-in-progress)
Uses Python stdlib unittest only.
"""

from pathlib import Path
import unittest
from unittest.mock import MagicMock, patch

from deploy_r2 import DIST_DIR, prepare_upload_files, deploy_frontend_to_r2


class TestDeployUploadOrder(unittest.TestCase):
    def test_prepare_upload_files_puts_index_html_last(self):
        """ตรวจว่า prepare_upload_files เรียงลำดับไฟล์ assets/static ก่อน และ index.html เป็นตัวสุดท้ายเสมอ"""
        files = prepare_upload_files(DIST_DIR)
        self.assertGreater(len(files), 0, "dist/ directory should not be empty")

        # index.html ต้องอยู่ที่ตำแหน่งสุดท้าย
        last_file = files[-1]
        self.assertEqual(
            last_file.relative_to(DIST_DIR).as_posix(),
            "index.html",
            "index.html must be the last file in the upload sequence",
        )

        # ทุกไฟล์ก่อนหน้าต้องไม่ใช่ root index.html
        for f in files[:-1]:
            self.assertNotEqual(
                f.relative_to(DIST_DIR).as_posix(),
                "index.html",
                f"File {f} is index.html but was placed before the end",
            )

    def test_deploy_frontend_sequence_with_mock_s3(self):
        """ตรวจว่า deploy_frontend_to_r2 เรียก put_object โดย asset ทั้งหมดถูกอัปโหลดก่อน index.html และ SPA fallbacks"""
        mock_s3 = MagicMock()
        uploaded_keys = []

        def fake_put_object(**kwargs):
            uploaded_keys.append(kwargs.get("Key"))
            return {}

        mock_s3.put_object.side_effect = fake_put_object

        with patch("deploy_r2.get_s3_client", return_value=mock_s3):
            with patch("deploy_r2.purge_legacy_secret_keys"):
                # Mock DatabaseService to avoid needing live database
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
                    )

        # ยืนยันว่า index.html ถูกอัปโหลด
        self.assertIn("index.html", uploaded_keys)
        index_html_pos = uploaded_keys.index("index.html")

        # ตรวจสอบว่า asset สำคัญ ๆ ถูกอัปโหลดก่อน index.html
        asset_keys = [k for k in uploaded_keys if k.startswith("assets/") or k.startswith("fonts/")]
        self.assertGreater(len(asset_keys), 0, "Should have assets/ and fonts/ files uploaded")

        for ak in asset_keys:
            ak_pos = uploaded_keys.index(ak)
            self.assertLess(
                ak_pos,
                index_html_pos,
                f"Asset {ak} at {ak_pos} should be uploaded BEFORE index.html at {index_html_pos}",
            )

        # ตรวจสอบว่า SPA route fallbacks (เช่น dashboard, field) ถูกอัปโหลดหลัง index.html
        for spa_key in ["dashboard", "field", "login"]:
            self.assertIn(spa_key, uploaded_keys)
            spa_pos = uploaded_keys.index(spa_key)
            self.assertGreater(
                spa_pos,
                index_html_pos,
                f"SPA route {spa_key} at {spa_pos} should be uploaded AFTER index.html at {index_html_pos}",
            )


if __name__ == "__main__":
    unittest.main()
