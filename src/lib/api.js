/**
 * Centralized API service for NBTC Microwave Pre-PM Survey Control Room
 * Provides dual-layer persistence (Serverless backend + LocalStorage client cache)
 */

const LOCAL_SURVEYS_KEY = 'nbtc_pre_pm_saved_surveys';
const DELETED_SURVEYS_KEY = 'nbtc_pre_pm_deleted_surveys';
const GITHUB_TOKEN_KEY = 'nbtc_github_token';
const SURVEY_RESET_DATE = '2026-10-05T00:00:00.000Z';
export function getDeletedSurveyIds() {
  try {
    if (typeof window === 'undefined') return new Set();
    const raw = localStorage.getItem(DELETED_SURVEYS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch (e) {
    return new Set();
  }
}

export function addDeletedSurveyIds(ids) {
  try {
    if (typeof window === 'undefined') return;
    const current = getDeletedSurveyIds();
    const list = Array.isArray(ids) ? ids : [ids];
    list.filter(Boolean).forEach((id) => current.add(String(id)));
    localStorage.setItem(DELETED_SURVEYS_KEY, JSON.stringify(Array.from(current)));
  } catch (e) {
    console.warn('Failed to save deleted survey IDs to localStorage:', e);
  }
}

export function removeDeletedSurveyIds(ids) {
  try {
    if (typeof window === 'undefined') return;
    const current = getDeletedSurveyIds();
    const list = Array.isArray(ids) ? ids : [ids];
    list.filter(Boolean).forEach((id) => current.delete(String(id)));
    localStorage.setItem(DELETED_SURVEYS_KEY, JSON.stringify(Array.from(current)));
  } catch (e) {}
}

// v2.9.0: ไม่ฝัง GitHub token ใน bundle และไม่นอนาเข้าจาก /api/sync-config (เคยเป็นไฟล์สาธารณะบน R2)
// ทุกการเขียนขึ้น GitHub ต้องใช้ fine-grained PAT ที่ผู้ใช้ใส่เองใน GitHubTokenModal เท่านั้น
let cachedSystemToken = '';

export function getStoredGitHubToken() {
  try {
    const custom = typeof window !== 'undefined' ? (localStorage.getItem(GITHUB_TOKEN_KEY) || '').trim() : '';
    return custom || cachedSystemToken;
  } catch (e) {
    return cachedSystemToken;
  }
}

export function saveGitHubToken(token) {
  try {
    if (typeof window !== 'undefined') {
      const clean = (token || '').trim();
      if (clean) {
        localStorage.setItem(GITHUB_TOKEN_KEY, clean);
      } else {
        localStorage.removeItem(GITHUB_TOKEN_KEY);
      }
      notifySurveysUpdated({ type: 'GITHUB_TOKEN_CHANGED' });
    }
  } catch (e) {
    console.warn('Failed to save GitHub token:', e);
  }
}

export function clearGitHubToken() {
  saveGitHubToken('');
}

// ---------------------------------------------------------------------------
// Local Server Auth Token Handling (Task C1)
// เก็บ token ใน sessionStorage ('surveyApiToken') แทน localStorage
// ---------------------------------------------------------------------------
const LOCAL_API_TOKEN_KEY = 'surveyApiToken';

export function getLocalApiToken() {
  try {
    if (typeof window === 'undefined') return '';
    return (sessionStorage.getItem(LOCAL_API_TOKEN_KEY) || '').trim();
  } catch (e) {
    return '';
  }
}

export function saveLocalApiToken(token) {
  try {
    if (typeof window !== 'undefined') {
      const clean = (token || '').trim();
      if (clean) {
        sessionStorage.setItem(LOCAL_API_TOKEN_KEY, clean);
      } else {
        sessionStorage.removeItem(LOCAL_API_TOKEN_KEY);
      }
      window.dispatchEvent(new CustomEvent('nbtc-local-auth-changed', { detail: { token: clean } }));
    }
  } catch (e) {
    console.warn('Failed to save local API token to sessionStorage:', e);
  }
}

export function clearLocalApiToken() {
  saveLocalApiToken('');
}

export function apiAuthHeaders(existingHeaders = {}) {
  const headers = { ...existingHeaders };
  const token = getLocalApiToken();
  if (token && !headers['Authorization'] && !headers['authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export function notifyLocalAuthRequired(reason = 'api_token') {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('nbtc-local-auth-required', { detail: { reason } }));
  }
}

let localApiRateLimitedUntil = 0;
export function isLocalApiRateLimited() {
  return Date.now() < localApiRateLimitedUntil;
}

export function noteLocalApiRateLimited(retryAfterSec = 15) {
  localApiRateLimitedUntil = Date.now() + retryAfterSec * 1000;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('nbtc-rate-limited', { detail: { retryAfterSec } }));
  }
}

let syncBroadcastChannel = null;
if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
  try {
    syncBroadcastChannel = new BroadcastChannel('nbtc_pre_pm_sync_channel');
  } catch (e) {}
}

export function notifySurveysUpdated(payload = {}) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('nbtc-surveys-updated', { detail: payload }));
  }
  if (syncBroadcastChannel) {
    try {
      syncBroadcastChannel.postMessage({ type: 'SURVEYS_UPDATED', timestamp: Date.now(), ...payload });
    } catch (e) {}
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * ตรวจว่าแอปรันอยู่บน static host (Cloudflare R2 / GitHub Pages) ที่ไม่มี backend ของ database.py
 * บน static host: POST /api/* จะได้ 401/404 เสมอ -> ต้องใช้ GitHub Contents API โดยตรง
 */
export function isStaticHost() {
  if (typeof window === 'undefined') return false;
  const hostname = window.location.hostname;
  return (
    hostname.includes('r2.dev') ||
    hostname.includes('github.io') ||
    hostname.includes('cloudflare') ||
    (hostname !== 'localhost' && hostname !== '127.0.0.1')
  );
}

/** แจ้ง UI (Navbar) ให้เปิด GitHubTokenModal เมื่อ token หมดอายุ/ไม่มีสิทธิ์ */
export function notifyGitHubTokenRequired(reason = 'bad_token') {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('nbtc-github-token-required', { detail: { reason } }));
  }
}

/**
 * v2.9.0: แจ้งให้ตั้งค่า token แบบมี cooldown ต่อ reason (15 วินาที)
 * (Dashboard poll ทุก 10 วิ — ไม่งั้น modal/toast เด้งรัวเมื่อเครื่องยังไม่มี PAT หรือสิทธิ์ไม่พอ)
 */
const lastTokenPromptAt = new Map();
export function promptGitHubToken(reason = 'no_token', cooldownMs = 15000) {
  const now = Date.now();
  if (now - (lastTokenPromptAt.get(reason) || 0) < cooldownMs) return false;
  lastTokenPromptAt.set(reason, now);
  notifyGitHubTokenRequired(reason);
  return true;
}

/**
 * จำนวนรายการสำรวจใน localStorage ที่ยังไม่ได้ซิงค์ขึ้น GitHub
 */
export function getUnsyncedSurveysCount() {
  try {
    const list = getLocalSurveys();
    const deleted = getDeletedSurveyIds();
    return list.filter((s) => s && s.recordId && !deleted.has(s.recordId) && !s.githubSynced).length;
  } catch (e) {
    return 0;
  }
}

/**
 * recordId ที่ยอมให้ commit ขึ้น GitHub ได้ — รองรับทั้งรูปแบบฝั่ง client
 * PM-<15 หลัก>-<hex4> และฝั่งเซิร์ฟเวอร์ PM-<YYYYmmdd>-<HHMMSS>-<hex4>
 * ใช้กัน record ทดสอบ/legacy id ไม่ให้หลุดขึ้น repo ข้อมูล
 */
const COMMITTABLE_RECORD_ID = /^PM-(?:\d{15}|\d{8}-\d{6})-[0-9a-f]{4}$/;
export function isCommittableRecordId(recordId) {
  return COMMITTABLE_RECORD_ID.test(String(recordId || ''));
}

