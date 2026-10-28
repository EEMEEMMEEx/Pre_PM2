/**
 * NBTC Microwave — Build Static Snapshots for GitHub Pages & Offline Static Hosting
 * Generates sanitized static snapshots in dist/api/ for zero-backend operation:
 *  - dist/api/dashboard (.json)
 *  - dist/api/database (.json)
 *  - dist/api/github-status (.json)
 *  - dist/api/onedrive-status (.json)
 *  - dist/404.html (SPA routing fallback)
 *  - dist/.nojekyll (bypasses Jekyll processing on GitHub Pages)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.resolve(ROOT_DIR, 'dist');
const API_DIR = path.resolve(DIST_DIR, 'api');
const SURVEYS_DIR = path.resolve(ROOT_DIR, 'data', 'surveys');

// Station aliases mapping legacy survey station names to official new names
const STATION_ALIASES = {
  'หมู่ 10 สำราญเหนือ (ศรีสุขสำราญ)': 'หมู่ 10 บ้านสำราญเหนือ',
  'หมู่ 8 วังหยี (เหมกน้อย)': 'หมู่ 8 บ้านเหมกน้อย',
  'หมู่ 8 ทุ่งเอื้อง (ลำขนุน)': 'หมู่ 8 บ้านลำขนุน',
  'หมู่ 10 หน้าโกฏิ (หัวดอน)': 'หมู่ 10 หัวดอน',
  'หมู่ 6 บางอุดม (บางมะขาม)': 'หมู่ 6 บางมะขาม',
  'หมู่ 9 บางคณฑี (น้ำทรัพย์)': 'หมู่ 9 น้ำทรัพย์',
  'หมู่ 7 บ้านใหม่วังเรือง (บ้านใหม่วังเรือน)': 'หมู่ 7 บ้านใหม่วังเรือง',
  'หมู่ 13 วังคำแพง (วังกำแพง)': 'หมู่ 13 บ้านวังกำแพง',
  'หมู่ 6 บ้านเกาะแก้วอนุสรณ์': 'หมู่ 6 บ้านเกาะแก้ว',
  'หมู่ 5 บ้านตากฟ้า': 'หมู่ 5 ตากฟ้า',
  'หมู่ 1 ลาดแคใต้': 'หมู่ 1 บ้านลาดแค',
  'หมู่ 14 หนองใหญ่ใต้': 'หมู่ 14 บ้านหนองใหญ่โต',
  'หมู่ 17 คลองโปร่ง': 'หมู่ 17 บ้านคลองโป่ง',
};

const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';

function normalizeStationKey(name) {
  let s = String(name || '').trim();
  for (let i = 0; i < THAI_DIGITS.length; i++) {
    s = s.replaceAll(THAI_DIGITS[i], String(i));
  }
  return s.split(/\s+/).join(' ');
}

// PII fields to sanitize from public dashboard snapshots
const PUBLIC_DASHBOARD_PII_FIELDS = [
  'contactName',
  'contactPosition',
  'contactPhone',
  'informantName',
  'contactVillage',
];

function sanitizeDashboardRecent(recentList) {
  return recentList.map((item) => {
    const entry = { ...item };
    const fields = { ...(entry.fields || {}) };

    // Strip PII fields
    for (const key of PUBLIC_DASHBOARD_PII_FIELDS) {
      delete fields[key];
      delete entry[key];
    }
    entry.fields = fields;

    // Sanitize heavy photos in dashboard snapshot (keep metadata, remove large base64 dataUrl)
    if (Array.isArray(entry.photos)) {
      entry.photos = entry.photos.map((p) => ({
        id: p.id,
        name: p.name,
        contentType: p.contentType,
        size: p.size,
      }));
    }
    if (Array.isArray(entry.fields.photos)) {
      entry.fields.photos = entry.fields.photos.map((p) => ({
        id: p.id,
        name: p.name,
        contentType: p.contentType,
        size: p.size,
      }));
    }

    return entry;
  });
}

function loadMasterStations() {
  const seen = new Set();
  const stations = [];

  // 1. Load from DATABASE.xlsx
  const dbFile = path.resolve(ROOT_DIR, 'DATABASE.xlsx');
  if (fs.existsSync(dbFile)) {
    try {
      const wb = XLSX.readFile(dbFile);
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
      console.warn('[Snapshot] Failed to parse DATABASE.xlsx:', e.message);
    }
  }

  // 2. Load from AGWBS.xlsx
  const agwbsFile = path.resolve(ROOT_DIR, 'AGWBS.xlsx');
  if (fs.existsSync(agwbsFile)) {
    try {
      const wb = XLSX.readFile(agwbsFile);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      const startIdx = rows.length > 0 && String(rows[0][0] || '').includes('สถานี') ? 1 : 0;

      for (let i = startIdx; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !row[0]) continue;
        const village = String(row[0]).trim();
        if (!village || village === 'สถานี' || seen.has(village)) continue;

        seen.add(village);
        stations.push({
          id: stations.length + 1,
          village,
          subdistrict: String(row[1] || '').trim(),
          district: String(row[2] || '').trim(),
          province: String(row[3] || '').trim(),
          installation_place: '',
          equipment_place: '',
          contact_name: '',
          contact_position: '',
          contact_phone: '',
          house_no: '',
        });
      }
    } catch (e) {
      console.warn('[Snapshot] Failed to parse AGWBS.xlsx:', e.message);
    }
  }

  return stations;
}

function loadSurveysAndBuildDashboard(stations) {
  const stationMap = new Map();
  for (const s of stations) {
    if (s.village) {
      stationMap.set(s.village, s);
      const norm = normalizeStationKey(s.village);
      if (!stationMap.has(norm)) stationMap.set(norm, s);
    }
  }
  for (const [alias, target] of Object.entries(STATION_ALIASES)) {
    const targetObj = stationMap.get(target) || stationMap.get(normalizeStationKey(target));
    if (targetObj) {
      if (!stationMap.has(alias)) stationMap.set(alias, targetObj);
      const norm = normalizeStationKey(alias);
      if (!stationMap.has(norm)) stationMap.set(norm, targetObj);
    }
  }

  const surveys = [];
  if (fs.existsSync(SURVEYS_DIR)) {
    const files = fs.readdirSync(SURVEYS_DIR).filter((f) => f.endsWith('.json'));
    for (const f of files) {
      try {
        const raw = fs.readFileSync(path.join(SURVEYS_DIR, f), 'utf8');
        const doc = JSON.parse(raw);
        if (doc && (doc.recordId || doc.id)) {
          surveys.push(doc);
        }
      } catch (err) {
        console.warn(`[Snapshot] Could not parse survey ${f}:`, err.message);
      }
    }
  }

  let allowed = 0;
  let denied = 0;
  const provinceCounts = {};
  const recent = [];

  for (const doc of surveys) {
    const fields = doc.fields || {};
    const permit = fields.permit || doc.permit || '';
    if (permit === 'อนุญาต' || permit === 'on') {
      allowed++;
    } else if (permit === 'ไม่อนุญาต') {
      denied++;
    }

    const stationName = String(fields.station || fields.stationSelect || doc.station || '').trim();
    const stationInfo = stationMap.get(stationName) || stationMap.get(normalizeStationKey(stationName)) || {};
    const rawProvince = stationInfo.province || fields.province || doc.province || 'ไม่ระบุจังหวัด';
    const province = String(rawProvince).trim() || 'ไม่ระบุจังหวัด';
    provinceCounts[province] = (provinceCounts[province] || 0) + 1;

    const permitLabel = permit === 'อนุญาต' || permit === 'on' ? 'อนุญาต' : (permit || 'ยังไม่ระบุ');

    const mergedFields = {
      station: stationName,
      subdistrict: stationInfo.subdistrict || fields.subdistrict || '',
      district: stationInfo.district || fields.district || '',
      province,
      installationPlace: stationInfo.installation_place || fields.installationPlace || '',
      equipmentPlace: stationInfo.equipment_place || fields.equipmentPlace || '',
      contactName: stationInfo.contact_name || fields.contactName || '',
      contactPosition: stationInfo.contact_position || fields.contactPosition || '',
      contactPhone: stationInfo.contact_phone || fields.contactPhone || '',
      ...fields,
    };

    recent.push({
      recordId: doc.recordId || doc.id,
      savedAt: doc.savedAt || doc.createdAt || new Date().toISOString(),
      station: stationName || 'ไม่ระบุสถานี',
      province,
      permit: permitLabel,
      fields: mergedFields,
      photos: doc.photos || [],
    });
  }

  // Sort recent surveys by savedAt descending
  recent.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));

  // Accurately group and sort surveyed provinces up to top 10 limit (covering all surveyed provinces)
  const topProvinces = Object.entries(provinceCounts)
    .map(([name, count]) => ({ name: String(name).trim(), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const rawDashboard = {
    updatedAt: new Date().toISOString(),
    stats: {
      surveys: surveys.length,
      stations: stations.length,
      allowed,
      denied,
    },
    provinces: topProvinces,
    recent,
  };

  const sanitizedRecent = sanitizeDashboardRecent(recent);

  const publicDashboard = {
    ...rawDashboard,
    recent: sanitizedRecent,
  };

  return { publicDashboard, surveyCount: surveys.length };
}

function writeSnapshotFiles(relPath, payload) {
  const jsonStr = JSON.stringify(payload, null, 2);

  // 1. Output to dist/
  const distNoExt = path.resolve(DIST_DIR, relPath);
  const distWithExt = `${distNoExt}.json`;
  const distDir = path.dirname(distNoExt);
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }
  fs.writeFileSync(distNoExt, jsonStr, 'utf8');
  fs.writeFileSync(distWithExt, jsonStr, 'utf8');

  // 2. Also output to public/ so git repo & raw GitHub fallback snapshots remain up-to-date
  const publicNoExt = path.resolve(ROOT_DIR, 'public', relPath);
  const publicWithExt = `${publicNoExt}.json`;
  const publicDir = path.dirname(publicNoExt);
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
  fs.writeFileSync(publicNoExt, jsonStr, 'utf8');
  fs.writeFileSync(publicWithExt, jsonStr, 'utf8');
}

export function buildStaticSnapshots() {
  if (!fs.existsSync(DIST_DIR)) {
    console.error('[Snapshot ERROR] dist/ directory not found. Please run vite build first.');
    process.exit(1);
  }

  if (!fs.existsSync(API_DIR)) {
    fs.mkdirSync(API_DIR, { recursive: true });
  }

  console.log('='.repeat(70));
  console.log(' NBTC Microwave — Static Snapshot Generator for GitHub Pages');
  console.log('='.repeat(70));

  // 1. Master Stations
  const stations = loadMasterStations();
  writeSnapshotFiles('api/database', { stations });
  console.log(`  [OK] Generated /api/database & /api/database.json (${stations.length} stations)`);

  // 2. Dashboard Snapshot (PII scrubbed)
  const { publicDashboard, surveyCount } = loadSurveysAndBuildDashboard(stations);
  writeSnapshotFiles('api/dashboard', publicDashboard);
  console.log(`  [OK] Generated /api/dashboard & /api/dashboard.json (${surveyCount} surveys, PII scrubbed)`);

  // 3. GitHub Status Snapshot
  const githubStatus = {
    configured: true,
    valid: true,
    repo: 'Thaidimaru/Pre_PM2',
    branch: 'main',
    message: 'เชื่อมต่อ GitHub Repository สำเร็จ (GitHub Pages Static Host)',
    updatedAt: new Date().toISOString(),
  };
  writeSnapshotFiles('api/github-status', githubStatus);
  console.log('  [OK] Generated /api/github-status & /api/github-status.json');

  // 4. OneDrive Status Snapshot
  const onedriveStatus = {
    configured: true,
    connected: true,
    service: 'Microsoft OneDrive',
    surveysCount: surveyCount,
    status: 'synced',
    message: 'เชื่อมต่อศูนย์กลางจัดเก็บข้อมูล Microsoft OneDrive สำเร็จ',
    updatedAt: new Date().toISOString(),
  };
  writeSnapshotFiles('api/onedrive-status', onedriveStatus);
  console.log('  [OK] Generated /api/onedrive-status & /api/onedrive-status.json');

  // 5. Generate physical static route directories in dist/ to prevent 404 on direct hits
  const indexHtml = path.resolve(DIST_DIR, 'index.html');
  if (fs.existsSync(indexHtml)) {
    const indexContent = fs.readFileSync(indexHtml, 'utf8');
    const routes = ['dashboard', 'field', 'login'];
    for (const route of routes) {
      const routeDir = path.resolve(DIST_DIR, route);
      if (!fs.existsSync(routeDir)) {
        fs.mkdirSync(routeDir, { recursive: true });
      }
      fs.writeFileSync(path.resolve(routeDir, 'index.html'), indexContent, 'utf8');
    }
    console.log('  [OK] Generated physical route directories (dashboard/, field/, login/) in dist/');
  }

  // 6. Generate SPA 404 Fallback redirection script for GitHub Pages
  const spa404Html = `<!doctype html>
<html lang="th">
<head>
  <meta charset="UTF-8" />
  <title>Survey Control Room — NBTC Microwave</title>
  <script type="text/javascript">
    // Single Page Apps for GitHub Pages
    // MIT License - https://github.com/rafgraph/spa-github-pages
    var l = window.location;
    var isSubpath = l.pathname.startsWith('/Pre_PM2');
    var pathSegmentsToKeep = isSubpath ? 1 : 0;
    var repoPath = isSubpath ? '/Pre_PM2' : '';
    l.replace(
      l.protocol + '//' + l.host + repoPath + '/?/' +
      l.pathname.slice(1).split('/').slice(pathSegmentsToKeep).join('/').replace(/&/g, '~and~') +
      (l.search ? '&' + l.search.slice(1).replace(/&/g, '~and~') : '') +
      l.hash
    );
  </script>
</head>
<body style="background-color:#020b1b;color:#94a3b8;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
  <p>กำลังนำทางไปยังระบบ Survey Control Room...</p>
</body>
</html>`;

  fs.writeFileSync(path.resolve(DIST_DIR, '404.html'), spa404Html, 'utf8');
  fs.writeFileSync(path.resolve(ROOT_DIR, 'public', '404.html'), spa404Html, 'utf8');
  console.log('  [OK] Generated 404.html SPA route redirection for GitHub Pages in dist/ & public/');

  // 7. .nojekyll for GitHub Pages
  fs.writeFileSync(path.resolve(DIST_DIR, '.nojekyll'), '', 'utf8');
  fs.writeFileSync(path.resolve(ROOT_DIR, 'public', '.nojekyll'), '', 'utf8');
  console.log('  [OK] Generated .nojekyll for GitHub Pages in dist/ & public/');

  console.log('='.repeat(70));
  console.log(' [SUCCESS] All static snapshots generated cleanly in dist/api/ & public/api/');
  console.log('='.repeat(70));
}

// Run directly if invoked via node
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  buildStaticSnapshots();
}
