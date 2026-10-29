import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('--- Test Suite: Survey Proportions Drill-Down Feature ---');

// 1. Verify files exist
const surveyDonutPath = path.join(rootDir, 'src', 'components', 'dashboard', 'SurveyDonut.jsx');
const drillDownModalPath = path.join(rootDir, 'src', 'components', 'dashboard', 'SurveyDrillDownModal.jsx');
const dashboardViewPath = path.join(rootDir, 'src', 'components', 'dashboard', 'DashboardView.jsx');
const dbJsonPath = path.join(rootDir, 'public', 'api', 'database.json');
const dashJsonPath = path.join(rootDir, 'public', 'api', 'dashboard.json');

assert.ok(fs.existsSync(surveyDonutPath), 'SurveyDonut.jsx must exist');
assert.ok(fs.existsSync(drillDownModalPath), 'SurveyDrillDownModal.jsx must exist');
assert.ok(fs.existsSync(dashboardViewPath), 'DashboardView.jsx must exist');
assert.ok(fs.existsSync(dbJsonPath), 'database.json must exist');
assert.ok(fs.existsSync(dashJsonPath), 'dashboard.json must exist');
console.log('✓ All relevant component and data files exist');

// 2. Verify SurveyDonut contains interactive clickable cards
const donutCode = fs.readFileSync(surveyDonutPath, 'utf-8');
assert.ok(donutCode.includes('SurveyDrillDownModal'), 'SurveyDonut must import SurveyDrillDownModal');
assert.ok(donutCode.includes('handleOpenDrillDown'), 'SurveyDonut must have handleOpenDrillDown handler');
assert.ok(donutCode.includes("handleOpenDrillDown('allowed')"), 'SurveyDonut must handle allowed card click');
assert.ok(donutCode.includes("handleOpenDrillDown('denied')"), 'SurveyDonut must handle denied card click');
assert.ok(donutCode.includes("handleOpenDrillDown('unvisited')"), 'SurveyDonut must handle unvisited card click');
assert.ok(donutCode.includes("handleOpenDrillDown('total')"), 'SurveyDonut must handle total card click');
assert.ok(donutCode.includes('cursor-pointer'), 'SurveyDonut cards must have pointer cursor');
assert.ok(donutCode.includes('hover:scale-'), 'SurveyDonut cards must have hover scale effect');
assert.ok(donutCode.includes('role="button"'), 'SurveyDonut cards must have role="button" for accessibility');
assert.ok(donutCode.includes('tabIndex={0}'), 'SurveyDonut cards must have tabIndex={0} for keyboard accessibility');
console.log('✓ SurveyDonut interactive clickable cards implementation verified');

// 3. Verify SurveyDrillDownModal features
const modalCode = fs.readFileSync(drillDownModalPath, 'utf-8');
assert.ok(modalCode.includes('DialogPrimitive'), 'SurveyDrillDownModal must use DialogPrimitive');
assert.ok(modalCode.includes('CATEGORY_CONFIG'), 'SurveyDrillDownModal must have category configurations');
assert.ok(modalCode.includes('searchQuery'), 'SurveyDrillDownModal must have search state');
assert.ok(modalCode.includes('selectedProvince'), 'SurveyDrillDownModal must have province filter');
assert.ok(modalCode.includes('SurveyPreviewModal'), 'SurveyDrillDownModal must integrate with SurveyPreviewModal');
assert.ok(modalCode.includes('pageSize'), 'SurveyDrillDownModal must have pagination');
assert.ok(modalCode.includes('onNavigate'), 'SurveyDrillDownModal must support onNavigate for field visits');
console.log('✓ SurveyDrillDownModal structure and feature requirements verified');

// 4. Verify DashboardView passes props to SurveyDonut
const dashViewCode = fs.readFileSync(dashboardViewPath, 'utf-8');
assert.ok(dashViewCode.includes('surveys={data.recent}'), 'DashboardView must pass surveys to SurveyDonut');
assert.ok(dashViewCode.includes('onNavigate={onNavigate}'), 'DashboardView must pass onNavigate to SurveyDonut');
assert.ok(dashViewCode.includes('onEditSurvey={onEditSurvey}'), 'DashboardView must pass onEditSurvey to SurveyDonut');
console.log('✓ DashboardView props wiring verified');

// 5. Test Station Data Merging & Matching Logic
const db = JSON.parse(fs.readFileSync(dbJsonPath, 'utf-8'));
const dash = JSON.parse(fs.readFileSync(dashJsonPath, 'utf-8'));

assert.equal(db.stations.length, 197, 'Master stations count must be 197');
assert.equal(dash.recent.length, 197, 'Dashboard surveys count must be 197');

const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';
function norm(str) {
  return String(str || '').trim().replace(/[๑๒๓๔๕๖๗๘๙๐]/g, (d) => THAI_DIGITS.indexOf(d)).replace(/\s+/g, ' ');
}

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
  'BS ปางใหม่พัฒนา': 'BS บ้านปางใหม่พัฒนา',
};

const surveyMap = new Map();
dash.recent.forEach((s) => {
  const name = s.station || s.fields?.station || '';
  if (name) {
    surveyMap.set(name, s);
    surveyMap.set(norm(name), s);
  }
});

let matchedCount = 0;
db.stations.forEach((st) => {
  const v = st.village;
  const alias = STATION_ALIASES[v] || v;
  if (surveyMap.has(v) || surveyMap.has(norm(v)) || surveyMap.has(alias) || surveyMap.has(norm(alias))) {
    matchedCount++;
  }
});

assert.equal(matchedCount, 197, 'All 197 stations must match survey records');
console.log(`✓ 100% Station Matching Verified: ${matchedCount} / ${db.stations.length} matched`);

console.log('--- ALL SURVEY PROPORTIONS DRILL-DOWN TESTS PASSED ---');