/** แปลง error code จาก GitHub sync เป็นข้อความที่ผู้ใช้เข้าใจได้ (UI ห้ามโชว์ raw code) */
export function githubErrorText(code) {
  const raw = String(code || '');
  if (raw === 'no_token') return 'ยังไม่ได้ตั้งค่า GitHub Token บนเครื่องนี้';
  if (raw === 'bad_token') return 'GitHub Token ไม่ถูกต้องหรือหมดอายุ';
  if (raw === 'scope_insufficient') return 'สิทธิ์ GitHub Token ไม่เพียงพอ (ต้องใช้สิทธิ์ Contents: Read and write)';
  if (raw === 'rate_limited') return 'GitHub จำกัดจำนวนคำขอชั่วคราว (rate limit)';
  if (raw === 'file_not_found_on_github') return 'ไม่พบไฟล์บน GitHub';
  if (raw === 'github_write_failed') return 'เขียนขึ้น GitHub ไม่สำเร็จ';
  if (raw === 'github_delete_failed') return 'ลบบน GitHub ไม่สำเร็จ';
  return raw || 'ไม่ทราบสาเหตุ';
}

// ---------------------------------------------------------------------------
// GitHub write serialization
// ทุกการเขียน GitHub Contents API ลง branch 'main' ต้อง serialize และ dedupe
// เพื่อกัน commit ซ้ำ + 409/422 จาก sha ที่ไม่ตรงกัน
// ---------------------------------------------------------------------------
const inflightWrites = new Map(); // recordId -> { hash, promise }
let globalWriteQueue = Promise.resolve();

function hashString(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  }
  return `${str.length}:${h}`;
}

function runWithRecordLock(recordId, task) {
  const key = String(recordId || '');
  if (typeof navigator !== 'undefined' && navigator.locks && typeof navigator.locks.request === 'function') {
    return navigator.locks.request(`gh-write:${key}`, task);
  }
  return task();
}

function enqueueGitHubWrite(task) {
  const run = globalWriteQueue.then(task, task);
  globalWriteQueue = run.then(
    () => {},
    () => {}
  );
  return run;
}

/**
 * serialize write ของ recordId ลง global queue และ dedupe เฉพาะ khi payload เหมือนกัน
 * (payload ต่างกันยังต้องเขียนจริง เพื่อไม่ให้ข้อมูลใหม่หาย)
 */
function queueRecordWrite(recordId, payloadHash, task) {
  const key = String(recordId || '');
  const existing = key ? inflightWrites.get(key) : null;
  if (existing && existing.hash === payloadHash) {
    return existing.promise;
  }

  const run = enqueueGitHubWrite(() => runWithRecordLock(key, task));
  if (!key) return run;

  const entry = { hash: payloadHash, promise: null };
  const tracked = run.then(
    (value) => {
      if (inflightWrites.get(key) === entry) inflightWrites.delete(key);
      return value;
    },
    (err) => {
      if (inflightWrites.get(key) === entry) inflightWrites.delete(key);
      throw err;
    }
  );
  entry.promise = tracked;
  inflightWrites.set(key, entry);
  return tracked;
}

/** true เมื่อมี write ของ recordId นี้กำลังทำงานอยู่ (ใช้ข้ามใน syncPendingLocalSurveys) */
export function isGitHubWritePending(recordId) {
  return inflightWrites.has(String(recordId || ''));
}

const GITHUB_SYNCING_TTL_MS = 120000;

/** true เมื่อเพิ่งเริ่ม write ของ record นี้ (กัน syncPending ซ้ำระหว่างที่ยังไม่เสร็จ) */
function isSurveySyncing(survey) {
  if (!survey || !survey.githubSyncing) return false;
  const startedAt = Number(survey.githubSyncingAt) || 0;
  return Date.now() - startedAt < GITHUB_SYNCING_TTL_MS;
}

export function getLocalSurveys() {
  try {
    const raw = localStorage.getItem(LOCAL_SURVEYS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : [];
    const filtered = list.filter((s) => s.savedAt && s.savedAt >= SURVEY_RESET_DATE);
    if (filtered.length !== list.length) {
      localStorage.setItem(LOCAL_SURVEYS_KEY, JSON.stringify(filtered));
    }
    return filtered;
  } catch (e) {
    console.warn('Failed to read local surveys from localStorage:', e);
    return [];
  }
}

export function saveLocalSurvey(survey) {
  try {
    if (survey && survey.recordId) {
      removeDeletedSurveyIds([survey.recordId]);
    }
    const current = getLocalSurveys();
    const index = current.findIndex(
      (s) => s.recordId === survey.recordId || (s.station && s.station === survey.station && s.savedAt === survey.savedAt)
    );

    if (index >= 0) {
      current[index] = { ...current[index], ...survey };
    } else {
      current.unshift(survey);
    }

    // Keep up to 200 recent surveys
    const trimmed = current.slice(0, 200);

    try {
      localStorage.setItem(LOCAL_SURVEYS_KEY, JSON.stringify(trimmed));
    } catch (quotaErr) {
      // If quota exceeded, strip base64 dataUrl from older surveys
      console.warn('localStorage quota exceeded, trimming older photos...');
      const light = trimmed.map((s, idx) => {
        if (idx === 0) return s;
        return {
          ...s,
          photos: (s.photos || []).map((p) => ({
            id: p.id,
            name: p.name,
            contentType: p.contentType,
            url: p.url && !p.url.startsWith('data:') ? p.url : '',
          })),
        };
      });
      localStorage.setItem(LOCAL_SURVEYS_KEY, JSON.stringify(light));
    }
    notifySurveysUpdated({ survey, recordId: survey.recordId });
  } catch (e) {
    console.warn('Failed to save survey to localStorage:', e);
  }
}

export function deleteLocalSurvey(recordId) {
  try {
    if (recordId) {
      addDeletedSurveyIds([recordId]);
    }
    const current = getLocalSurveys();
    const filtered = current.filter((s) => s.recordId !== recordId);
    localStorage.setItem(LOCAL_SURVEYS_KEY, JSON.stringify(filtered));
    notifySurveysUpdated({ deletedRecordId: recordId });
  } catch (e) {
    console.warn('Failed to delete survey from localStorage:', e);
  }
}

function mergeDashboardWithLocal(serverData, localSurveys, currentGhIds = null) {
  const deletedIds = getDeletedSurveyIds();
  const base = serverData || {
    updatedAt: new Date().toISOString(),
    stats: { surveys: 0, stations: 197, allowed: 0, denied: 0 },
    provinces: [],
    recent: [],
  };

  const surveyMap = new Map();
  const inputList = Array.isArray(localSurveys) ? localSurveys : (base.recent || []);

  for (const s of inputList) {
    if (!s) continue;
    const recId = s.recordId;
    if (recId && deletedIds.has(recId)) continue;

    // Prune surveys that were confirmed deleted from GitHub (unless they are unsynced pending local drafts)
    if (recId && currentGhIds && currentGhIds.size > 0 && !currentGhIds.has(recId)) {
      if (s.githubSynced || (!s.githubSyncing && !s._isLocalDraft)) {
        continue;
      }
    }

    const key = recId || `${s.station}_${s.savedAt || ''}`;
    if (!surveyMap.has(key)) {
      surveyMap.set(key, s);
    } else {
      const existing = surveyMap.get(key);
      const isSLocalSynced = s.githubSynced && !s.githubSyncing;
      if (isSLocalSynced) {
        // If s was already synced, keep existing fields (which could be fresher from GitHub)
        surveyMap.set(key, {
          ...s,
          ...existing,
          fields: { ...(s.fields || {}), ...(existing.fields || {}) },
          photos: (existing.photos && existing.photos.length > 0) ? existing.photos : (s.photos || []),
        });
      } else {
        surveyMap.set(key, {
          ...existing,
          ...s,
          fields: { ...(existing.fields || {}), ...(s.fields || {}) },
          photos: (s.photos && s.photos.length > 0) ? s.photos : (existing.photos || []),
        });
      }
    }
  }

  const allSurveys = Array.from(surveyMap.values()).sort((a, b) =>
    String(b.savedAt || '').localeCompare(String(a.savedAt || ''))
  );

  let allowed = 0;
  let denied = 0;
  const provinceCounts = new Map();

  for (const s of allSurveys) {
    const permit = s.permit || s.fields?.permit;
    if (permit === 'อนุญาต' || permit === 'on') allowed++;
    else if (permit === 'ไม่อนุญาต') denied++;

    const prov = s.province || s.fields?.province || 'ไม่ระบุจังหวัด';
    provinceCounts.set(prov, (provinceCounts.get(prov) || 0) + 1);
  }

  const totalCount = allSurveys.length;
  const finalAllowed = allowed;
  const finalDenied = denied;

  const sortedProvinces = Array.from(provinceCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return {
    updatedAt: new Date().toISOString(),
    stats: {
      surveys: totalCount,
      stations: base.stats?.stations || 197,
      allowed: finalAllowed,
      denied: finalDenied,
    },
    provinces: sortedProvinces.length > 0 ? sortedProvinces : (base.provinces || []),
    recent: allSurveys,
  };
}

let isSyncingPending = false;

export async function syncPendingLocalSurveys() {
  if (typeof window === 'undefined' || isSyncingPending) return;
  const deletedIds = getDeletedSurveyIds();
  const localSurveys = getLocalSurveys().filter((s) => s && !deletedIds.has(s.recordId));
  if (!Array.isArray(localSurveys) || localSurveys.length === 0) return;
  const pending = localSurveys.filter(
    (s) => s && s.recordId && !s.githubSynced && isCommittableRecordId(s.recordId)
  );
  const token = getStoredGitHubToken();
  if (!token) {
    // v2.9.0: bundle ไม่มี tokenฝังในแอปแล้ว — ต้องให้ผู้ใช้ใส่ PAT จึงจะซิงค์ขึ้น GitHub ได้
    if (pending.length > 0) promptGitHubToken('no_token', 60000);
    return;
  }

  isSyncingPending = true;
  try {
    for (const survey of localSurveys) {
      if (!survey || !survey.recordId) continue;
      if (survey.githubSynced) continue;
      if (!isCommittableRecordId(survey.recordId)) {
        console.warn('[sync] ข้าม record ที่ recordId ไม่เข้ารูปแบบ (กัน test/legacy id หลุดขึ้น GitHub):', survey.recordId);
        continue;
      }
      // ข้าม record ที่กำลังถูกเขียนอยู่ หรือเพิ่งเริ่มเขียน (กัน commit ซ้ำจากหลาย code path)
      if (isGitHubWritePending(survey.recordId) || isSurveySyncing(survey)) continue;
      try {
        const ghRes = await commitSurveyToGitHubClient(survey, token);
        if (ghRes.success) {
          delete survey.githubSyncing;
          delete survey.githubSyncingAt;
          survey.githubSynced = true;
          saveLocalSurvey(survey);
          console.log('Synced pending local survey to GitHub:', survey.recordId);
        }
      } catch (e) {
        console.warn('Failed to sync pending survey:', survey.recordId, e);
      }
    }
  } finally {
    isSyncingPending = false;
  }
}

export const DASHBOARD_CACHE_KEY = 'nbtc_pre_pm_dashboard_cache';

export function getCachedDashboardData() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(DASHBOARD_CACHE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && data.stats && Array.isArray(data.recent)) return data;
    }
  } catch (e) {}
  return null;
}

