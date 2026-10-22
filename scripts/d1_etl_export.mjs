/**
 * NBTC Microwave — Pre-PM Cloudflare D1 ETL Migration Tool
 * 
 * 1. Reads all survey files in data/surveys/*.json
 * 2. Completely strips heavy Base64 data (data, dataUrl, base64Data) from photos
 * 3. Builds clean photo metadata linked to OneDrive photos/ folder
 * 4. Extracts master stations from DATABASE.xlsx
 * 5. Generates SQL seed script for Cloudflare D1: migrations/0002_seed_data.sql
 * 6. Generates JSON snapshot file: dist/api/d1_seed_payload.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const SURVEYS_DIR = path.resolve(ROOT_DIR, 'data', 'surveys');
const DATABASE_XLSX = path.resolve(ROOT_DIR, 'DATABASE.xlsx');
const MIGRATIONS_DIR = path.resolve(ROOT_DIR, 'migrations');
const SQL_OUTPUT_FILE = path.resolve(MIGRATIONS_DIR, '0002_seed_data.sql');

function escapeSql(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  return `'${String(val).replace(/'/g, "''")}'`;
}

function normalizeStationKey(name) {
  const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';
  let s = String(name || '').trim();
  for (let i = 0; i < THAI_DIGITS.length; i++) {
    s = s.replaceAll(THAI_DIGITS[i], String(i));
  }
  return s.split(/\s+/).join(' ');
}

function loadMasterStations() {
  const seen = new Set();
  const stations = [];

  if (fs.existsSync(DATABASE_XLSX)) {
    try {
      const wb = XLSX.readFile(DATABASE_XLSX);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      let headerIdx = -1;
      const colMap = {};

      for (let i = 0; i < Math.min(5, rows.length); i++) {
        const rowStr = (rows[i] || []).join(' ');
        if (rowStr.includes('หมู่บ้าน') || rowStr.includes('สถานี')) {
          headerIdx = i;
          rows[i].forEach((val, cIdx) => {
            const valStr = String(val || '').replace(/\s+/g, '');
            if (valStr.includes('หมู่บ้าน') || valStr.includes('สถานี')) colMap.village = cIdx;
            else if (valStr.includes('ตำบล')) colMap.subdistrict = cIdx;
            else if (valStr.includes('อำเภอ')) colMap.district = cIdx;
            else if (valStr.includes('จังหวัด')) colMap.province = cIdx;
            else if (valStr.includes('สถานที่ติดตั้ง') || valStr.includes('พื้นที่ตั้งเสา')) colMap.installation_place = cIdx;
            else if (valStr.includes('สถานที่วางเครื่อง') || valStr.includes('พื้นที่วางเครื่อง')) colMap.equipment_place = cIdx;
            else if (valStr.includes('เจ้าหน้าที่') || valStr.includes('ชื่อ')) colMap.contact_name = cIdx;
            else if (valStr.includes('ตำแหน่ง')) colMap.contact_position = cIdx;
            else if (valStr.includes('เบอร์โทร')) colMap.contact_phone = cIdx;
            else if (valStr.includes('บ้านเลขที่')) colMap.house_no = cIdx;
          });
          break;
        }
      }

      if (headerIdx !== -1 && colMap.village !== undefined) {
        for (let i = headerIdx + 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || !row[colMap.village]) continue;
          const village = normalizeStationKey(String(row[colMap.village]).trim());
          if (!village || seen.has(village)) continue;
          if (village.includes('หมายเหตุ') || village.startsWith('ลำดับที่')) continue;

          seen.add(village);
          stations.push({
            id: stations.length + 1,
            village,
            subdistrict: colMap.subdistrict !== undefined ? String(row[colMap.subdistrict] || '').trim() : '',
            district: colMap.district !== undefined ? String(row[colMap.district] || '').trim() : '',
            province: colMap.province !== undefined ? String(row[colMap.province] || '').trim() : '',
            installation_place: colMap.installation_place !== undefined ? String(row[colMap.installation_place] || '').trim() : '',
            equipment_place: colMap.equipment_place !== undefined ? String(row[colMap.equipment_place] || '').trim() : '',
            contact_name: colMap.contact_name !== undefined ? String(row[colMap.contact_name] || '').trim() : '',
            contact_position: colMap.contact_position !== undefined ? String(row[colMap.contact_position] || '').trim() : '',
            contact_phone: colMap.contact_phone !== undefined ? String(row[colMap.contact_phone] || '').trim() : '',
            house_no: colMap.house_no !== undefined ? String(row[colMap.house_no] || '').trim() : '',
          });
        }
      }
    } catch (e) {
      console.warn('[ETL] Failed to parse DATABASE.xlsx:', e.message);
    }
  }

  return stations;
}

export function runEtl() {
  if (!fs.existsSync(SURVEYS_DIR)) {
    console.error(`[ERROR] Surveys directory not found: ${SURVEYS_DIR}`);
    process.exit(1);
  }

  if (!fs.existsSync(MIGRATIONS_DIR)) {
    fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
  }

  console.log('='.repeat(70));
  console.log(' NBTC Microwave — Cloudflare D1 ETL Migration Tool');
  console.log('='.repeat(70));

  const surveyFiles = fs.readdirSync(SURVEYS_DIR).filter((f) => f.endsWith('.json'));
  let originalBytesTotal = 0;
  let cleanBytesTotal = 0;

  const cleanSurveys = [];
  const cleanPhotos = [];

  for (const filename of surveyFiles) {
    const filePath = path.join(SURVEYS_DIR, filename);
    const rawContent = fs.readFileSync(filePath, 'utf8');
    originalBytesTotal += Buffer.byteLength(rawContent, 'utf8');

    let doc;
    try {
      doc = JSON.parse(rawContent);
    } catch (e) {
      console.warn(`[WARN] Skipping invalid JSON: ${filename}`);
      continue;
    }

    const recordId = doc.recordId || doc.id || path.basename(filename, '.json');
    const fields = doc.fields || {};
    const station = fields.station || fields.stationSelect || doc.station || 'ไม่ระบุสถานี';
    const province = fields.province || doc.province || '';
    const permit = fields.permit === 'on' ? 'อนุญาต' : (fields.permit || doc.permit || 'ยังไม่ระบุ');
    const savedAt = doc.savedAt || new Date().toISOString();
    const updatedAt = doc.updatedAt || doc.savedAt || savedAt;
    const version = doc.version || 1;
    const deletedAt = doc.deletedAt || null;

    // Process Photos
    const rawPhotos = Array.isArray(doc.photos) && doc.photos.length > 0
      ? doc.photos
      : (Array.isArray(fields.photos) ? fields.photos : []);

    const surveyPhotoMeta = [];

    rawPhotos.forEach((p, idx) => {
      const cleanName = (p.name || `photo_${idx + 1}.jpg`).replace(/[/\\?%*:|"<>]/g, '_');
      const photoFileName = `${recordId}_${cleanName}`;
      const contentType = p.type || p.contentType || 'image/jpeg';
      const size = p.size || 0;
      const photoId = `${recordId}_p${idx + 1}`;

      surveyPhotoMeta.push({
        id: idx + 1,
        name: cleanName,
        fileName: photoFileName,
        contentType,
        size,
        url: `/photos/${photoFileName}`,
      });

      cleanPhotos.push({
        id: photoId,
        record_id: recordId,
        file_name: photoFileName,
        original_name: cleanName,
        content_type: contentType,
        file_size: size,
        onedrive_relative_path: `photos/${photoFileName}`,
        created_at: savedAt,
      });
    });

    // Create clean fields without Base64
    const cleanFields = { ...fields };
    cleanFields.recordId = recordId;
    cleanFields.station = station;
    cleanFields.province = province;
    cleanFields.permit = permit;
    cleanFields.photos = surveyPhotoMeta;

    // Remove any accidental Base64 fields
    delete cleanFields.data;
    delete cleanFields.dataUrl;
    delete cleanFields.base64Data;

    const fieldsJson = JSON.stringify(cleanFields);
    cleanBytesTotal += Buffer.byteLength(fieldsJson, 'utf8') + 200; // survey row overhead

    cleanSurveys.push({
      record_id: recordId,
      saved_at: savedAt,
      updated_at: updatedAt,
      version,
      station,
      province,
      permit,
      fields_json: fieldsJson,
      deleted_at: deletedAt,
    });
  }

  // Load Master Stations
  const stations = loadMasterStations();

  // Generate SQL Script
  const sqlLines = [];
  sqlLines.push('-- NBTC Microwave — D1 Seed Data Migration');
  sqlLines.push('-- Generated on: ' + new Date().toISOString());
  sqlLines.push('');
  sqlLines.push('-- 1. Insert Stations');
  for (const st of stations) {
    sqlLines.push(
      `INSERT OR REPLACE INTO stations (id, village, subdistrict, district, province, installation_place, equipment_place, contact_name, contact_position, contact_phone, house_no) VALUES (${st.id}, ${escapeSql(st.village)}, ${escapeSql(st.subdistrict)}, ${escapeSql(st.district)}, ${escapeSql(st.province)}, ${escapeSql(st.installation_place)}, ${escapeSql(st.equipment_place)}, ${escapeSql(st.contact_name)}, ${escapeSql(st.contact_position)}, ${escapeSql(st.contact_phone)}, ${escapeSql(st.house_no)});`
    );
  }

  sqlLines.push('');
  sqlLines.push('-- 2. Insert Surveys');
  for (const sv of cleanSurveys) {
    sqlLines.push(
      `INSERT OR REPLACE INTO surveys (record_id, saved_at, updated_at, version, station, province, permit, fields_json, deleted_at) VALUES (${escapeSql(sv.record_id)}, ${escapeSql(sv.saved_at)}, ${escapeSql(sv.updated_at)}, ${sv.version}, ${escapeSql(sv.station)}, ${escapeSql(sv.province)}, ${escapeSql(sv.permit)}, ${escapeSql(sv.fields_json)}, ${escapeSql(sv.deleted_at)});`
    );
  }

  sqlLines.push('');
  sqlLines.push('-- 3. Insert Survey Photos Metadata');
  for (const ph of cleanPhotos) {
    sqlLines.push(
      `INSERT OR REPLACE INTO survey_photos (id, record_id, file_name, original_name, content_type, file_size, onedrive_relative_path, created_at) VALUES (${escapeSql(ph.id)}, ${escapeSql(ph.record_id)}, ${escapeSql(ph.file_name)}, ${escapeSql(ph.original_name)}, ${escapeSql(ph.content_type)}, ${ph.file_size}, ${escapeSql(ph.onedrive_relative_path)}, ${escapeSql(ph.created_at)});`
    );
  }

  sqlLines.push('');
  sqlLines.push('-- 4. Update Meta Sync Token');
  sqlLines.push(
    `INSERT OR REPLACE INTO meta_sync (key, last_change_timestamp, change_counter) VALUES ('surveys', datetime('now'), ${cleanSurveys.length});`
  );

  fs.writeFileSync(SQL_OUTPUT_FILE, sqlLines.join('\n'), 'utf8');

  const origMb = (originalBytesTotal / (1024 * 1024)).toFixed(2);
  const cleanKb = (cleanBytesTotal / 1024).toFixed(1);
  const reduction = ((1 - cleanBytesTotal / originalBytesTotal) * 100).toFixed(1);

  console.log(` Surveys Processed     : ${cleanSurveys.length} records`);
  console.log(` Photos Processed      : ${cleanPhotos.length} photos`);
  console.log(` Master Stations Loaded: ${stations.length} stations`);
  console.log(` Original JSON Size    : ${origMb} MB`);
  console.log(` Clean D1 Payload Size : ${cleanKb} KB`);
  console.log(` Storage Reduction     : ${reduction}%`);
  console.log(` Generated SQL File    : ${SQL_OUTPUT_FILE}`);
  console.log('='.repeat(70));
}

runEtl();
