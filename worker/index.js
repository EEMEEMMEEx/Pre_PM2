/**
 * NBTC Microwave — Pre-PM Survey Cloudflare Worker API Proxy
 * Secure Edge API Backend for Survey Data Synchronization
 *
 * Secrets (Set via Cloudflare Dashboard or `wrangler secret put GITHUB_TOKEN`):
 *  - GITHUB_TOKEN: GitHub Personal Access Token (PAT) with `Contents: Read and write`
 *
 * Environment Variables (wrangler.toml):
 *  - GITHUB_REPO: "Thaidimaru/Pre_PM2" (default)
 *  - GITHUB_BRANCH: "main" (default)
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

function decodeBase64ToUtf8(b64) {
  try {
    const raw = atob(b64.replace(/\s/g, ''));
    const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  } catch (e) {
    return '';
  }
}

function encodeUtf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export default {
  async fetch(request, env, ctx) {
    // 0. CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '');
    const repo = env.GITHUB_REPO || 'Thaidimaru/Pre_PM2';
    const branch = env.GITHUB_BRANCH || 'main';
    const authHeader = (request.headers.get('Authorization') || request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
    const token = (env.GITHUB_TOKEN || '').trim() || authHeader;

    // 1. Health check & Service Info
    if (path === '' || path === '/' || path === '/api' || path === '/api/health') {
      return jsonResponse({
        ok: true,
        service: 'NBTC Microwave Survey Cloudflare Worker API',
        configured: Boolean(token),
        repo,
        branch,
        version: '1.0.0',
        timestamp: new Date().toISOString(),
      });
    }

    // 2. GitHub Status Verification
    if (path === '/api/github-status' || path === '/github-status') {
      if (!token) {
        return jsonResponse({
          configured: false,
          valid: false,
          canWrite: false,
          repo,
          branch,
          message: 'ยังไม่ได้ระบุ GITHUB_TOKEN ใน Cloudflare Worker Secrets',
        });
      }

      try {
        const ghRes = await fetch('https://api.github.com/user', {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'NBTC-PrePM-Survey-Cloudflare-Worker',
          },
        });
        if (ghRes.ok) {
          const user = await ghRes.json();
          return jsonResponse({
            configured: true,
            valid: true,
            canWrite: true,
            user: user.login,
            repo,
            branch,
            message: `เชื่อมต่อ GitHub สำเร็จ (${user.login}) ผ่าน Cloudflare Worker`,
          });
        }
        return jsonResponse({
          configured: true,
          valid: false,
          canWrite: false,
          repo,
          branch,
          message: 'GITHUB_TOKEN ใน Cloudflare Worker ไม่ถูกต้องหรือหมดอายุ',
        });
      } catch (err) {
        return jsonResponse({
          configured: true,
          valid: false,
          canWrite: false,
          error: err.message,
          message: `ไม่สามารถตรวจสอบสิทธิ์ GitHub: ${err.message}`,
        });
      }
    }

    // 3. Save Survey Record Endpoint
    if (path === '/api/save' || path === '/save') {
      if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
      if (!token) {
        return jsonResponse(
          { ok: false, error: 'no_token', message: 'Worker ยังไม่มี GITHUB_TOKEN ในระบบ Secret' },
          400
        );
      }

      try {
        const payload = await request.json();
        const fields = payload.fields || {};
        const photos = payload.photos || [];
        let recordId = payload.recordId || fields.recordId;

        if (!recordId) {
          const nowStr = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 15);
          const hexRand = Math.random().toString(16).slice(2, 6);
          recordId = `PM-${nowStr}-${hexRand}`;
        }

        const savedAt = new Date().toISOString();
        const station = fields.station || fields.stationSelect || 'ไม่ระบุสถานี';
        const province = fields.province || '';
        const permit = fields.permit === 'on' ? 'อนุญาต' : (fields.permit || 'ยังไม่ระบุ');

        const formattedPhotos = (photos || []).map((p, idx) => ({
          id: idx + 1,
          name: p.name || `photo_${idx + 1}.jpg`,
          contentType: p.type || p.contentType || 'image/jpeg',
          data: p.data || '',
        }));

        const fullSurveyData = {
          recordId,
          savedAt,
          station,
          province,
          permit,
          fields: {
            ...fields,
            recordId,
            station,
            province,
            permit,
            photos: formattedPhotos,
          },
          photos: formattedPhotos,
        };

        const filePath = `data/surveys/${recordId}.json`;
        const getRes = await fetch(
          `https://api.github.com/repos/${repo}/contents/${filePath}?ref=${branch}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/vnd.github+json',
              'User-Agent': 'NBTC-PrePM-Survey-Cloudflare-Worker',
            },
          }
        );

        let existingSha = null;
        if (getRes.ok) {
          const existingData = await getRes.json();
          existingSha = existingData.sha;
        }

        const contentJson = JSON.stringify(fullSurveyData, null, 2);
        const contentB64 = encodeUtf8ToBase64(contentJson);

        const bodyObj = {
          message: `feat(survey): Pre-PM survey ${recordId} - ${station}`,
          content: contentB64,
          branch,
          committer: {
            name: 'NBTC Survey System',
            email: 'survey-bot@nbtc.local',
          },
        };
        if (existingSha) bodyObj.sha = existingSha;

        const putRes = await fetch(
          `https://api.github.com/repos/${repo}/contents/${filePath}`,
          {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/vnd.github+json',
              'Content-Type': 'application/json',
              'User-Agent': 'NBTC-PrePM-Survey-Cloudflare-Worker',
            },
            body: JSON.stringify(bodyObj),
          }
        );

        if (putRes.ok) {
          const putData = await putRes.json();
          return jsonResponse({
            saved: true,
            recordId,
            savedAt,
            githubSynced: true,
            commitUrl: putData?.commit?.html_url || '',
            sha: putData?.content?.sha || '',
          });
        }

        const errData = await putRes.json().catch(() => ({}));
        return jsonResponse(
          {
            saved: false,
            recordId,
            error: errData.message || `GitHub error ${putRes.status}`,
            githubSynced: false,
          },
          putRes.status
        );
      } catch (err) {
        return jsonResponse({ saved: false, error: err.message }, 500);
      }
    }

    // 4. Update Survey Record Endpoint
    if (path === '/api/update' || path === '/update') {
      if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
      if (!token) return jsonResponse({ ok: false, error: 'no_token' }, 400);

      try {
        const payload = await request.json();
        const recordId = payload.recordId || payload.fields?.recordId;
        if (!recordId) return jsonResponse({ error: 'Missing recordId' }, 400);

        const fields = payload.fields || {};
        const photos = payload.photos || [];
        const filePath = `data/surveys/${recordId}.json`;

        const getRes = await fetch(
          `https://api.github.com/repos/${repo}/contents/${filePath}?ref=${branch}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/vnd.github+json',
              'User-Agent': 'NBTC-PrePM-Survey-Cloudflare-Worker',
            },
          }
        );

        let existingSha = null;
        let baseSurvey = {};
        if (getRes.ok) {
          const existingData = await getRes.json();
          existingSha = existingData.sha;
          if (existingData.content) {
            try {
              baseSurvey = JSON.parse(decodeBase64ToUtf8(existingData.content));
            } catch (e) {}
          }
        }

        const updatedSurvey = {
          ...baseSurvey,
          recordId,
          updatedAt: new Date().toISOString(),
          station: fields.station || fields.stationSelect || baseSurvey.station || 'ไม่ระบุสถานี',
          province: fields.province || baseSurvey.province || '',
          permit: fields.permit === 'on' ? 'อนุญาต' : (fields.permit || baseSurvey.permit || 'ยังไม่ระบุ'),
          fields: {
            ...(baseSurvey.fields || {}),
            ...fields,
            recordId,
          },
        };

        if (photos && photos.length > 0) {
          updatedSurvey.photos = photos.map((p, idx) => ({
            id: idx + 1,
            name: p.name || `photo_${idx + 1}.jpg`,
            contentType: p.type || p.contentType || 'image/jpeg',
            data: p.data || '',
          }));
        }

        const contentJson = JSON.stringify(updatedSurvey, null, 2);
        const contentB64 = encodeUtf8ToBase64(contentJson);

        const bodyObj = {
          message: `fix(survey): Update Pre-PM survey ${recordId}`,
          content: contentB64,
          branch,
          committer: {
            name: 'NBTC Survey System',
            email: 'survey-bot@nbtc.local',
          },
        };
        if (existingSha) bodyObj.sha = existingSha;

        const putRes = await fetch(
          `https://api.github.com/repos/${repo}/contents/${filePath}`,
          {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/vnd.github+json',
              'Content-Type': 'application/json',
              'User-Agent': 'NBTC-PrePM-Survey-Cloudflare-Worker',
            },
            body: JSON.stringify(bodyObj),
          }
        );

        if (putRes.ok) {
          return jsonResponse({
            saved: true,
            updated: true,
            recordId,
            githubSynced: true,
          });
        }
        const errData = await putRes.json().catch(() => ({}));
        return jsonResponse({ saved: false, error: errData.message }, putRes.status);
      } catch (err) {
        return jsonResponse({ saved: false, error: err.message }, 500);
      }
    }

    // 5. Delete Survey Record Endpoint
    if (path === '/api/delete' || path === '/delete') {
      if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
      if (!token) return jsonResponse({ ok: false, error: 'no_token' }, 400);

      try {
        const payload = await request.json();
        let recordIds = payload.recordIds;
        if (!recordIds && payload.recordId) recordIds = [payload.recordId];
        if (!Array.isArray(recordIds) || recordIds.length === 0) {
          return jsonResponse({ error: 'Missing recordIds' }, 400);
        }

        const deletedIds = [];
        const failed = [];

        for (const id of recordIds) {
          const filePath = `data/surveys/${id}.json`;
          const getRes = await fetch(
            `https://api.github.com/repos/${repo}/contents/${filePath}?ref=${branch}`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
                'User-Agent': 'NBTC-PrePM-Survey-Cloudflare-Worker',
              },
            }
          );
          if (!getRes.ok) {
            deletedIds.push(id);
            continue;
          }
          const existingData = await getRes.json();
          const sha = existingData.sha;
          if (!sha) {
            deletedIds.push(id);
            continue;
          }

          const delRes = await fetch(
            `https://api.github.com/repos/${repo}/contents/${filePath}`,
            {
              method: 'DELETE',
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
                'Content-Type': 'application/json',
                'User-Agent': 'NBTC-PrePM-Survey-Cloudflare-Worker',
              },
              body: JSON.stringify({
                message: `chore(survey): Delete Pre-PM survey ${id}`,
                sha,
                branch,
                committer: {
                  name: 'NBTC Survey System',
                  email: 'survey-bot@nbtc.local',
                },
              }),
            }
          );

          if (delRes.ok) {
            deletedIds.push(id);
          } else {
            const errData = await delRes.json().catch(() => ({}));
            failed.push({ id, error: errData.message });
          }
        }

        return jsonResponse({
          deleted: true,
          count: deletedIds.length,
          deletedIds,
          failed,
          githubDeleted: failed.length === 0,
        });
      } catch (err) {
        return jsonResponse({ deleted: false, error: err.message }, 500);
      }
    }

    return jsonResponse({ error: 'Endpoint not found' }, 404);
  },
};