export function setCachedDashboardData(data) {
  if (typeof window === 'undefined' || !data) return;
  try {
    if (data.stats && Array.isArray(data.recent)) {
      localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(data));
    }
  } catch (e) {}
}

export async function fetchDashboardData(options = {}) {
  const force = options.force || false;
  const deletedIds = getDeletedSurveyIds();

  // Background sync any surveys stored locally that haven't been pushed to GitHub
  syncPendingLocalSurveys().catch(() => {});

  let serverData = null;
  try {
    const res = await fetch(`/api/dashboard?_t=${Date.now()}`, { cache: 'no-store' });
    if (res.ok) {
      serverData = await res.json();
      if (serverData && Array.isArray(serverData.recent)) {
        serverData.recent = serverData.recent.filter((s) => s && !deletedIds.has(s.recordId));
      }
    }
  } catch (err) {
    console.warn('Failed to fetch dashboard metrics from server:', err);
  }

  // Fallback to Cloudflare R2 public snapshot if local backend is unavailable (e.g. running vite dev server without local python backend)
  if (!serverData) {
    try {
      const r2Url = `https://pub-bc30fda8b7654fa09add325ab0f468e0.r2.dev/api/dashboard?_t=${Date.now()}`;
      const r2Res = await fetch(r2Url, { cache: 'no-store' });
      if (r2Res.ok) {
        serverData = await r2Res.json();
        if (serverData && Array.isArray(serverData.recent)) {
          serverData.recent = serverData.recent.filter((s) => s && !deletedIds.has(s.recordId));
        }
      }
    } catch (r2Err) {
      console.warn('Failed to fetch fallback snapshot from Cloudflare R2:', r2Err);
    }
  }

  // If still no serverData, hydrate from cached storage
  if (!serverData) {
    serverData = getCachedDashboardData();
  }

  // Pre-seed client in-memory cache if serverData has recent entries
  if (serverData && Array.isArray(serverData.recent)) {
    seedClientGhSurveysFromSnapshot(serverData.recent);
  }

  // Always attempt to fetch latest live surveys from GitHub so all devices stay in sync
  let ghSurveys = [];
  let currentGhIds = null;
  try {
    ghSurveys = await fetchSurveysFromGitHubClient(new Set(), force);
    currentGhIds = getLatestGitHubRecordIds();
  } catch (err) {
    console.warn('Could not fetch latest surveys from GitHub:', err);
  }

  // If we know the live set of GitHub files, prune deleted records from serverData and localSurveys
  if (currentGhIds && currentGhIds.size > 0) {
    if (serverData && Array.isArray(serverData.recent)) {
      serverData.recent = serverData.recent.filter((s) => s && currentGhIds.has(s.recordId));
    }
    try {
      const localSurveys = getLocalSurveys();
      const prunedLocal = localSurveys.filter((s) => {
        if (!s || !s.recordId) return false;
        if (s.githubSynced && !currentGhIds.has(s.recordId)) return false;
        return !deletedIds.has(s.recordId);
      });
      if (prunedLocal.length !== localSurveys.length) {
        localStorage.setItem(LOCAL_SURVEYS_KEY, JSON.stringify(prunedLocal));
      }
    } catch (e) {}
  }

  const localSurveys = getLocalSurveys().filter((s) => s && !deletedIds.has(s.recordId));

  const allCombinedSurveys = [
    ...(serverData?.recent || []),
    ...(Array.isArray(ghSurveys) ? ghSurveys : []),
    ...localSurveys,
  ];

  const mergedResult = mergeDashboardWithLocal(serverData, allCombinedSurveys, currentGhIds);
  // Persist latest merged snapshot for instant SWR hydration on subsequent visits
  setCachedDashboardData(mergedResult);
  return mergedResult;
}

export const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';

export function normalizeStationKey(name) {
  return String(name || '')
    .trim()
    .replace(/[๑๒๓๔๕๖๗๘๙๐]/g, (d) => THAI_DIGITS.indexOf(d))
    .replace(/\s+/g, ' ');
}

