/**
 * Centralized API service for NBTC Microwave Pre-PM Survey Control Room
 * Provides dual-layer persistence (Serverless backend + LocalStorage client cache)
 */

const LOCAL_SURVEYS_KEY = 'nbtc_pre_pm_saved_surveys';
const SURVEY_RESET_DATE = '2026-10-05T00:00:00.000Z';

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
  } catch (e) {
    console.warn('Failed to save survey to localStorage:', e);
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
    if (s && (s.recordId || s.station)) {
      surveyMap.set(s.recordId || s.station, s);
    }
  }

  // Merge client local surveys
  for (const ls of localSurveys) {
    if (!ls) continue;
    const key = ls.recordId || ls.station;
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

export async function fetchDashboardData() {
  let serverData = null;
  try {
    const res = await fetch('/api/dashboard', { cache: 'no-store' });
    if (res.ok) {
      serverData = await res.json();
    }
  } catch (err) {
    console.warn('Failed to fetch dashboard metrics from server:', err);
  }

  const localSurveys = getLocalSurveys();

  // If server responded with valid survey metrics, prioritize server data + local pending surveys
  if (serverData && Array.isArray(serverData.recent)) {
    return mergeDashboardWithLocal(serverData, localSurveys);
  }

  // Fallback: If server is completely unavailable (offline / preview mode), fetch from GitHub client
  const ghSurveys = await fetchSurveysFromGitHubClient().catch(() => []);
  const combinedSurveys = [...ghSurveys, ...localSurveys];
  const merged = mergeDashboardWithLocal(serverData, combinedSurveys);

  return merged;
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

  if (serverError && !serverResult) {
    console.warn('Server save had issue, saved to local cache:', serverError);
  }

  return finalResult;
}

let clientGhSurveysCache = null;
let clientGhLastFetchTime = 0;
const CLIENT_GH_CACHE_TTL = 60000;

export async function fetchSurveysFromGitHubClient() {
  const now = Date.now();
  if (clientGhSurveysCache && (now - clientGhLastFetchTime) < CLIENT_GH_CACHE_TTL) {
    return clientGhSurveysCache;
  }
  try {
    const res = await fetch('https://api.github.com/repos/Thaidimaru/Pre_PM2/contents/data/surveys?ref=main', {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return clientGhSurveysCache || [];
    const items = await res.json();
    if (!Array.isArray(items)) return clientGhSurveysCache || [];

    const jsonFiles = items.filter((f) => f.type === 'file' && f.name.endsWith('.json') && !f.name.startsWith('.'));
    jsonFiles.sort((a, b) => b.name.localeCompare(a.name));

    const surveys = (
      await Promise.all(
        jsonFiles.slice(0, 500).map(async (file) => {
          try {
            const fileRes = await fetch(file.download_url);
            if (fileRes.ok) return await fileRes.json();
          } catch {}
          return null;
        })
      )
    ).filter((s) => s && s.recordId);

    clientGhSurveysCache = surveys;
    clientGhLastFetchTime = now;
    return surveys;
  } catch (e) {
    console.warn('fetchSurveysFromGitHubClient error:', e);
    return clientGhSurveysCache || [];
  }
}

export async function fetchGitHubStatus() {
  try {
    let res = await fetch('/api/github-status', { cache: 'no-store' }).catch(() => null);
    if (!res || !res.ok) {
      res = await fetch('/github-status', { cache: 'no-store' }).catch(() => null);
    }
    if (res && res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('Failed to check GitHub status:', err);
  }
  return { configured: false, valid: false, repo: 'Thaidimaru/Pre_PM2', branch: 'main' };
}
