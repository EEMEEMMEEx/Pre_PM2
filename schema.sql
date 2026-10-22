-- ==============================================================================
-- NBTC Microwave — Pre-PM Survey Cloudflare D1 Database Schema & Migration Guide
-- Database: pre-pm2-prod (Cloudflare D1 SQLite)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Table: surveys (Primary Survey Records - JSON Form Data without Base64)
-- ------------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------------
-- 2. Table: survey_photos (Field Photos Metadata - Files Stored in OneDrive Hub)
-- ------------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------------
-- 3. Table: stations (Master Station Information from Master Database)
-- ------------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------------
-- 4. Table: meta_sync (Real-time Change Tracking & ETag Cache Invalidation)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meta_sync (
    key TEXT PRIMARY KEY,
    last_change_timestamp TEXT NOT NULL,
    change_counter INTEGER NOT NULL DEFAULT 1
);

INSERT OR IGNORE INTO meta_sync (key, last_change_timestamp, change_counter)
VALUES ('surveys', datetime('now'), 1);

-- ==============================================================================
-- SAMPLE D1 PREPARED QUERIES (Matching Application Survey JSON Structure)
-- ==============================================================================

-- [QUERY 1: INSERT / CREATE]
-- Executed upon web form submission via POST /api/surveys or /api/save
-- 1a. Insert main survey row
-- Parameters: [record_id, saved_at, updated_at, version, station, province, permit, fields_json]
-- INSERT OR REPLACE INTO surveys (
--     record_id, saved_at, updated_at, version, station, province, permit, fields_json, deleted_at
-- ) VALUES (
--     'PM-202610220824223-4daf',
--     '2026-10-22T08:24:22.345Z',
--     '2026-10-22T08:24:22.345Z',
--     1,
--     'สถานีตากฟ้า',
--     'นครสวรรค์',
--     'อนุญาต',
--     '{"recordId":"PM-202610220824223-4daf","station":"สถานีตากฟ้า","province":"นครสวรรค์","permit":"อนุญาต","towerStatus":"ปกติ"}',
--     NULL
-- );
-- 1b. Insert associated photo metadata
-- Parameters: [photo_id, record_id, file_name, original_name, content_type, file_size, onedrive_path, created_at]
-- INSERT OR REPLACE INTO survey_photos (
--     id, record_id, file_name, original_name, content_type, file_size, onedrive_relative_path, created_at
-- ) VALUES (
--     'PM-202610220824223-4daf_p1',
--     'PM-202610220824223-4daf',
--     'PM-202610220824223-4daf_tower.jpg',
--     'tower.jpg',
--     'image/jpeg',
--     124500,
--     'photos/PM-202610220824223-4daf_tower.jpg',
--     '2026-10-22T08:24:22.345Z'
-- );
-- 1c. Invalidate cache counter
-- INSERT OR REPLACE INTO meta_sync (key, last_change_timestamp, change_counter)
-- VALUES ('surveys', datetime('now'), COALESCE((SELECT change_counter + 1 FROM meta_sync WHERE key = 'surveys'), 1));

-- [QUERY 2: SELECT ALL / LIST]
-- Executed on Dashboard load via GET /api/surveys or GET /api/dashboard
-- SELECT record_id, station, province, permit, saved_at, updated_at, fields_json, version
-- FROM surveys
-- WHERE deleted_at IS NULL
-- ORDER BY updated_at DESC
-- LIMIT 50 OFFSET 0;

-- [QUERY 3: SELECT SINGLE BY RECORD ID]
-- Executed on survey report/edit view via GET /api/surveys/:id
-- SELECT record_id, station, province, permit, saved_at, updated_at, fields_json, version
-- FROM surveys
-- WHERE record_id = 'PM-202610220824223-4daf' AND deleted_at IS NULL;

-- [QUERY 4: UPDATE / MODIFY]
-- Executed on survey edit form via PUT /api/surveys/:id or POST /api/update
-- UPDATE surveys
-- SET updated_at = '2026-10-22T09:00:00.000Z',
--     station = 'สถานีตากฟ้า',
--     province = 'นครสวรรค์',
--     permit = 'อนุญาต',
--     fields_json = '{"recordId":"PM-202610220824223-4daf","station":"สถานีตากฟ้า","province":"นครสวรรค์","permit":"อนุญาต","remark":"ตรวจสอบแล้ว"}',
--     version = version + 1
-- WHERE record_id = 'PM-202610220824223-4daf';

-- [QUERY 5: DELETE (SOFT DELETE TOMBSTONE)]
-- Executed on survey deletion via DELETE /api/surveys/:id or POST /api/delete
-- UPDATE surveys
-- SET deleted_at = '2026-10-22T09:15:00.000Z'
-- WHERE record_id = 'PM-202610220824223-4daf';