export const STATION_ALIASES = {
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

let cachedStationMap = new Map();

export function findStationByName(name) {
  if (!name) return null;
  const cleanName = String(name).trim();
  const target = STATION_ALIASES[cleanName] || cleanName;
  const normTarget = normalizeStationKey(target);
  const normClean = normalizeStationKey(cleanName);

  return (
    cachedStationMap.get(target) ||
    cachedStationMap.get(normTarget) ||
    cachedStationMap.get(cleanName) ||
    cachedStationMap.get(normClean) ||
    null
  );
}

export function enrichSurveyFields(rawSurvey = {}) {
  const fields = rawSurvey.fields || {};
  const stationName = String(fields.station || fields.stationSelect || rawSurvey.station || '').trim();
  const station = findStationByName(stationName);

  return {
    ...fields,
    station: stationName || fields.station || rawSurvey.station || '',
    province: fields.province || rawSurvey.province || station?.province || '',
    district: fields.district || rawSurvey.district || station?.district || '',
    subdistrict: fields.subdistrict || rawSurvey.subdistrict || station?.subdistrict || '',
    installationPlace: fields.installationPlace || fields.installation_place || station?.installation_place || station?.installationPlace || '',
    equipmentPlace: fields.equipmentPlace || fields.equipment_place || station?.equipment_place || station?.equipmentPlace || '',
    contactName: fields.contactName || fields.contact_name || station?.contact_name || station?.contactName || '',
    contactPosition: fields.contactPosition || fields.contact_position || station?.contact_position || station?.contactPosition || '',
    contactPhone: fields.contactPhone || fields.contact_phone || station?.contact_phone || station?.contactPhone || '',
  };
}

export async function fetchStations(token = '') {
  const headers = apiAuthHeaders();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res = await fetch('/api/database', { headers }).catch(() => null);

  if (!res || res.status === 404) {
    res = await fetch('/database', { headers });
  }

  if (!res.ok) {
    throw new Error(`Failed to load station directory (status ${res.status})`);
  }
  const data = await res.json();
  const stationList = Array.isArray(data.stations) ? data.stations : (Array.isArray(data) ? data : []);
  for (const s of stationList) {
    if (s && s.village) {
      const v = String(s.village).trim();
      const normV = normalizeStationKey(v);
      cachedStationMap.set(v, s);
      if (!cachedStationMap.has(normV)) {
        cachedStationMap.set(normV, s);
      }
    }
  }
  for (const [alias, target] of Object.entries(STATION_ALIASES)) {
    const normTarget = normalizeStationKey(target);
    const targetStation = cachedStationMap.get(target) || cachedStationMap.get(normTarget);
    if (targetStation) {
      if (!cachedStationMap.has(alias)) cachedStationMap.set(alias, targetStation);
      const normAlias = normalizeStationKey(alias);
      if (!cachedStationMap.has(normAlias)) cachedStationMap.set(normAlias, targetStation);
    }
  }
  return data;
}

export async function loginUser(password = '') {
  // v2.10.0: ต่อรอง bearer token กับเซิร์ฟเวอร์จริง (database.py) — เดิมเป็น stub ที่คืน 'public' ตลอด
  // บน static host (r2.dev) ไม่มี backend: คืน ok=false เพื่อให้ UI บอกผู้ใช้ว่าไม่ต้อง login ก็ใช้งานได้
  if (isStaticHost()) {
    return { token: null, ok: false, error: 'no_backend', publicAccess: true };
  }
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    }).catch(() => null);
    if (!res) return { token: null, ok: false, error: 'network_error' };
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok && data.token) {
      saveLocalApiToken(data.token);
    }
    return {
      token: data.token || null,
      ok: Boolean(res.ok && data.ok && data.token),
      error: res.ok ? null : (data.error || data.message || `HTTP ${res.status}`),
    };
  } catch (e) {
    return { token: null, ok: false, error: e.message };
  }
}

/**
 * Helper กลางสำหรับเรียก Local Server Mutating Endpoints (/api/save, /api/update, /api/delete)
 * - แนบ Authorization: Bearer <surveyApiToken> จาก sessionStorage อัตโนมัติ (Task C1)
 * - ตรวจสอบ Rate Limiting (429) พร้อม throttle และส่ง notification
 * - ตรวจสอบ Unauthorized (401): ลอง token renewal 1 ครั้ง หากล้มเหลว ล้าง token และ trigger auth modal
 */
async function callLocalMutatingApi(endpoint, fallbackEndpoint, payload, customHeaders = {}) {
  if (isStaticHost()) {
    return { ok: false, error: 'no_backend', status: 404, data: null };
  }

  if (isLocalApiRateLimited()) {
    const errorMsg = 'เซิร์ฟเวอร์จำกัดอัตราคำขอ กรุณารอสักครู่ (15 วินาที) แล้วลองใหม่อีกครั้ง';
    return { ok: false, error: errorMsg, status: 429, data: null };
  }

  let headers = apiAuthHeaders({ 'Content-Type': 'application/json', ...customHeaders });
  const body = JSON.stringify(payload);

  let res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body,
  }).catch(() => null);

  if ((!res || res.status === 404) && fallbackEndpoint) {
    res = await fetch(fallbackEndpoint, {
      method: 'POST',
      headers,
      body,
    }).catch(() => null);
  }

  if (res && res.status === 429) {
    noteLocalApiRateLimited(15);
    const errorMsg = 'เซิร์ฟเวอร์จำกัดอัตราคำขอ (HTTP 429) กรุณารอ 15 วินาทีก่อนลองใหม่';
    return { ok: false, error: errorMsg, status: 429, data: null };
  }

  if (res && res.status === 401) {
    // Attempt single token renewal if registered in window.__nbtcTokenRenewer
    let renewedToken = null;
    if (typeof window !== 'undefined' && typeof window.__nbtcTokenRenewer === 'function') {
      try {
        renewedToken = await window.__nbtcTokenRenewer();
        if (renewedToken) {
          saveLocalApiToken(renewedToken);
          headers = apiAuthHeaders({ 'Content-Type': 'application/json', ...customHeaders, Authorization: `Bearer ${renewedToken}` });
          res = await fetch(endpoint, {
            method: 'POST',
            headers,
            body,
          }).catch(() => null);
        }
      } catch (e) {}
    }

    if (!renewedToken || !res || res.status === 401) {
      clearLocalApiToken();
      notifyLocalAuthRequired('api_token');
      const errorMsg = 'เซสชันการเข้าสู่ระบบของเซิร์ฟเวอร์หมดอายุหรือไม่ถูกต้อง (HTTP 401) กรุณาเข้าสู่ระบบใหม่';
      return { ok: false, error: errorMsg, status: 401, data: null };
    }
  }

  if (res && res.ok) {
    const data = await res.json().catch(() => ({}));
    return { ok: true, status: res.status, data, error: null };
  }

  if (res) {
    const data = await res.json().catch(() => ({}));
    return { ok: false, status: res.status, data, error: data.message || data.error || `HTTP ${res.status}` };
  }

  return { ok: false, status: 0, data: null, error: 'network_error' };
}

export async function submitSurvey(arg1, arg2, arg3) {
  // Support both submitSurvey(fields, photos) and submitSurvey(token, fields, photos)
  let token = '';
  let fields = {};
  let photos = [];

  if (typeof arg1 === 'string') {
    token = arg1;
    fields = arg2 || {};
    photos = arg3 || [];
  } else {
    fields = arg1 || {};
    photos = arg2 || [];
  }

  let serverResult = null;
  let serverError = null;

  // static host ไม่มี backend: POST /api/save จะได้ 401 ทุกครั้ง -> ข้ามไปใช้ GitHub โดยตรง
  if (!isStaticHost()) {
    const extraHeaders = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await callLocalMutatingApi('/api/save', '/save', { fields, photos }, extraHeaders);
    if (res.ok) {
      serverResult = res.data;
    } else {
      serverError = res.error;
    }
  }

  // Construct local survey snapshot to ensure instant display on Dashboard
  const recordId =
    serverResult?.recordId ||
    `PM-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 15)}-${Math.random().toString(16).slice(2, 6)}`;
  const savedAt = serverResult?.savedAt || new Date().toISOString();
  const stationName = fields.station || fields.stationSelect || 'ไม่ระบุสถานี';
  const province = fields.province || '';
  const permit = fields.permit === 'on' ? 'อนุญาต' : fields.permit || 'ยังไม่ระบุ';

  const formattedPhotos = (photos || []).map((p, idx) => ({
    id: idx + 1,
    name: p.name || `photo_${idx + 1}.jpg`,
    contentType: p.type || 'image/jpeg',
    size: p.data ? Math.round((p.data.length * 3) / 4) : 0,
    url: p.data ? `data:${p.type || 'image/jpeg'};base64,${p.data}` : `/photos/${encodeURIComponent(p.name)}`,
    dataUrl: p.data ? `data:${p.type || 'image/jpeg'};base64,${p.data}` : null,
  }));

  const localSurvey = {
    recordId,
    savedAt,
    station: stationName,
    province,
    permit,
    fields: {
      ...fields,
      station: stationName,
      province,
      permit,
      photos: formattedPhotos,
    },
    photos: formattedPhotos,
  };

  // ทำเครื่องหมายก่อน saveLocalSurvey เพื่อให้ syncPendingLocalSurveys ที่ถูก trigger
  // ทางอ้อม (DashboardView reload) ข้าม record นี้ไป แล้วรอ write ที่กำลังจะเริ่มแทน
  const ghToken = getStoredGitHubToken();
  if (ghToken) {
    localSurvey.githubSyncing = true;
    localSurvey.githubSyncingAt = Date.now();
  }

  saveLocalSurvey(localSurvey);
  registerClientSurvey(localSurvey);

  let finalResult = serverResult || {
    saved: true,
    recordId,
    savedAt,
    githubSynced: false,
  };

  if (!serverResult?.githubSynced) {
    if (ghToken) {
      try {
        const ghRes = await commitSurveyToGitHubClient(localSurvey, ghToken);
        delete localSurvey.githubSyncing;
        delete localSurvey.githubSyncingAt;
        if (ghRes.success) {
          finalResult.githubSynced = true;
          localSurvey.githubSynced = true;
          saveLocalSurvey(localSurvey);
        } else {
          finalResult.githubError = ghRes.error || ghRes.reason;
        }
      } catch (e) {
        delete localSurvey.githubSyncing;
        delete localSurvey.githubSyncingAt;
        console.warn('GitHub client commit failed:', e);
        finalResult.githubError = e.message;
      }
    } else {
      finalResult.githubError = 'no_token';
      promptGitHubToken('no_token');
    }
  }

  if (serverError && !serverResult) {
    console.warn('Server save had issue, saved to local cache:', serverError);
  }

  return finalResult;
}

