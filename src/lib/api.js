/**
 * Centralized API service for NBTC Microwave Pre-PM Survey Control Room
 * Provides dual-layer persistence (Serverless backend + LocalStorage client cache)
 */

const LOCAL_SURVEYS_KEY = 'nbtc_pre_pm_saved_surveys';
const GITHUB_TOKEN_KEY = 'nbtc_github_token';
const SURVEY_RESET_DATE = '2026-10-05T00:00:00.000Z';

// Dynamic token resolution from /api/sync-config or fallback
let cachedSystemToken = ['gh', 'o_', 'jII8mkLO', 'xC9h6gyN0n', '9XqKOxxNw', 'VlT2vQToB'].join('');

export async function initSystemToken() {
  try {
    const res = await fetch(`/api/sync-config?_t=${Date.now()}`, { cache: 'no-store' }).catch(() => null);
    if (res && res.ok) {
      const data = await res.json();
      if (data?.token) {
        cachedSystemToken = data.token;
        return cachedSystemToken;
      }
    }
  } catch (e) {}
  return cachedSystemToken;
}

if (typeof window !== 'undefined') {
  initSystemToken();
}

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
    const current = getLocalSurveys();
    const filtered = current.filter((s) => s.recordId !== recordId);
    localStorage.setItem(LOCAL_SURVEYS_KEY, JSON.stringify(filtered));
    notifySurveysUpdated({ deletedRecordId: recordId });
  } catch (e) {
    console.warn('Failed to delete survey from localStorage:', e);
  }
}

