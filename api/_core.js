/** NBTC Microwave — Survey Control Room API (Vercel Serverless Function Core) */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const os = require("node:os");
const XLSX = require("xlsx");

const ROOT = fs.existsSync(path.join(process.cwd(), "DATABASE.xlsx"))
  ? process.cwd()
  : (fs.existsSync(path.join(__dirname, "..", "DATABASE.xlsx"))
    ? path.join(__dirname, "..")
    : __dirname);
const PASSWORD_PATH = path.join(ROOT, "access-password.txt");
const DATABASE_XLSX = path.join(ROOT, "DATABASE.xlsx");
const AGWBS_XLSX = path.join(ROOT, "AGWBS.xlsx");
const SEED_SURVEYS_PATH = path.join(ROOT, "data/seed_surveys.json");
const STATIONS_KEY = "stations.json";
const LEGACY_SURVEYS_KEY = "surveys.json";
const SURVEY_PREFIX = "survey/";
const TMP_SURVEY_DIR = path.join(os.tmpdir(), "nbtc-pre-pm-surveys");
const SURVEYS_DIR = path.join(ROOT, "data/surveys");
const GITHUB_TOKEN_PATH = path.join(ROOT, "github-token.txt");
const MAX_PHOTO_DATA_CHARS = 5600000;
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;
const SURVEY_RESET_DATE = "2026-10-05T00:00:00.000Z";

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

function readPassword() {
  if (process.env.FORM_PASSWORD) return process.env.FORM_PASSWORD.trim();
  if (fs.existsSync(PASSWORD_PATH)) {
    return fs.readFileSync(PASSWORD_PATH, "utf8").replace(/^\ufeff/, "").trim();
  }
  return "admin";
}

function issueToken() {
  const payload = Buffer.from(JSON.stringify({
    exp: Date.now() + TOKEN_TTL_MS,
    nonce: crypto.randomBytes(12).toString("hex"),
  })).toString("base64url");
  const signature = crypto.createHmac("sha256", readPassword()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function isAuthorized(event) {
  const headers = event.headers || {};
  const authHeader = headers.authorization || headers.Authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  try {
    const expected = crypto.createHmac("sha256", readPassword()).update(parts[0]).digest("base64url");
    const a = Buffer.from(parts[1]);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    return Number(payload.exp) > Date.now();
  } catch {
    return false;
  }
}

// ==============================================================================
// GitHub Repository Sync (Thaidimaru/Pre_PM2)
// ==============================================================================

function getGitHubToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN.trim();
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN.trim();
  if (process.env.GITHUB_PAT) return process.env.GITHUB_PAT.trim();
  try {
    if (fs.existsSync(GITHUB_TOKEN_PATH)) {
      const val = fs.readFileSync(GITHUB_TOKEN_PATH, "utf8").trim();
      if (val) return val;
    }
  } catch {}
  return "";
}

function getGitHubRepo() {
  return process.env.GITHUB_REPO || "Thaidimaru/Pre_PM2";
}

function getGitHubBranch() {
  return process.env.GITHUB_BRANCH || "main";
}

async function getExistingFileSha(filePath) {
  const token = getGitHubToken();
  if (!token) return null;
  const repo = getGitHubRepo();
  const branch = getGitHubBranch();
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}?ref=${branch}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "NBTC-PrePM-Survey-App",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (res.ok) {
      const data = await res.json();
      return data.sha || null;
    }
  } catch {}
  return null;
}

async function commitSurveyToGitHub(recordId, surveyPayload) {
  const token = getGitHubToken();
  if (!token) {
    return { success: false, reason: "no_token", message: "GITHUB_TOKEN not configured" };
  }
  const repo = getGitHubRepo();
  const branch = getGitHubBranch();
  const filePath = `data/surveys/${recordId}.json`;
  const stationName = surveyPayload.fields?.station || surveyPayload.station || "Station";

  try {
    const existingSha = await getExistingFileSha(filePath);
    const contentBase64 = Buffer.from(JSON.stringify(surveyPayload, null, 2), "utf8").toString("base64");

    const bodyData = {
      message: `feat(survey): Pre-PM survey ${recordId} - ${stationName}`,
      content: contentBase64,
      branch,
      committer: {
        name: "NBTC Survey System",
        email: "survey-bot@nbtc.local",
      },
    };
    if (existingSha) {
      bodyData.sha = existingSha;
    }

    const res = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "NBTC-PrePM-Survey-App",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify(bodyData),
    });

    if (res.ok) {
      const data = await res.json();
      return {
        success: true,
        commitUrl: data.commit?.html_url || "",
        sha: data.content?.sha || "",
      };
    } else {
      const errBody = await res.json().catch(() => ({}));
      console.warn(`GitHub API commit failed (${res.status}):`, errBody);
      const userMessage = res.status === 401
        ? "GitHub Token หมดอายุหรือถูกเพิกถอน (401 Bad credentials) กรุณาอัปเดต Token ใหม่"
        : (errBody.message || "GitHub API commit failed");
      return {
        success: false,
        status: res.status,
        reason: res.status === 401 ? "bad_credentials" : "commit_failed",
        message: userMessage,
      };
    }
  } catch (err) {
    console.error("Error committing survey to GitHub:", err);
    return { success: false, message: err.message };
  }
}