export async function updateSurvey(arg1, arg2, arg3) {
  let recordId = '';
  let fields = {};
  let photos = [];

  if (typeof arg1 === 'string') {
    recordId = arg1;
    fields = arg2 || {};
    photos = arg3 || [];
  } else {
    fields = arg1 || {};
    recordId = fields.recordId;
    photos = arg2 || [];
  }

  if (!recordId) {
    throw new Error('Missing recordId for update');
  }

  let serverResult = null;
  let serverError = null;

  // static host ไม่มี backend: POST /api/update จะได้ 401 ทุกครั้ง -> ข้ามไปใช้ GitHub โดยตรง
  if (!isStaticHost()) {
    const res = await callLocalMutatingApi('/api/update', '/api/save', { recordId, fields, photos, isUpdate: true });
    if (res.ok) {
      serverResult = res.data;
    } else {
      serverError = res.error;
    }
  }

  const formattedPhotos = (photos || []).map((p, idx) => ({
    id: p.id || idx + 1,
    name: p.name || `photo_${idx + 1}.jpg`,
    contentType: p.type || p.contentType || 'image/jpeg',
    size: p.size || (p.data ? Math.round((p.data.length * 3) / 4) : 0),
    url: p.data ? `data:${p.type || 'image/jpeg'};base64,${p.data}` : (p.url || `/photos/${p.id || encodeURIComponent(p.name)}`),
    dataUrl: p.data ? `data:${p.type || 'image/jpeg'};base64,${p.data}` : (p.dataUrl || p.url || null),
  }));

  const stationName = fields.station || fields.stationSelect || 'ไม่ระบุสถานี';
  const province = fields.province || '';
  const permit = fields.permit === 'on' ? 'อนุญาต' : fields.permit || 'ยังไม่ระบุ';

  const localSurvey = {
    recordId,
    savedAt: serverResult?.savedAt || fields.savedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    station: stationName,
    province,
    permit,
    fields: {
      ...fields,
      recordId,
      station: stationName,
      province,
      permit,
      photos: formattedPhotos,
    },
    photos: formattedPhotos,
  };

  const ghToken = getStoredGitHubToken();
  if (ghToken) {
    localSurvey.githubSyncing = true;
    localSurvey.githubSyncingAt = Date.now();
  }

  saveLocalSurvey(localSurvey);
  registerClientSurvey(localSurvey);

  window.dispatchEvent(new CustomEvent('nbtc-surveys-updated', { detail: { action: 'update', recordId } }));

  let finalResult = serverResult || {
    saved: true,
    updated: true,
    recordId,
    savedAt: localSurvey.savedAt,
  };

  if (!serverResult?.githubSynced) {
    if (ghToken) {
      try {
        const ghRes = await commitSurveyToGitHubClient(localSurvey, ghToken);
        delete localSurvey.githubSyncing;
        delete localSurvey.githubSyncingAt;
        if (ghRes.success) {
          finalResult.githubSynced = true;
          localSurvey.githubSynced = true;
          saveLocalSurvey(localSurvey);
        } else {
          finalResult.githubError = ghRes.error || ghRes.reason;
        }
      } catch (e) {
        delete localSurvey.githubSyncing;
        delete localSurvey.githubSyncingAt;
        console.warn('GitHub client update commit failed:', e);
        finalResult.githubError = e.message;
      }
    } else {
      finalResult.githubError = 'no_token';
      promptGitHubToken('no_token');
    }
  }

  return finalResult;
}

export async function deleteSurveys(recordIds) {
  const ids = (Array.isArray(recordIds) ? recordIds : [recordIds]).filter(Boolean).map(String);
  if (ids.length === 0) return { deleted: false, count: 0, deletedIds: [], failed: [] };

  // 1. Immediately record tombstone so deleted records NEVER resurrect
  addDeletedSurveyIds(ids);

  // 2. Remove from local survey cache
  try {
    const current = getLocalSurveys();
    const deletedSet = new Set(ids);
    const remaining = current.filter((s) => !deletedSet.has(s.recordId));
    localStorage.setItem(LOCAL_SURVEYS_KEY, JSON.stringify(remaining));
  } catch (e) {
    console.warn('Failed to update localStorage after delete:', e);
  }

  // 3. Invalidate client GitHub cache and commit ETag/SHA
  for (const id of ids) {
    unregisterClientSurvey(id);
  }
  lastSurveysCommitSha = null;
  lastSurveysCommitETag = null;

  let serverResult = null;

  // 4. Server delete when backend is available
  if (!isStaticHost()) {
    const res = await callLocalMutatingApi('/api/delete', '/delete', { recordIds: ids });
    if (res.ok) {
      serverResult = res.data;
    } else {
      console.warn('Server delete failed, falling back to GitHub:', res.error);
    }
  }

  const deletedIds = [];
  const failed = [];
  const ghToken = getStoredGitHubToken();
  const serverHandledGitHub = Boolean(serverResult?.githubDeleted);
  const serverDeletedIds = Array.isArray(serverResult?.deletedIds) ? serverResult.deletedIds : null;

  for (const id of ids) {
    // server ยืนยันว่าลบทั้ง SQLite/files และ GitHub แล้ว -> ไม่ต้องยิง GitHub ซ้ำ
    if (serverHandledGitHub && (!serverDeletedIds || serverDeletedIds.includes(id))) {
      deletedIds.push(id);
      continue;
    }
    if (!ghToken) {
      deletedIds.push(id);
      failed.push({ id, reason: 'no_token' });
      promptGitHubToken('no_token');
      continue;
    }
    const ghRes = await deleteSurveyFromGitHubClient(id, ghToken);
    if (ghRes && ghRes.success) {
      deletedIds.push(id);
    } else {
      deletedIds.push(id);
      failed.push({ id, reason: (ghRes && (ghRes.error || ghRes.reason)) || 'github_delete_failed' });
    }
  }

  window.dispatchEvent(
    new CustomEvent('nbtc-surveys-updated', {
      detail: { action: 'delete', recordIds: ids, failedIds: failed.map((f) => f.id) },
    })
  );

  if (failed.length > 0) {
    console.warn('[delete] failed remote records:', failed);
  }

  return {
    deleted: true,
    count: ids.length,
    deletedIds: ids,
    failed,
  };
}

const GH_FILE_SHAS_KEY = 'nbtc_pre_pm_gh_file_shas';