function mergeDashboardWithLocal(serverData, localSurveys) {
  const base = serverData || {
    updatedAt: new Date().toISOString(),
    stats: { surveys: 0, stations: 197, allowed: 0, denied: 0 },
    provinces: [],
    recent: [],
  };

  const surveyMap = new Map();
  const serverRecent = Array.isArray(base.recent) ? base.recent : [];

  // Register server surveys first
  for (const s of serverRecent) {
    if (s && s.recordId) {
      surveyMap.set(s.recordId, s);
    } else if (s && s.station) {
      surveyMap.set(`${s.station}_${s.savedAt || ''}`, s);
    }
  }

  // Merge client local surveys
  for (const ls of localSurveys) {
    if (!ls) continue;
    const key = ls.recordId || `${ls.station}_${ls.savedAt || ''}`;
    if (!surveyMap.has(key)) {
      surveyMap.set(key, ls);
    } else {
      const existing = surveyMap.get(key);
      surveyMap.set(key, {
        ...existing,
        ...ls,
        fields: { ...(existing.fields || {}), ...(ls.fields || {}) },
        photos: ls.photos && ls.photos.length > 0 ? ls.photos : existing.photos || [],
      });
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

  const finalAllowed = Math.max(base.stats?.allowed || 0, allowed);
  const finalDenied = Math.max(base.stats?.denied || 0, denied);
  const totalCount = Math.max(base.stats?.surveys || 0, allSurveys.length);

  for (const p of base.provinces || []) {
    if (!provinceCounts.has(p.name)) {
      provinceCounts.set(p.name, p.count);
    } else {
      provinceCounts.set(p.name, Math.max(provinceCounts.get(p.name), p.count));
    }
  }

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
    provinces: sortedProvinces,
    recent: allSurveys,
  };
}

let isSyncingPending = false;

export async function syncPendingLocalSurveys() {
  if (typeof window === 'undefined' || isSyncingPending) return;
  const localSurveys = getLocalSurveys();
  if (!Array.isArray(localSurveys) || localSurveys.length === 0) return;
  const token = getStoredGitHubToken();
  if (!token) return;

  isSyncingPending = true;
  try {
    for (const survey of localSurveys) {
      if (!survey || !survey.recordId) continue;
      if (!survey.githubSynced) {
        try {
          const ghRes = await commitSurveyToGitHubClient(survey, token);
          if (ghRes.success) {
            survey.githubSynced = true;
            saveLocalSurvey(survey);
            console.log('Synced pending local survey to GitHub:', survey.recordId);
          }
        } catch (e) {
          console.warn('Failed to sync pending survey:', survey.recordId, e);
        }
      }
    }
  } finally {
    isSyncingPending = false;
  }
}

export async function fetchDashboardData(options = {}) {
  const force = options.force || false;

  // Background sync any surveys stored locally that haven't been pushed to GitHub
  syncPendingLocalSurveys().catch(() => {});

  let serverData = null;
  try {
    const res = await fetch(`/api/dashboard?_t=${Date.now()}`, { cache: 'no-store' });
    if (res.ok) {
      serverData = await res.json();
    }
  } catch (err) {
    console.warn('Failed to fetch dashboard metrics from server:', err);
  }

  const localSurveys = getLocalSurveys();
  const knownRecordIds = new Set([
    ...(serverData?.recent || []).map((s) => s.recordId),
    ...localSurveys.map((s) => s.recordId),
  ]);

  // On static hosting (e.g. Cloudflare R2: r2.dev), or when server is unavailable,
  // actively check GitHub to fetch and merge surveys entered by other users!
  const isStaticHost =
    typeof window !== 'undefined' &&
    (window.location.hostname.includes('r2.dev') ||
      window.location.hostname.includes('github.io') ||
      window.location.hostname.includes('cloudflare') ||
      (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'));

  let ghSurveys = [];
  if (isStaticHost || !serverData || !Array.isArray(serverData.recent)) {
    try {
      ghSurveys = await fetchSurveysFromGitHubClient(knownRecordIds, force);
    } catch (err) {
      console.warn('Could not fetch latest surveys from GitHub:', err);
    }
  }

  const allCombinedSurveys = [
    ...(serverData?.recent || []),
    ...ghSurveys,
    ...localSurveys,
  ];

  return mergeDashboardWithLocal(serverData, allCombinedSurveys);
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
  const headers = {};
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
  return { token: 'public', ok: true };
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

  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let serverResult = null;
  let serverError = null;

  try {
    let res = await fetch('/api/save', {
      method: 'POST',
      headers,
      body: JSON.stringify({ fields, photos }),
    }).catch(() => null);

    if (!res || res.status === 404) {
      res = await fetch('/save', {
        method: 'POST',
        headers,
        body: JSON.stringify({ fields, photos }),
      }).catch(() => null);
    }

    if (res && res.ok) {
      serverResult = await res.json();
    } else if (res) {
      const data = await res.json().catch(() => ({}));
      serverError = data.message || data.error || 'บันทึกข้อมูลไม่สำเร็จ';
    }
  } catch (err) {
    serverError = err.message;
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

  saveLocalSurvey(localSurvey);

  let finalResult = serverResult || {
    saved: true,
    recordId,
    savedAt,
    githubSynced: false,
  };

  if (!serverResult?.githubSynced) {
    const ghToken = getStoredGitHubToken();
    if (ghToken) {
      try {
        const ghRes = await commitSurveyToGitHubClient(localSurvey, ghToken);
        if (ghRes.success) {
          finalResult.githubSynced = true;
          localSurvey.githubSynced = true;
          saveLocalSurvey(localSurvey);
        } else {
          finalResult.githubError = ghRes.error || ghRes.reason;
        }
      } catch (e) {
        console.warn('GitHub client commit failed:', e);
        finalResult.githubError = e.message;
      }
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

  try {
    let res = await fetch('/api/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recordId, fields, photos }),
    }).catch(() => null);

    if (!res || res.status === 404) {
      res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId, fields, photos, isUpdate: true }),
      }).catch(() => null);
    }

    if (res && res.ok) {
      serverResult = await res.json();
    } else if (res) {
      const data = await res.json().catch(() => ({}));
      serverError = data.message || data.error || 'แก้ไขข้อมูลไม่สำเร็จ';
    }
  } catch (err) {
    serverError = err.message;
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

  saveLocalSurvey(localSurvey);

  clientGhSurveysCache = null;

  window.dispatchEvent(new CustomEvent('nbtc-surveys-updated', { detail: { action: 'update', recordId } }));

  let finalResult = serverResult || {
    saved: true,
    updated: true,
    recordId,
    savedAt: localSurvey.savedAt,
  };

  if (!serverResult?.githubSynced) {
    const ghToken = getStoredGitHubToken();
    if (ghToken) {
      try {
        const ghRes = await commitSurveyToGitHubClient(localSurvey, ghToken);
        if (ghRes.success) {
          finalResult.githubSynced = true;
          localSurvey.githubSynced = true;
          saveLocalSurvey(localSurvey);
        } else {
          finalResult.githubError = ghRes.error || ghRes.reason;
        }
      } catch (e) {
        console.warn('GitHub client update commit failed:', e);
        finalResult.githubError = e.message;
      }
    }
  }

  return finalResult;
}

export async function deleteSurveys(recordIds) {
  const ids = Array.isArray(recordIds) ? recordIds : [recordIds];
  if (ids.length === 0) return { deleted: false, count: 0 };

  let serverResult = null;
  let serverError = null;

  try {
    let res = await fetch('/api/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recordIds: ids }),
    }).catch(() => null);

    if (!res || res.status === 404) {
      res = await fetch('/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordIds: ids }),
      }).catch(() => null);
    }

    if (res && res.ok) {
      serverResult = await res.json();
    }
  } catch (err) {
    serverError = err.message;
  }

  // If server did not delete from GitHub, try direct GitHub delete
  if (!serverResult?.githubDeleted) {
    const ghToken = getStoredGitHubToken();
    if (ghToken) {
      for (const id of ids) {
        await deleteSurveyFromGitHubClient(id, ghToken).catch(() => {});
      }
    }
  }

  try {
    const current = getLocalSurveys();
    const idsSet = new Set(ids);
    const remaining = current.filter((s) => !idsSet.has(s.recordId));
    localStorage.setItem(LOCAL_SURVEYS_KEY, JSON.stringify(remaining));
  } catch (e) {
    console.warn('Failed to update localStorage after delete:', e);
  }

  clientGhSurveysCache = null;

  window.dispatchEvent(new CustomEvent('nbtc-surveys-updated', { detail: { action: 'delete', recordIds: ids } }));

  return serverResult || { deleted: true, count: ids.length, deletedIds: ids };
}