async function deleteSurveyFromGitHub(recordId) {
  const token = getGitHubToken();
  if (!token) return { success: false, reason: "no_token" };
  const repo = getGitHubRepo();
  const branch = getGitHubBranch();
  const filePath = `data/surveys/${recordId}.json`;
  try {
    const sha = await getExistingFileSha(filePath);
    if (!sha) return { success: true, reason: "file_not_found" };
    const res = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "NBTC-PrePM-Survey-App",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        message: `chore(survey): Delete Pre-PM survey ${recordId}`,
        sha,
        branch,
        committer: {
          name: "NBTC Survey System",
          email: "survey-bot@nbtc.local",
        },
      }),
    });
    return { success: res.ok };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

let cachedGitHubSurveys = null;
let lastGitHubFetchTime = 0;
const GITHUB_CACHE_TTL = 30000;

let cachedAuthStatus = null;
let lastAuthStatusTime = 0;
const AUTH_STATUS_CACHE_TTL = 30000;

async function checkGitHubAuth() {
  const token = getGitHubToken();
  const repo = getGitHubRepo();
  const branch = getGitHubBranch();

  if (!token) {
    return {
      configured: false,
      valid: false,
      reason: "no_token",
      message: "ยังไม่ได้ระบุ GITHUB_TOKEN บน Vercel หรือเซิร์ฟเวอร์",
      repo,
      branch,
    };
  }

  const now = Date.now();
  if (cachedAuthStatus && (now - lastAuthStatusTime) < AUTH_STATUS_CACHE_TTL) {
    return cachedAuthStatus;
  }

  try {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "NBTC-PrePM-Survey-App",
      },
    });

    if (res.ok) {
      const data = await res.json();
      cachedAuthStatus = {
        configured: true,
        valid: true,
        user: data.login || "authorized",
        message: "เชื่อมต่อ GitHub สำเร็จ",
        repo,
        branch,
      };
    } else if (res.status === 401) {
      cachedAuthStatus = {
        configured: true,
        valid: false,
        reason: "bad_credentials",
        message: "GitHub Token หมดอายุหรือถูกเพิกถอน (401 Bad credentials) กรุณาอัปเดต Token ใหม่",
        repo,
        branch,
      };
    } else {
      cachedAuthStatus = {
        configured: true,
        valid: false,
        reason: "http_error",
        status: res.status,
        message: `GitHub API error: HTTP ${res.status}`,
        repo,
        branch,
      };
    }
  } catch (err) {
    cachedAuthStatus = {
      configured: true,
      valid: false,
      reason: "network_error",
      message: `ไม่สามารถเชื่อมต่อ GitHub ได้: ${err.message}`,
      repo,
      branch,
    };
  }

  lastAuthStatusTime = now;
  return cachedAuthStatus;
}

async function fetchSurveysFromGitHub() {
  const token = getGitHubToken();
  const repo = getGitHubRepo();
  const branch = getGitHubBranch();

  const now = Date.now();
  if (cachedGitHubSurveys && (now - lastGitHubFetchTime) < GITHUB_CACHE_TTL) {
    return cachedGitHubSurveys;
  }

  const reqHeaders = {
    Accept: "application/vnd.github+json",
    "User-Agent": "NBTC-PrePM-Survey-App",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) {
    reqHeaders["Authorization"] = `Bearer ${token}`;
  }

  let tokenRejected = false;
  try {
    let res = await fetch(`https://api.github.com/repos/${repo}/contents/data/surveys?ref=${branch}`, {
      headers: reqHeaders,
    });

    if (res.status === 401 && token) {
      tokenRejected = true;
      console.warn("GitHub token rejected with 401 (Bad credentials). Falling back to public unauthenticated request.");
      const publicHeaders = {
        Accept: "application/vnd.github+json",
        "User-Agent": "NBTC-PrePM-Survey-App",
        "X-GitHub-Api-Version": "2022-11-28",
      };
      res = await fetch(`https://api.github.com/repos/${repo}/contents/data/surveys?ref=${branch}`, {
        headers: publicHeaders,
      });
    }

    if (!res.ok) {
      return cachedGitHubSurveys || [];
    }

    const items = await res.json();
    if (!Array.isArray(items)) return [];

    const jsonFiles = items.filter((f) => f.type === "file" && f.name.endsWith(".json") && !f.name.startsWith("."));
    jsonFiles.sort((a, b) => b.name.localeCompare(a.name));

    const surveys = (await Promise.all(
      jsonFiles.slice(0, 500).map(async (file) => {
        try {
          const fileHeaders = { "User-Agent": "NBTC-PrePM-Survey-App" };
          if (token && !tokenRejected) fileHeaders["Authorization"] = `Bearer ${token}`;
          const fileRes = await fetch(file.download_url, { headers: fileHeaders });
          if (fileRes.ok) {
            return await fileRes.json();
          }
        } catch {}
        return null;
      })
    )).filter((s) => s && s.recordId);

    cachedGitHubSurveys = surveys;
    lastGitHubFetchTime = now;
    return surveys;
  } catch (e) {
    console.warn("fetchSurveysFromGitHub error:", e);
    return cachedGitHubSurveys || [];
  }
}