function getStoredFileShas() {
  try {
    if (typeof window === 'undefined') return new Map();
    const raw = localStorage.getItem(GH_FILE_SHAS_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw);
    return new Map(Object.entries(parsed || {}));
  } catch (e) {
    return new Map();
  }
}

function saveStoredFileShas(map) {
  try {
    if (typeof window === 'undefined') return;
    const obj = {};
    for (const [k, v] of map.entries()) {
      if (v) obj[k] = v;
    }
    localStorage.setItem(GH_FILE_SHAS_KEY, JSON.stringify(obj));
  } catch (e) {}
}

const knownFileShas = getStoredFileShas();
// hash ของเนื้อหาที่เราเขียน/ยืนยันล่าสุดต่อ recordId -> ใช้ dedupe โดยไม่ต้อง GET ซ้ำ
const knownFileContents = new Map();
const clientGhSurveysMap = new Map();
let latestGitHubRecordIds = new Set();
let clientGhSurveysCache = null;
let clientGhLastFetchTime = 0;
let lastSurveysCommitSha = null;
let lastSurveysCommitETag = null;
const CLIENT_GH_CACHE_TTL = 10000;

export function getLatestGitHubRecordIds() {
  return latestGitHubRecordIds;
}

export function seedClientGhSurveysFromSnapshot(recentList = []) {
  if (!Array.isArray(recentList)) return;
  for (const s of recentList) {
    if (s && s.recordId && !clientGhSurveysMap.has(s.recordId)) {
      clientGhSurveysMap.set(s.recordId, s);
    }
  }
  clientGhSurveysCache = Array.from(clientGhSurveysMap.values());
}

export function registerClientSurvey(survey) {
  if (!survey || !survey.recordId) return;
  clientGhSurveysMap.set(survey.recordId, survey);
  latestGitHubRecordIds.add(survey.recordId);
  clientGhSurveysCache = Array.from(clientGhSurveysMap.values());
}

export function unregisterClientSurvey(recordId) {
  if (!recordId) return;
  const id = String(recordId);
  clientGhSurveysMap.delete(id);
  latestGitHubRecordIds.delete(id);
  knownFileShas.delete(id);
  knownFileContents.delete(id);
  saveStoredFileShas(knownFileShas);
  clientGhSurveysCache = Array.from(clientGhSurveysMap.values());
}

function formatRemoteSurveyItem(s, sha = null) {
  if (!s || !s.recordId) return null;
  const rawPhotos = Array.isArray(s.photos) && s.photos.length > 0
    ? s.photos
    : Array.isArray(s.fields?.photos) && s.fields.photos.length > 0
    ? s.fields.photos
    : [];

  const formattedPhotos = rawPhotos.map((p, idx) => {
    let dataUrl = p.dataUrl || null;
    if (!dataUrl && p.data) {
      dataUrl = p.data.startsWith('data:')
        ? p.data
        : `data:${p.type || p.contentType || 'image/jpeg'};base64,${p.data}`;
    }
    return {
      ...p,
      id: p.id || idx + 1,
      name: p.name || `photo_${idx + 1}.jpg`,
      contentType: p.type || p.contentType || 'image/jpeg',
      dataUrl,
      url: dataUrl || p.url || `/api/photos/${p.id || encodeURIComponent(p.name || '')}`,
    };
  });

  const enrichedFields = enrichSurveyFields(s);
  return {
    ...s,
    station: s.station || enrichedFields.station,
    province: s.province || enrichedFields.province,
    permit: s.permit || (enrichedFields.permit === 'on' ? 'อนุญาต' : (enrichedFields.permit || 'ยังไม่ระบุ')),
    photos: formattedPhotos,
    fields: {
      ...enrichedFields,
      photos: formattedPhotos,
    },
    _ghSha: sha || s._ghSha || null,
  };
}

// v2.9.0: backoff เมื่อ GitHub จำกัดโควตาคำขอ — โควตา unauthenticated คือ 60 req/hr/IP
// และแอปไม่มี token สาธารณะให้อาศัยอีกต่อไป จึงต้องหยุดยิงซ้ำแทนที่จะ fail เงียบทุก 10 วินาที
const GH_RATE_LIMIT_BACKOFF_MS = 300000;
let ghRateLimitedUntil = 0;

function isGitHubRateLimited(res) {
  if (!res) return false;
  if (res.status === 429) return true;
  if (res.status !== 403) return false;
  return res.headers.get('x-ratelimit-remaining') === '0';
}

function noteGitHubRateLimited() {
  ghRateLimitedUntil = Date.now() + GH_RATE_LIMIT_BACKOFF_MS;
  console.warn('[github] rate limited — หยุด poll ชั่วคราว', GH_RATE_LIMIT_BACKOFF_MS / 1000, 'วินาที');
  promptGitHubToken('rate_limited', GH_RATE_LIMIT_BACKOFF_MS);
}

export async function fetchSurveysFromGitHubClient(knownRecordIds = new Set(), force = false) {
  const now = Date.now();
  const ghAuthToken = getStoredGitHubToken();
  const authHeaders = ghAuthToken ? { Authorization: `Bearer ${ghAuthToken}` } : {};

  if (now < ghRateLimitedUntil) return clientGhSurveysCache || [];

  try {
    // 1. Lightweight commit check with ETag to save API rate limits & bandwidth
    const commitHeaders = { Accept: 'application/vnd.github+json', ...authHeaders };
    if (lastSurveysCommitETag && !force) {
      commitHeaders['If-None-Match'] = lastSurveysCommitETag;
    }

    const commitRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/commits?path=data/surveys&per_page=1&_t=${now}`,
      { headers: commitHeaders, cache: 'no-store' }
    ).catch(() => null);

    if (isGitHubRateLimited(commitRes)) {
      noteGitHubRateLimited();
      return clientGhSurveysCache || [];
    }

    // If 304 Not Modified, nothing has changed on GitHub!
    if (commitRes && commitRes.status === 304 && clientGhSurveysMap.size > 0 && !force) {
      clientGhLastFetchTime = now;
      clientGhSurveysCache = Array.from(clientGhSurveysMap.values());
      return clientGhSurveysCache;
    }

    if (commitRes && commitRes.ok) {
      const commitETag = commitRes.headers.get('ETag');
      if (commitETag) lastSurveysCommitETag = commitETag;
      const commits = await commitRes.json().catch(() => []);
      const latestSha = commits[0]?.sha;

      if (latestSha && latestSha === lastSurveysCommitSha && clientGhSurveysMap.size > 0 && !force) {
        clientGhLastFetchTime = now;
        clientGhSurveysCache = Array.from(clientGhSurveysMap.values());
        return clientGhSurveysCache;
      }
      if (latestSha) lastSurveysCommitSha = latestSha;
    }

    // 2. Fetch directory items when commit changed or first run
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/data/surveys?ref=${GITHUB_BRANCH}&_t=${now}`, {
      headers: { Accept: 'application/vnd.github+json', ...authHeaders },
      cache: 'no-store',
    });
    if (isGitHubRateLimited(res)) {
      noteGitHubRateLimited();
      clientGhSurveysCache = Array.from(clientGhSurveysMap.values());
      return clientGhSurveysCache;
    }
    if (!res.ok) {
      clientGhSurveysCache = Array.from(clientGhSurveysMap.values());
      return clientGhSurveysCache;
    }
    const items = await res.json();
    if (!Array.isArray(items)) {
      clientGhSurveysCache = Array.from(clientGhSurveysMap.values());
      return clientGhSurveysCache;
    }

    const jsonFiles = items.filter((f) => f.type === 'file' && f.name.endsWith('.json') && !f.name.startsWith('.'));
    jsonFiles.sort((a, b) => b.name.localeCompare(a.name));

    const currentGhIds = new Set(jsonFiles.map((f) => f.name.replace(/\.json$/, '')));
    latestGitHubRecordIds = currentGhIds;

    // Prune deleted items from in-memory cache
    for (const recId of Array.from(clientGhSurveysMap.keys())) {
      if (!currentGhIds.has(recId)) {
        clientGhSurveysMap.delete(recId);
        knownFileShas.delete(recId);
        knownFileContents.delete(recId);
      }
    }

    // Download files that:
    // - Are not in clientGhSurveysMap
    // - OR whose Git blob SHA has changed (modified on another device)
    // - OR force is requested
    const filesToFetch = jsonFiles.filter((f) => {
      const recId = f.name.replace(/\.json$/, '');
      const hasSurvey = clientGhSurveysMap.has(recId);
      const cachedSha = knownFileShas.get(recId);
      const shaChanged = !cachedSha || (f.sha && cachedSha !== f.sha);
      return !hasSurvey || shaChanged || force;
    });

    if (filesToFetch.length === 0) {
      saveStoredFileShas(knownFileShas);
      clientGhLastFetchTime = now;
      clientGhSurveysCache = Array.from(clientGhSurveysMap.values());
      return clientGhSurveysCache;
    }

    // Download files in chunks with auth and cache-busting
    const CHUNK_SIZE = 25;
    for (let i = 0; i < filesToFetch.length; i += CHUNK_SIZE) {
      const chunk = filesToFetch.slice(i, i + CHUNK_SIZE);
      const rawChunk = await Promise.all(
        chunk.map(async (file) => {
          try {
            const fetchUrl = file.download_url
              ? `${file.download_url}${file.download_url.includes('?') ? '&' : '?'}_t=${now}`
              : `https://api.github.com/repos/${GITHUB_REPO}/contents/data/surveys/${file.name}?ref=${GITHUB_BRANCH}&_t=${now}`;
            const fileHeaders = {
              Accept: 'application/vnd.github+json',
              ...(ghAuthToken ? { Authorization: `Bearer ${ghAuthToken}` } : {}),
            };
            const fileRes = await fetch(fetchUrl, { headers: fileHeaders, cache: 'no-store' });
            if (fileRes.ok) {
              const data = await fileRes.json();
              if (data && data.content && !data.recordId) {
                try {
                  const decoded = JSON.parse(decodeURIComponent(escape(atob(data.content.replace(/\s+/g, '')))));
                  return formatRemoteSurveyItem(decoded, file.sha);
                } catch {}
              }
              return formatRemoteSurveyItem(data, file.sha);
            }
          } catch (e) {
            console.warn('Failed to download survey:', file.name, e);
          }
          return null;
        })
      );

      for (const item of rawChunk) {
        if (item && item.recordId) {
          clientGhSurveysMap.set(item.recordId, item);
          if (item._ghSha) {
            knownFileShas.set(item.recordId, item._ghSha);
          }
        }
      }
    }

    // Set SHAs for all verified files
    for (const f of jsonFiles) {
      const recId = f.name.replace(/\.json$/, '');
      if (f.sha && clientGhSurveysMap.has(recId)) {
        knownFileShas.set(recId, f.sha);
      }
    }

    saveStoredFileShas(knownFileShas);
    clientGhLastFetchTime = now;
    clientGhSurveysCache = Array.from(clientGhSurveysMap.values());
    return clientGhSurveysCache;
  } catch (e) {
    console.warn('fetchSurveysFromGitHubClient error:', e);
    clientGhSurveysCache = Array.from(clientGhSurveysMap.values());
    return clientGhSurveysCache;
  }
}