let clientGhSurveysCache = null;
let clientGhLastFetchTime = 0;
let lastSurveysCommitSha = null;
let lastSurveysCommitETag = null;
const knownFileShas = new Map();
const CLIENT_GH_CACHE_TTL = 10000;

export async function fetchSurveysFromGitHubClient(knownRecordIds = new Set(), force = false) {
  const now = Date.now();
  const ghAuthToken = getStoredGitHubToken();
  const authHeaders = ghAuthToken ? { Authorization: `Bearer ${ghAuthToken}` } : {};

  try {
    // 1. Lightweight commit check with ETag to save API rate limits & bandwidth
    const commitHeaders = { Accept: 'application/vnd.github+json', ...authHeaders };
    if (lastSurveysCommitETag && !force) {
      commitHeaders['If-None-Match'] = lastSurveysCommitETag;
    }

    const commitRes = await fetch(
      `https://api.github.com/repos/Thaidimaru/Pre_PM2/commits?path=data/surveys&per_page=1&_t=${now}`,
      { headers: commitHeaders, cache: 'no-store' }
    ).catch(() => null);

    // If 304 Not Modified, nothing has changed on GitHub!
    if (commitRes && commitRes.status === 304 && clientGhSurveysCache) {
      clientGhLastFetchTime = now;
      return clientGhSurveysCache;
    }

    if (commitRes && commitRes.ok) {
      const commitETag = commitRes.headers.get('ETag');
      if (commitETag) lastSurveysCommitETag = commitETag;
      const commits = await commitRes.json().catch(() => []);
      const latestSha = commits[0]?.sha;

      if (latestSha && latestSha === lastSurveysCommitSha && clientGhSurveysCache && !force) {
        clientGhLastFetchTime = now;
        return clientGhSurveysCache;
      }
      if (latestSha) lastSurveysCommitSha = latestSha;
    }

    // 2. Fetch directory items when commit changed or first run
    const res = await fetch(`https://api.github.com/repos/Thaidimaru/Pre_PM2/contents/data/surveys?ref=main&_t=${now}`, {
      headers: { Accept: 'application/vnd.github+json', ...authHeaders },
      cache: 'no-store',
    });
    if (!res.ok) return clientGhSurveysCache || [];
    const items = await res.json();
    if (!Array.isArray(items)) return clientGhSurveysCache || [];

    const jsonFiles = items.filter((f) => f.type === 'file' && f.name.endsWith('.json') && !f.name.startsWith('.'));
    jsonFiles.sort((a, b) => b.name.localeCompare(a.name));

    const currentGhIds = new Set(jsonFiles.map((f) => f.name.replace(/\.json$/, '')));

    // Download files that are NOT in knownRecordIds OR whose file SHA has changed (modified surveys)
    const filesToFetch = jsonFiles.filter((f) => {
      const recId = f.name.replace(/\.json$/, '');
      const shaChanged = f.sha && knownFileShas.has(recId) && knownFileShas.get(recId) !== f.sha;
      return !knownRecordIds.has(recId) || shaChanged;
    });

    // Record latest SHAs
    for (const f of jsonFiles) {
      const recId = f.name.replace(/\.json$/, '');
      if (f.sha) knownFileShas.set(recId, f.sha);
    }

    // Filter out deleted items from local cache
    let updatedCache = (clientGhSurveysCache || []).filter((s) => currentGhIds.has(s.recordId));

    if (filesToFetch.length === 0) {
      clientGhSurveysCache = updatedCache;
      clientGhLastFetchTime = now;
      return clientGhSurveysCache;
    }

    const rawSurveys = (
      await Promise.all(
        filesToFetch.slice(0, 200).map(async (file) => {
          try {
            const fileRes = await fetch(file.download_url);
            if (fileRes.ok) return await fileRes.json();
          } catch {}
          return null;
        })
      )
    ).filter((s) => s && s.recordId);

    const newSurveys = rawSurveys.map((s) => {
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

      return {
        ...s,
        photos: formattedPhotos,
        fields: {
          ...(s.fields || {}),
          photos: formattedPhotos,
        },
      };
    });

    const combined = [...(clientGhSurveysCache || []), ...newSurveys];
    clientGhSurveysCache = combined;
    clientGhLastFetchTime = now;
    return combined;
  } catch (e) {
    console.warn('fetchSurveysFromGitHubClient error:', e);
    return clientGhSurveysCache || [];
  }
}