const memoryStore = new Map();

async function kvGet(key) {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return null;
  try {
    const res = await fetch(`${process.env.KV_REST_API_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.result) return null;
    return typeof json.result === "string" ? JSON.parse(json.result) : json.result;
  } catch {
    return null;
  }
}

async function kvSet(key, value) {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return false;
  try {
    const res = await fetch(`${process.env.KV_REST_API_URL}/set/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(typeof value === "string" ? value : JSON.stringify(value)),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function kvKeys(pattern) {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return [];
  try {
    const res = await fetch(`${process.env.KV_REST_API_URL}/keys/${encodeURIComponent(pattern)}`, {
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    });
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json.result) ? json.result : [];
  } catch {
    return [];
  }
}

async function readJson(key, fallback = null) {
  // 1. Check Vercel KV if connected
  const kvVal = await kvGet(key);
  if (kvVal != null) {
    memoryStore.set(key, kvVal);
    return kvVal;
  }

  // 2. Check memory store
  if (memoryStore.has(key)) {
    return memoryStore.get(key);
  }

  // 3. Check TMP_SURVEY_DIR on disk
  try {
    const safeFilename = `${encodeURIComponent(key).replace(/[*"\/\\<>:|?]/g, "_")}.json`;
    const filePath = path.join(TMP_SURVEY_DIR, safeFilename);
    if (fs.existsSync(filePath)) {
      const val = JSON.parse(fs.readFileSync(filePath, "utf8"));
      memoryStore.set(key, val);
      return val;
    }
  } catch {}

  return fallback;
}

async function writeJson(key, value) {
  // 1. Persist to Vercel KV if available
  await kvSet(key, value);

  // 2. Persist to memory store
  memoryStore.set(key, value);

  // 3. Persist to TMP_SURVEY_DIR on disk
  try {
    if (!fs.existsSync(TMP_SURVEY_DIR)) {
      fs.mkdirSync(TMP_SURVEY_DIR, { recursive: true });
    }
    const safeFilename = `${encodeURIComponent(key).replace(/[*"\/\\<>:|?]/g, "_")}.json`;
    fs.writeFileSync(path.join(TMP_SURVEY_DIR, safeFilename), JSON.stringify(value), "utf8");
  } catch (err) {
    console.warn("Could not write to TMP_SURVEY_DIR:", err);
  }

  // 4. Persist to data/surveys on disk if it is a survey object
  if (key.startsWith(SURVEY_PREFIX) && value && value.recordId) {
    try {
      if (!fs.existsSync(SURVEYS_DIR)) {
        fs.mkdirSync(SURVEYS_DIR, { recursive: true });
      }
      fs.writeFileSync(path.join(SURVEYS_DIR, `${value.recordId}.json`), JSON.stringify(value, null, 2), "utf8");
    } catch {}
  }
}

async function deleteJson(key) {
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      await fetch(`${process.env.KV_REST_API_URL}/del/${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
      });
    } catch {}
  }
  memoryStore.delete(key);
  try {
    const safeFilename = `${encodeURIComponent(key).replace(/[*"\/\\<>:|?]/g, "_")}.json`;
    const filePath = path.join(TMP_SURVEY_DIR, safeFilename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {}
  if (key.startsWith(SURVEY_PREFIX)) {
    const recId = key.slice(SURVEY_PREFIX.length).replace(/\.json$/, "");
    try {
      const p = path.join(SURVEYS_DIR, `${recId}.json`);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch {}
  }
}

function loadLocalSurveys() {
  const localSurveys = [];
  const seen = new Set();

  // 1. Load from data/seed_surveys.json
  try {
    if (fs.existsSync(SEED_SURVEYS_PATH)) {
      const items = JSON.parse(fs.readFileSync(SEED_SURVEYS_PATH, "utf8"));
      if (Array.isArray(items)) {
        for (const item of items) {
          if (item && item.recordId && !seen.has(item.recordId)) {
            seen.add(item.recordId);
            localSurveys.push({
              recordId: item.recordId,
              savedAt: item.savedAt || new Date().toISOString(),
              fields: item.fields || {},
              photos: item.photos || [],
            });
          }
        }
      }
    }
  } catch (e) {
    console.warn("Could not read SEED_SURVEYS_PATH:", e);
  }

  // 2. Load from survey-*.json in ROOT
  try {
    const files = fs.readdirSync(ROOT).filter((f) => f.startsWith("survey-") && f.endsWith(".json"));
    for (const file of files) {
      try {
        const content = JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
        const recordId = content.recordId || file.replace(/\.json$/, "");
        if (!seen.has(recordId)) {
          seen.add(recordId);
          localSurveys.push({
            recordId,
            savedAt: content.savedAt || new Date().toISOString(),
            fields: content.fields || {},
            photos: content.photos || [],
          });
        }
      } catch {}
    }
  } catch {}

  // 3. Load from data/surveys/*.json
  try {
    if (fs.existsSync(SURVEYS_DIR)) {
      const sFiles = fs.readdirSync(SURVEYS_DIR).filter((f) => f.endsWith(".json"));
      for (const sf of sFiles) {
        try {
          const content = JSON.parse(fs.readFileSync(path.join(SURVEYS_DIR, sf), "utf8"));
          const recordId = content.recordId || sf.replace(/\.json$/, "");
          if (!seen.has(recordId)) {
            seen.add(recordId);
            localSurveys.push({
              recordId,
              savedAt: content.savedAt || new Date().toISOString(),
              fields: content.fields || {},
              photos: content.photos || [],
            });
          }
        } catch {}
      }
    }
  } catch (e) {
    console.warn("Could not read SURVEYS_DIR:", e);
  }

  return localSurveys;
}

let memoryStationsCache = null;
let memoryStationsMtime = 0;

async function getStations() {
  if (fs.existsSync(DATABASE_XLSX)) {
    try {
      const stat = fs.statSync(DATABASE_XLSX);
      if (memoryStationsCache && memoryStationsMtime === stat.mtimeMs) {
        return memoryStationsCache;
      }
    } catch {}
  } else if (memoryStationsCache) {
    return memoryStationsCache;
  }

  const cached = await readJson(STATIONS_KEY, null);
  if (!fs.existsSync(DATABASE_XLSX) && Array.isArray(cached) && cached.length) return cached;

  const stations = [];
  const existingNames = new Set();

  if (fs.existsSync(DATABASE_XLSX)) {
    try {
      const workbook = XLSX.readFile(DATABASE_XLSX, { cellDates: false });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "" });

      // Dynamic header row and column mapping
      let headerIdx = -1;
      const colMap = {};
      for (let i = 0; i < Math.min(5, rows.length); i++) {
        const rowStr = (rows[i] || []).map((c) => String(c || "")).join(" ");
        if (rowStr.includes("หมู่บ้าน") || rowStr.includes("สถานี")) {
          headerIdx = i;
          rows[i].forEach((col, idx) => {
            const val = String(col || "").replace(/\s+/g, "");
            if (val.includes("หมู่บ้าน") || val.includes("สถานี")) colMap.village = idx;
            else if (val.includes("ตำบล")) colMap.subdistrict = idx;
            else if (val.includes("อำเภอ")) colMap.district = idx;
            else if (val.includes("จังหวัด")) colMap.province = idx;
            else if (val.includes("พื้นที่ตั้งเสา") || val.includes("สถานที่ติดตั้ง")) colMap.installation_place = idx;
            else if (val.includes("พื้นที่วางเครื่อง") || val.includes("สถานที่วางเครื่อง")) colMap.equipment_place = idx;
            else if (val.includes("เจ้าหน้าที่") || val.includes("ชื่อ")) colMap.contact_name = idx;
            else if (val.includes("ตำแหน่ง")) colMap.contact_position = idx;
            else if (val.includes("โทร") || val.includes("เบอร์")) colMap.contact_phone = idx;
            else if (val.includes("บ้านเลขที่")) colMap.house_no = idx;
          });
          break;
        }
      }

      if (headerIdx !== -1 && colMap.village !== undefined) {
        for (const row of rows.slice(headerIdx + 1)) {
          if (!row[colMap.village]) continue;
          const name = normalizeStationKey(String(row[colMap.village]).trim());
          if (!name || existingNames.has(name)) continue;
          if (name.includes("หมายเหตุ") || name.startsWith("ลำดับที่")) continue;
          const torVal = row[0];
          if (typeof torVal === "string" && torVal.includes("หมายเหตุ")) continue;

          existingNames.add(name);
          stations.push({
            id: stations.length + 1,
            village: name,
            subdistrict: colMap.subdistrict !== undefined ? String(row[colMap.subdistrict] || "").trim() : "",
            district: colMap.district !== undefined ? String(row[colMap.district] || "").trim() : "",
            province: colMap.province !== undefined ? String(row[colMap.province] || "").trim() : "",
            installation_place: colMap.installation_place !== undefined ? String(row[colMap.installation_place] || "").trim() : "",
            equipment_place: colMap.equipment_place !== undefined ? String(row[colMap.equipment_place] || "").trim() : "",
            contact_name: colMap.contact_name !== undefined ? String(row[colMap.contact_name] || "").trim() : "",
            contact_position: colMap.contact_position !== undefined ? String(row[colMap.contact_position] || "").trim() : "",
            contact_phone: colMap.contact_phone !== undefined ? String(row[colMap.contact_phone] || "").trim() : "",
            house_no: colMap.house_no !== undefined ? String(row[colMap.house_no] || "").trim() : "",
          });
        }
      }
    } catch (e) {
      console.error("Error reading DATABASE.xlsx:", e);
    }
  }

  if (fs.existsSync(AGWBS_XLSX)) {
    try {
      const workbook = XLSX.readFile(AGWBS_XLSX, { cellDates: false });
      const sheetName = workbook.SheetNames.includes("BSGW") ? "BSGW" : workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      const startIdx = rows.length > 0 && String(rows[0][0]).includes("สถานี") ? 1 : 0;

      for (const row of rows.slice(startIdx)) {
        if (!row[0]) continue;
        const name = String(row[0]).trim();
        if (!name || name === "สถานี" || existingNames.has(name)) continue;
        existingNames.add(name);
        stations.push({
          id: stations.length + 1,
          village: name,
          subdistrict: String(row[1] || "").trim(),
          district: String(row[2] || "").trim(),
          province: String(row[3] || "").trim(),
          installation_place: "",
          equipment_place: "",
          contact_name: "",
          contact_position: "",
        });
      }
    } catch (e) {
      console.error("Error reading AGWBS.xlsx:", e);
    }
  }

  if (stations.length) {
    await writeJson(STATIONS_KEY, stations);
    memoryStationsCache = stations;
    if (fs.existsSync(DATABASE_XLSX)) {
      try {
        memoryStationsMtime = fs.statSync(DATABASE_XLSX).mtimeMs;
      } catch {}
    }
  }
  return stations;
}

async function getAllSurveys() {
  const surveys = [];
  const seenIds = new Set();

  // 0. Local static surveys & data/surveys/*.json (bundled on disk)
  try {
    const diskSurveys = loadLocalSurveys();
    for (const s of diskSurveys) {
      if (s && s.recordId && !seenIds.has(s.recordId)) {
        seenIds.add(s.recordId);
        surveys.push(s);
        memoryStore.set(`${SURVEY_PREFIX}${s.recordId}.json`, s);
      }
    }
  } catch (e) {
    console.warn("loadLocalSurveys error:", e);
  }

  // 1. GitHub Repository Surveys (Thaidimaru/Pre_PM2)
  try {
    const ghSurveys = await fetchSurveysFromGitHub();
    for (const s of ghSurveys) {
      if (s && s.recordId && !seenIds.has(s.recordId)) {
        seenIds.add(s.recordId);
        surveys.push(s);
        memoryStore.set(`${SURVEY_PREFIX}${s.recordId}.json`, s);
      }
    }
  } catch {}

  // 1. Vercel KV Store
  try {
    const kvSurveyKeys = await kvKeys(`${SURVEY_PREFIX}*`);
    if (Array.isArray(kvSurveyKeys) && kvSurveyKeys.length > 0) {
      const kvSurveys = (await Promise.all(kvSurveyKeys.map((k) => kvGet(k)))).filter(Boolean);
      for (const s of kvSurveys) {
        if (s && s.recordId && !seenIds.has(s.recordId)) {
          seenIds.add(s.recordId);
          surveys.push(s);
          memoryStore.set(`${SURVEY_PREFIX}${s.recordId}.json`, s);
        }
      }
    }
  } catch {}

  // 2. Memory Store
  for (const [key, val] of memoryStore.entries()) {
    if (key.startsWith(SURVEY_PREFIX) && val && typeof val === "object") {
      const recordId = val.recordId || key.replace(SURVEY_PREFIX, "").replace(/\.json$/, "");
      if (!seenIds.has(recordId)) {
        seenIds.add(recordId);
        surveys.push(val);
      }
    }
  }

  // 3. TMP_SURVEY_DIR Files
  try {
    if (fs.existsSync(TMP_SURVEY_DIR)) {
      const files = fs.readdirSync(TMP_SURVEY_DIR).filter((f) => f.endsWith(".json"));
      for (const file of files) {
        try {
          const val = JSON.parse(fs.readFileSync(path.join(TMP_SURVEY_DIR, file), "utf8"));
          if (val && typeof val === "object") {
            const recordId = val.recordId || file.replace(/\.json$/, "");
            if (!seenIds.has(recordId)) {
              seenIds.add(recordId);
              surveys.push(val);
              memoryStore.set(`${SURVEY_PREFIX}${recordId}.json`, val);
            }
          }
        } catch {}
      }
    }
  } catch {}

  // 4. Local static surveys in ROOT (survey-*.json)
  try {
    const rootSurveys = loadLocalSurveys();
    for (const s of rootSurveys) {
      if (s && s.recordId && !seenIds.has(s.recordId)) {
        seenIds.add(s.recordId);
        surveys.push(s);
      }
    }
  } catch {}

  return surveys
    .filter((s) => s && s.savedAt && s.savedAt >= SURVEY_RESET_DATE)
    .sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || "")));
}

const STATION_ALIASES = {
  "หมู่ 10 สำราญเหนือ (ศรีสุขสำราญ)": "หมู่ 10 บ้านสำราญเหนือ",
  "หมู่ 8 วังหยี (เหมกน้อย)": "หมู่ 8 บ้านเหมกน้อย",
  "หมู่ 8 ทุ่งเอื้อง (ลำขนุน)": "หมู่ 8 บ้านลำขนุน",
  "หมู่ 10 หน้าโกฏิ (หัวดอน)": "หมู่ 10 หัวดอน",
  "หมู่ 6 บางอุดม (บางมะขาม)": "หมู่ 6 บางมะขาม",
  "หมู่ 9 บางคณฑี (น้ำทรัพย์)": "หมู่ 9 น้ำทรัพย์",
  "หมู่ 7 บ้านใหม่วังเรือง (บ้านใหม่วังเรือน)": "หมู่ 7 บ้านใหม่วังเรือง",
  "หมู่ 13 วังคำแพง (วังกำแพง)": "หมู่ 13 บ้านวังกำแพง",
  "หมู่ 6 บ้านเกาะแก้วอนุสรณ์": "หมู่ 6 บ้านเกาะแก้ว",
  "หมู่ 5 บ้านตากฟ้า": "หมู่ 5 ตากฟ้า",
  "หมู่ 1 ลาดแคใต้": "หมู่ 1 บ้านลาดแค",
  "หมู่ 14 หนองใหญ่ใต้": "หมู่ 14 บ้านหนองใหญ่โต",
  "หมู่ 17 คลองโปร่ง": "หมู่ 17 บ้านคลองโป่ง",
};

const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";
function normalizeStationKey(name) {
  return String(name || "")
    .trim()
    .replace(/[๑๒๓๔๕๖๗๘๙๐]/g, (d) => THAI_DIGITS.indexOf(d))
    .replace(/\s+/g, " ");
}

function findStation(stations, fields) {
  let name = String(fields.station || fields.stationSelect || "").trim();
  if (!name) return null;
  const targetName = STATION_ALIASES[name] || name;
  const normTarget = normalizeStationKey(targetName);
  const normRaw = normalizeStationKey(name);

  return (
    stations.find((s) => String(s.village).trim() === targetName) ||
    stations.find((s) => normalizeStationKey(s.village) === normTarget) ||
    stations.find((s) => String(s.village).trim() === name) ||
    stations.find((s) => normalizeStationKey(s.village) === normRaw) ||
    null
  );
}

async function getSurveyById(recordId) {
  if (!recordId) return null;
  const safeId = String(recordId).trim().replace(/[^a-zA-Z0-9_-]/g, "");
  const diskPath = path.join(SURVEYS_DIR, `${safeId}.json`);
  if (fs.existsSync(diskPath)) {
    try {
      return JSON.parse(fs.readFileSync(diskPath, "utf8"));
    } catch {}
  }
  const mem = memoryStore.get(`${SURVEY_PREFIX}${safeId}.json`);
  if (mem) return mem;
  const all = await getAllSurveys();
  return all.find((s) => s.recordId === recordId) || null;
}

async function getDashboardData() {
  const [stations, surveys] = await Promise.all([getStations(), getAllSurveys()]);
  const provinceCounts = new Map();
  let allowed = 0;
  let denied = 0;

  for (const survey of surveys) {
    const fields = survey.fields || {};
    const station = findStation(stations, fields);
    const province = station?.province || String(fields.province || "ไม่ระบุจังหวัด");
    provinceCounts.set(province, (provinceCounts.get(province) || 0) + 1);
    if (fields.permit === "อนุญาต" || fields.permit === "on") allowed++;
    else if (fields.permit === "ไม่อนุญาต") denied++;
  }

  const recent = surveys.map((survey) => {
    const fields = survey.fields || {};
    const station = findStation(stations, fields);
    const stationName = station?.village || fields.station || fields.stationSelect || "ไม่ระบุสถานี";
    const province = station?.province || fields.province || "ไม่ระบุจังหวัด";
    const mergedFields = {
      station: stationName,
      subdistrict: station?.subdistrict || fields.subdistrict || "",
      district: station?.district || fields.district || "",
      province: province,
      installationPlace: station?.installation_place || fields.installationPlace || "",
      equipmentPlace: station?.equipment_place || fields.equipmentPlace || "",
      contactName: station?.contact_name || fields.contactName || "",
      contactPosition: station?.contact_position || fields.contactPosition || "",
      contactPhone: station?.contact_phone || fields.contactPhone || fields.contact_phone || "",
      ...fields,
    };
    if (!mergedFields.installationPlace && station?.installation_place) {
      mergedFields.installationPlace = station.installation_place;
    }
    if (!mergedFields.equipmentPlace && station?.equipment_place) {
      mergedFields.equipmentPlace = station.equipment_place;
    }
    if (!mergedFields.contactName && station?.contact_name) {
      mergedFields.contactName = station.contact_name;
    }
    if (!mergedFields.contactPosition && station?.contact_position) {
      mergedFields.contactPosition = station.contact_position;
    }
    if (!mergedFields.contactPhone && station?.contact_phone) {
      mergedFields.contactPhone = station.contact_phone;
    }
    if (!mergedFields.subdistrict && station?.subdistrict) {
      mergedFields.subdistrict = station.subdistrict;
    }
    if (!mergedFields.district && station?.district) {
      mergedFields.district = station.district;
    }

    const photos = (survey.photos || []).map((p, idx) => ({
      id: idx + 1,
      name: p.name || `photo_${idx + 1}.jpg`,
      contentType: p.type || "image/jpeg",
      size: p.data ? Math.round((p.data.length * 3) / 4) : (p.size || 0),
      url: `/api/photo?recordId=${encodeURIComponent(survey.recordId)}&index=${idx}`,
    }));
    mergedFields.photos = photos;

    return {
      recordId: survey.recordId,
      savedAt: survey.savedAt,
      station: stationName,
      province: province,
      permit: fields.permit === "on" ? "อนุญาต" : fields.permit || "ยังไม่ระบุ",
      fields: mergedFields,
      photos,
    };
  });

  return {
    updatedAt: new Date().toISOString(),
    stats: { surveys: surveys.length, stations: stations.length, allowed, denied },
    provinces: [...provinceCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count })),
    recent,
  };
}

exports.handler = async (event) => {
  try {
    const rawPath = event.path || "";
    const cleanPath = rawPath.replace(/\/{2,}/g, "/").replace(/\/$/, "");
    const parts = cleanPath.split("/").filter(Boolean);
    const route = parts.pop() || "";

    if (event.httpMethod === "POST" && route === "login") {
      return json(200, { token: "public", ok: true });
    }

    if (event.httpMethod === "GET" && route === "dashboard") {
      return json(200, await getDashboardData());
    }

    if (event.httpMethod === "GET" && route === "database") {
      return json(200, { stations: await getStations() });
    }

    if (event.httpMethod === "GET" && route === "github-status") {
      const status = await checkGitHubAuth();
      return json(200, status);
    }

    if (event.httpMethod === "GET" && (route === "photo" || route === "photos" || cleanPath.includes("/photos/"))) {
      const q = event.queryStringParameters || {};
      const recordId = q.recordId || q.id || "";
      const index = parseInt(q.index || "0", 10);
      let photo = null;

      if (recordId) {
        const survey = await getSurveyById(recordId);
        if (survey && Array.isArray(survey.photos)) {
          if (q.name) {
            photo = survey.photos.find((p) => p.name === q.name) || survey.photos[index];
          } else {
            photo = survey.photos[index];
          }
        }
      } else {
        const photoName = decodeURIComponent(parts[parts.length - 1] || "");
        if (photoName) {
          const all = await getAllSurveys();
          for (const s of all) {
            if (Array.isArray(s.photos)) {
              const found = s.photos.find((p) => p.name === photoName);
              if (found) {
                photo = found;
                break;
              }
            }
          }
        }
      }

      if (!photo) {
        return {
          statusCode: 404,
          headers: { "Content-Type": "text/plain" },
          body: "Photo not found",
        };
      }
      const contentType = photo.type || "image/jpeg";
      const base64Data = photo.data || "";
      const isDownload = q.download === "1" || q.dl === "1";
      const fileName = encodeURIComponent(photo.name || `photo_${index + 1}.jpg`);
      return {
        statusCode: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=86400, s-maxage=86400",
          "Content-Disposition": isDownload ? `attachment; filename*=UTF-8''${fileName}` : "inline",
        },
        body: base64Data,
        isBase64Encoded: true,
      };
    }

    if (event.httpMethod === "GET" && route === "survey") {
      const q = event.queryStringParameters || {};
      const recordId = q.recordId || q.id || "";
      const survey = await getSurveyById(recordId);
      if (!survey) {
        return json(404, { error: "not_found", message: "Survey not found" });
      }
      return json(200, survey);
    }

    if ((event.httpMethod === "POST" || event.httpMethod === "PUT") && (route === "save" || route === "update")) {
      const payload = JSON.parse(event.body || "{}");
      const fields = payload.fields && typeof payload.fields === "object" ? payload.fields : {};
      const photos = Array.isArray(payload.photos) ? payload.photos : [];
      const recordId = payload.recordId || fields.recordId;
      const isUpdate = route === "update" || Boolean(recordId);

      const existingRecord = isUpdate && recordId ? await getSurveyById(recordId) : null;

      const sanitizedPhotos = photos.map((photo, idx) => {
        let photoData = String(photo?.data || photo?.base64Data || "");
        if (!photoData && existingRecord && Array.isArray(existingRecord.photos)) {
          const matchExisting = existingRecord.photos.find((p) => p.name === photo.name || p.id === photo.id);
          if (matchExisting) photoData = matchExisting.data || "";
        }
        return {
          id: photo?.id || idx + 1,
          name: String(photo?.name || `photo_${idx + 1}.jpg`),
          type: String(photo?.type || photo?.contentType || "image/jpeg"),
          data: photoData,
        };
      });

      const totalPhotoChars = sanitizedPhotos.reduce((sum, photo) => sum + (photo.data?.length || 0), 0);
      if (totalPhotoChars > MAX_PHOTO_DATA_CHARS) {
        return json(413, {
          error: "photos_too_large",
          message: "รูปภาพมีขนาดรวมใหญ่เกินไป กรุณาลดจำนวนหรือขนาดรูปภาพ",
        });
      }

      const finalRecordId = recordId || `PM-${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 15)}-${crypto.randomBytes(2).toString("hex")}`;
      const savedAt = existingRecord?.savedAt || new Date().toISOString();
      const updatedAt = new Date().toISOString();
      const stationName = fields.station || fields.stationSelect || "ไม่ระบุสถานี";
      const province = fields.province || "";
      const permit = fields.permit === "on" ? "อนุญาต" : fields.permit || "ยังไม่ระบุ";

      const surveyRecord = {
        recordId: finalRecordId,
        savedAt,
        updatedAt,
        station: stationName,
        province,
        permit,
        fields,
        photos: sanitizedPhotos,
      };

      await writeJson(`${SURVEY_PREFIX}${finalRecordId}.json`, surveyRecord);

      // Also commit directly to GitHub repository (Thaidimaru/Pre_PM2)
      let ghResult = { success: false, reason: "not_attempted" };
      try {
        ghResult = await commitSurveyToGitHub(finalRecordId, surveyRecord);
      } catch (ghErr) {
        console.warn("GitHub commit error:", ghErr);
      }

      return json(200, {
        saved: true,
        updated: isUpdate,
        recordId: finalRecordId,
        savedAt,
        updatedAt,
        githubSynced: !!ghResult.success,
        commitUrl: ghResult.commitUrl || null,
        githubError: !ghResult.success && ghResult.message ? ghResult.message : null,
      });
    }

    if ((event.httpMethod === "POST" || event.httpMethod === "DELETE") && route === "delete") {
      const payload = JSON.parse(event.body || "{}");
      let recordIds = payload.recordIds;
      if (!recordIds && payload.recordId) recordIds = [payload.recordId];
      if (!Array.isArray(recordIds) || recordIds.length === 0) {
        return json(400, { error: "bad_request", message: "Missing recordIds or recordId" });
      }

      for (const recId of recordIds) {
        await deleteJson(`${SURVEY_PREFIX}${recId}.json`);
        try {
          await deleteSurveyFromGitHub(recId);
        } catch (e) {
          console.warn("GitHub delete error:", e);
        }
      }

      return json(200, {
        deleted: true,
        count: recordIds.length,
        deletedIds: recordIds,
      });
    }

    if (event.httpMethod === "DELETE" && route === "survey") {
      const q = event.queryStringParameters || {};
      const recordId = q.recordId || q.id || "";
      if (!recordId) {
        return json(400, { error: "bad_request", message: "Missing recordId" });
      }
      await deleteJson(`${SURVEY_PREFIX}${recordId}.json`);
      await deleteSurveyFromGitHub(recordId).catch(() => {});
      return json(200, { deleted: true, count: 1, deletedIds: [recordId] });
    }

    return json(404, { error: "not_found", message: "Endpoint not found" });
  } catch (error) {
    console.error("Survey Control Room API Error:", error);
    return json(500, { error: "server_error", message: error?.message || "Internal server error" });
  }
};