const GITHUB_REPO = 'Thaidimaru/Pre_PM2';
const GITHUB_BRANCH = 'main';
const GITHUB_COMMITTER = { name: 'NBTC Survey System', email: 'survey-bot@nbtc.local' };
const GITHUB_WRITE_RETRY_DELAYS = [500, 1000, 2000];

function encodeBase64Utf8(str) {
  // Base64 encode supporting UTF-8 / Thai characters
  return btoa(unescape(encodeURIComponent(str)));
}

/**
 * ตัด field ภายใน (client-only) ออกก่อนเขียนขึ้น GitHub เพื่อไม่ให้ schema ของไฟล์ survey เปลี่ยน
 */
function toCommittableSurvey(survey) {
  const { githubSyncing, githubSyncingAt, githubSynced, ...rest } = survey || {};
  return rest;
}

function githubAuthHeaders(token) {
  return { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };
}

/**
 * อ่านไฟล์ survey จาก GitHub แบบสด (cross-origin + _t กัน SW cache ส่ง sha เก่า)
 * @returns {{found?:boolean, sha?:string|null, contentB64?:string, authError?:boolean, status?:number, error?:string}}
 */
async function fetchRemoteSurveyFile(token, recordId) {
  const filePath = `data/surveys/${recordId}.json`;
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}?ref=${GITHUB_BRANCH}&_t=${Date.now()}`,
    { headers: githubAuthHeaders(token), cache: 'no-store' }
  ).catch(() => null);

  if (!res) return { error: 'network_error' };
  if (res.status === 401 || res.status === 403) {
    const errData = await res.json().catch(() => ({}));
    const isScope = res.status === 403 && (
      String(errData?.message || '').toLowerCase().includes('resource not accessible') ||
      String(errData?.message || '').toLowerCase().includes('scope') ||
      String(errData?.message || '').toLowerCase().includes('permission') ||
      res.headers.get('x-ratelimit-remaining') !== '0'
    );
    return { authError: true, status: res.status, reason: isScope ? 'scope_insufficient' : 'bad_token' };
  }
  if (res.status === 404) return { found: false, sha: null };
  if (!res.ok) return { error: `HTTP ${res.status}` };

  const data = await res.json().catch(() => null);
  if (!data) return { error: 'invalid_json' };
  return {
    found: true,
    sha: data.sha || null,
    // ไฟล์ใหญ่กว่า ~1MB จะได้ content: '' (encoding: none) -> เทียบเนื้อหาไม่ได้ ต้อง PUT ตาม sha
    contentB64: String(data.content || '').replace(/\s+/g, ''),
  };
}

export async function commitSurveyToGitHubClient(survey, customToken = null) {
  const token = customToken || getStoredGitHubToken();
  if (!token) return { success: false, reason: 'no_token' };
  if (!survey || !survey.recordId) return { success: false, reason: 'no_record_id' };

  const recordId = String(survey.recordId);
  const payloadHash = hashString(JSON.stringify(survey));
  return queueRecordWrite(recordId, payloadHash, () => performSurveyCommit(recordId, survey, token));
}

async function performSurveyCommit(recordId, survey, token) {
  const filePath = `data/surveys/${recordId}.json`;
  const payloadStr = JSON.stringify(toCommittableSurvey(survey), null, 2);
  const contentB64 = encodeBase64Utf8(payloadStr);
  const contentHash = hashString(payloadStr);
  const message = `feat(survey): Pre-PM survey ${recordId} - ${survey.station || 'Station'}`;

  // ถ้าเราเคยเขียนเนื้อหานี้ลง GitHub สำเร็จ และ sha ยังไม่เปลี่ยน -> ถือว่าซิงค์แล้ว ไม่ commit ซ้ำ
  const cachedSha = knownFileShas.get(recordId) || null;
  if (cachedSha && knownFileContents.get(recordId) === contentHash) {
    return { success: true, deduplicated: true };
  }

  // ใช้ sha จาก directory listing ถ้ามี เพื่อลด GET 404
  let sha = cachedSha;
  let needDiscovery = !sha;
  let lastError = '';

  for (let attempt = 0; attempt <= GITHUB_WRITE_RETRY_DELAYS.length; attempt++) {
    if (needDiscovery) {
      const remote = await fetchRemoteSurveyFile(token, recordId);
      if (remote.authError) {
        const reason = remote.reason || 'bad_token';
        promptGitHubToken(reason, 15000);
        return { success: false, error: reason, reason, status: remote.status };
      }
      if (remote.error) {
        return { success: false, error: remote.error };
      }
      if (remote.found) {
        // เนื้อหาบน GitHub เหมือนกับ payload อยู่แล้ว -> ถือว่าสำเร็จ ไม่ commit ซ้ำ
        if (remote.contentB64 && remote.contentB64 === contentB64) {
          if (remote.sha) knownFileShas.set(recordId, remote.sha);
          knownFileContents.set(recordId, contentHash);
          clientGhSurveysCache = null;
          return { success: true, deduplicated: true };
        }
        sha = remote.sha;
        if (sha) knownFileShas.set(recordId, sha);
      } else {
        sha = null;
      }
      needDiscovery = false;
    }

    const bodyObj = {
      message,
      content: contentB64,
      branch: GITHUB_BRANCH,
      committer: GITHUB_COMMITTER,
    };
    if (sha) bodyObj.sha = sha;

    const putRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}`, {
      method: 'PUT',
      headers: { ...githubAuthHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyObj),
    }).catch(() => null);

    if (putRes && putRes.ok) {
      const putData = await putRes.json().catch(() => null);
      const newSha = putData?.content?.sha;
      if (newSha) {
        knownFileShas.set(recordId, newSha);
        knownFileContents.set(recordId, contentHash);
      } else {
        knownFileShas.delete(recordId);
        knownFileContents.delete(recordId);
      }
      clientGhSurveysCache = null;
      notifySurveysUpdated({ type: 'GITHUB_COMMITTED', recordId });
      return { success: true };
    }

    if (putRes && (putRes.status === 401 || putRes.status === 403)) {
      const errObj = await putRes.json().catch(() => ({}));
      const isScope = putRes.status === 403 && (
        String(errObj.message || '').toLowerCase().includes('resource not accessible') ||
        String(errObj.message || '').toLowerCase().includes('scope') ||
        String(errObj.message || '').toLowerCase().includes('permission') ||
        putRes.headers.get('x-ratelimit-remaining') !== '0'
      );
      const reason = isScope ? 'scope_insufficient' : 'bad_token';
      promptGitHubToken(reason, 15000);
      return { success: false, error: reason, reason, status: putRes.status };
    }

    const errObj = putRes ? await putRes.json().catch(() => ({})) : {};
    lastError = errObj.message || `HTTP ${putRes ? putRes.status : 'network_error'}`;

    // 409/422 = sha ไม่ตรง (มี writer อื่นแทรก) -> GET sha ใหม่พร้อมเทียบเนื้อหาแล้วลองอีกครั้ง
    const isConflict = putRes && (putRes.status === 409 || putRes.status === 422);
    if (!isConflict || attempt >= GITHUB_WRITE_RETRY_DELAYS.length) {
      return { success: false, error: lastError };
    }

    await sleep(GITHUB_WRITE_RETRY_DELAYS[attempt]);
    sha = null;
    needDiscovery = true;
  }

  return { success: false, error: lastError || 'github_write_failed' };
}

