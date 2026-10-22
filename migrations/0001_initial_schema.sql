-- NBTC Microwave — Pre-PM Survey Cloudflare D1 Initial Migration
-- Target Schema: surveys, survey_photos, stations, meta_sync

-- 1. ตารางแบบสำรวจ (เก็บเฉพาะ Form Data และ Metadata ไร้ Base64)
CREATE TABLE IF NOT EXISTS surveys (
    record_id TEXT PRIMARY KEY,
    saved_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    station TEXT NOT NULL,
    province TEXT NOT NULL,
    permit TEXT,
    fields_json TEXT NOT NULL,
    deleted_at TEXT DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_surveys_updated_at ON surveys (updated_at);
CREATE INDEX IF NOT EXISTS idx_surveys_station ON surveys (station);
CREATE INDEX IF NOT EXISTS idx_surveys_deleted_at ON surveys (deleted_at);

-- 2. ตารางข้อมูลรูปถ่าย (เก็บเฉพาะ Metadata และชื่อไฟล์ที่เก็บใน OneDrive)
CREATE TABLE IF NOT EXISTS survey_photos (
    id TEXT PRIMARY KEY,
    record_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    original_name TEXT,
    content_type TEXT NOT NULL DEFAULT 'image/jpeg',
    file_size INTEGER DEFAULT 0,
    onedrive_relative_path TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (record_id) REFERENCES surveys(record_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_survey_photos_record_id ON survey_photos (record_id);

-- 3. ตารางสถานีแม่ข่าย Master Station
CREATE TABLE IF NOT EXISTS stations (
    id INTEGER PRIMARY KEY,
    village TEXT NOT NULL,
    subdistrict TEXT,
    district TEXT,
    province TEXT,
    installation_place TEXT,
    equipment_place TEXT,
    contact_name TEXT,
    contact_position TEXT,
    contact_phone TEXT,
    house_no TEXT
);

CREATE INDEX IF NOT EXISTS idx_stations_province ON stations (province);

-- 4. ตาราง System Change Token สำหรับ Dashboard Polling แบบประหยัด Rows Read
CREATE TABLE IF NOT EXISTS meta_sync (
    key TEXT PRIMARY KEY,
    last_change_timestamp TEXT NOT NULL,
    change_counter INTEGER NOT NULL DEFAULT 1
);

INSERT OR IGNORE INTO meta_sync (key, last_change_timestamp, change_counter)
VALUES ('surveys', datetime('now'), 1);