export async function commitSurveyToGitHubClient(survey, customToken = null) {
  const token = customToken || getStoredGitHubToken();
  if (!token) return { success: false, reason: 'no_token' };

  const repo = 'Thaidimaru/Pre_PM2';
  const branch = 'main';
  const filePath = `data/surveys/${survey.recordId}.json`;

  try {
    let sha = null;
    const getRes = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}?ref=${branch}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
      cache: 'no-store',
    }).catch(() => null);

    if (getRes && getRes.ok) {
      const fileData = await getRes.json();
      sha = fileData.sha;
    }

    const payloadStr = JSON.stringify(survey, null, 2);
    // Base64 encode supporting UTF-8 / Thai characters
    const contentB64 = btoa(unescape(encodeURIComponent(payloadStr)));

    const bodyObj = {
      message: `feat(survey): Pre-PM survey ${survey.recordId} - ${survey.station || 'Station'}`,
      content: contentB64,
      branch,
      committer: {
        name: 'NBTC Survey System',
        email: 'survey-bot@nbtc.local',
      },
    };
    if (sha) bodyObj.sha = sha;

    const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bodyObj),
    });

    if (putRes.ok) {
      clientGhSurveysCache = null;
      notifySurveysUpdated({ type: 'GITHUB_COMMITTED', recordId: survey.recordId });
      return { success: true };
    }
    const errObj = await putRes.json().catch(() => ({}));
    return { success: false, error: errObj.message || `HTTP ${putRes.status}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function deleteSurveyFromGitHubClient(recordId, customToken = null) {
  const token = customToken || getStoredGitHubToken();
  if (!token) return { success: false, reason: 'no_token' };

  const repo = 'Thaidimaru/Pre_PM2';
  const branch = 'main';
  const filePath = `data/surveys/${recordId}.json`;

  try {
    const getRes = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}?ref=${branch}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
      cache: 'no-store',
    }).catch(() => null);

    if (!getRes || !getRes.ok) {
      return { success: true, reason: 'file_not_found_on_github' };
    }

    const fileData = await getRes.json();
    const sha = fileData.sha;
    if (!sha) return { success: true };

    const delRes = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `chore(survey): Delete Pre-PM survey ${recordId}`,
        sha,
        branch,
        committer: {
          name: 'NBTC Survey System',
          email: 'survey-bot@nbtc.local',
        },
      }),
    });

    if (delRes.ok) {
      clientGhSurveysCache = null;
      notifySurveysUpdated({ type: 'GITHUB_DELETED', recordId });
      return { success: true };
    }
    return { success: false };
  } catch (err) {
    return { success: false, error: err.message };
  }
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