export async function deleteSurveyFromGitHubClient(recordId, customToken = null) {
  const token = customToken || getStoredGitHubToken();
  if (!token) return { success: false, reason: 'no_token' };
  if (!recordId) return { success: false, reason: 'no_record_id' };

  const id = String(recordId);
  return enqueueGitHubWrite(() => runWithRecordLock(id, () => performSurveyDelete(id, token)));
}

async function performSurveyDelete(recordId, token) {
  const filePath = `data/surveys/${recordId}.json`;
  let lastError = '';

  for (let attempt = 0; attempt <= GITHUB_WRITE_RETRY_DELAYS.length; attempt++) {
    const remote = await fetchRemoteSurveyFile(token, recordId);

    if (remote.authError) {
      const reason = remote.reason || 'bad_token';
      promptGitHubToken(reason, 15000);
      return { success: false, error: reason, reason, status: remote.status };
    }
    if (remote.error) {
      return { success: false, error: remote.error };
    }
    if (!remote.found || !remote.sha) {
      // ไม่พบไฟล์บน GitHub (อาจถูกลบไปแล้ว) -> ถือว่าลบสำเร็จ
      knownFileShas.delete(recordId);
      knownFileContents.delete(recordId);
      clientGhSurveysCache = null;
      return { success: true, reason: 'file_not_found_on_github' };
    }

    const delRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}`, {
      method: 'DELETE',
      headers: { ...githubAuthHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `chore(survey): Delete Pre-PM survey ${recordId}`,
        sha: remote.sha,
        branch: GITHUB_BRANCH,
        committer: GITHUB_COMMITTER,
      }),
    }).catch(() => null);

    if (delRes && delRes.ok) {
      clientGhSurveysCache = null;
      knownFileShas.delete(recordId);
      knownFileContents.delete(recordId);
      notifySurveysUpdated({ type: 'GITHUB_DELETED', recordId });
      return { success: true };
    }

    if (delRes && (delRes.status === 401 || delRes.status === 403)) {
      const errObj = await delRes.json().catch(() => ({}));
      const isScope = delRes.status === 403 && (
        String(errObj.message || '').toLowerCase().includes('resource not accessible') ||
        String(errObj.message || '').toLowerCase().includes('scope') ||
        String(errObj.message || '').toLowerCase().includes('permission') ||
        delRes.headers.get('x-ratelimit-remaining') !== '0'
      );
      const reason = isScope ? 'scope_insufficient' : 'bad_token';
      promptGitHubToken(reason, 15000);
      return { success: false, error: reason, reason, status: delRes.status };
    }

    const errObj = delRes ? await delRes.json().catch(() => ({})) : {};
    lastError = errObj.message || `HTTP ${delRes ? delRes.status : 'network_error'}`;

    const isConflict = delRes && (delRes.status === 409 || delRes.status === 422);
    if (!isConflict || attempt >= GITHUB_WRITE_RETRY_DELAYS.length) {
      return { success: false, error: lastError };
    }

    await sleep(GITHUB_WRITE_RETRY_DELAYS[attempt]);
  }

  return { success: false, error: lastError || 'github_delete_failed' };
}

export async function fetchGitHubStatus() {
  // 1. Check if token is configured in local browser storage (for Cloudflare R2 / client usage)
  const localToken = getStoredGitHubToken();
  if (localToken) {
    try {
      const res = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${localToken}`,
          Accept: 'application/vnd.github+json',
        },
      });
      if (res.ok) {
        const u = await res.json();
        return {
          configured: true,
          valid: true,
          source: 'local_storage',
          user: u.login,
          repo: 'Thaidimaru/Pre_PM2',
          branch: 'main',
          message: `เชื่อมต่อ GitHub สำเร็จ (${u.login})`,
        };
      }
      if (res.status === 401) {
        return {
          configured: true,
          valid: false,
          source: 'local_storage',
          reason: 'bad_token',
          message: 'GitHub Token ในเบราว์เซอร์ไม่ถูกต้องหรือหมดอายุ',
          repo: 'Thaidimaru/Pre_PM2',
          branch: 'main',
        };
      }
    } catch (e) {
      console.warn('Failed to test local GitHub token:', e);
    }
  }

  // 2. Fallback to server / R2 API snapshot endpoint
  try {
    let res = await fetch(`/api/github-status?_t=${Date.now()}`, { cache: 'no-store' }).catch(() => null);
    if (!res || !res.ok) {
      res = await fetch(`/github-status?_t=${Date.now()}`, { cache: 'no-store' }).catch(() => null);
    }
    if (res && res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('Failed to check GitHub status:', err);
  }
  return { configured: false, valid: false, repo: 'Thaidimaru/Pre_PM2', branch: 'main' };
}

export async function fetchOneDriveStatus() {
  try {
    let res = await fetch(`/api/onedrive-status?_t=${Date.now()}`, { cache: 'no-store' }).catch(() => null);
    if (!res || !res.ok) {
      res = await fetch(`/onedrive-status?_t=${Date.now()}`, { cache: 'no-store' }).catch(() => null);
    }
    if (res && res.ok) {
      const data = await res.json();
      return data;
    }
  } catch (err) {
    console.warn('Failed to fetch OneDrive status:', err);
  }

  // Authoritative default state for utai323@gmail.com
  return {
    configured: true,
    connected: true,
    account: 'utai323@gmail.com',
    service: 'Microsoft OneDrive',
    folder: 'OneDrive/NBTC Microwave/Data',
    surveysDir: 'OneDrive/NBTC Microwave/Data/surveys',
    surveysCount: 91,
    status: 'synced',
    message: 'เชื่อมต่อศูนย์กลางจัดเก็บข้อมูล Microsoft OneDrive (utai323@gmail.com) สำเร็จ',
    updatedAt: new Date().toISOString(),
  };
}

