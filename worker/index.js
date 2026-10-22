/**
 * NBTC Microwave — Pre-PM Survey Cloudflare Worker API Proxy
 * Secure Edge API Backend for Cloudflare D1 Database & GitHub Data Synchronization
 *
 * Cloudflare D1 Binding:
 *  - env.DB: Cloudflare D1 database (pre-pm2-prod)
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
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, If-None-Match',
  'Access-Control-Max-Age': '86400',
};

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      ...extraHeaders,
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

function cleanPhotoMetadata(photos, recordId) {
  return (photos || []).map((p, idx) => {
    const cleanName = (p.name || `photo_${idx + 1}.jpg`).replace(/[/\\?%*:|"<>]/g, '_');
    const fileName = p.fileName || `${recordId}_${cleanName}`;
    const contentType = p.type || p.contentType || 'image/jpeg';
    const size = p.size || 0;
    return {
      id: p.id || idx + 1,
      name: cleanName,
      fileName,
      contentType,
      size,
      url: `/photos/${fileName}`,
    };
  });
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
    const hasD1 = Boolean(env.DB);

    // 1. Health check & Service Info
    if (path === '' || path === '/' || path === '/api' || path === '/api/health') {
      return jsonResponse({
        ok: true,
        service: 'NBTC Microwave Survey Cloudflare Worker API',
        configured: Boolean(token),
        d1Configured: hasD1,
        repo,
        branch,
        version: '2.13.0',
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
          d1Configured: hasD1,
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
            d1Configured: hasD1,
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
          d1Configured: hasD1,
          repo,
          branch,
          message: 'GITHUB_TOKEN ใน Cloudflare Worker ไม่ถูกต้องหรือหมดอายุ',
        });
      } catch (err) {
        return jsonResponse({
          configured: true,
          valid: false,
          canWrite: false,
          d1Configured: hasD1,
          error: err.message,
          message: `ไม่สามารถตรวจสอบสิทธิ์ GitHub: ${err.message}`,
        });
      }
    }

// 2.1 Commit Check Proxy Endpoint (for real-time dashboard sync without client token)
    if (path === '/api/commits' || path === '/commits') {
      if (request.method !== 'GET') return jsonResponse({ error: 'Method not allowed' }, 405);
      const queryPath = url.searchParams.get('path') || 'data/surveys';
      const perPage = url.searchParams.get('per_page') || '1';
      const ifNoneMatch = request.headers.get('if-none-match') || request.headers.get('If-None-Match');

      const ghHeaders = {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'NBTC-PrePM-Survey-Cloudflare-Worker',
      };
      if (token) ghHeaders['Authorization'] = `Bearer ${token}`;
      if (ifNoneMatch) ghHeaders['If-None-Match'] = ifNoneMatch;

      try {
        const ghUrl = `https://api.github.com/repos/${repo}/commits?path=${encodeURIComponent(queryPath)}&per_page=${perPage}&sha=${branch}`;
        const ghRes = await fetch(ghUrl, { headers: ghHeaders });

        if (ghRes.status === 304) {
          return new Response(null, {
            status: 304,
            headers: {
              ...CORS_HEADERS,
              ETag: ghRes.headers.get('ETag') || '',
            },
          });
        }

        const data = await ghRes.json();
        const etag = ghRes.headers.get('ETag');
        const respHeaders = {
          ...CORS_HEADERS,
          'Content-Type': 'application/json; charset=utf-8',
        };
        if (etag) respHeaders['ETag'] = etag;

        return new Response(JSON.stringify(data), {
          status: ghRes.status,
          headers: respHeaders,
        });
      } catch (err) {
        return jsonResponse({ error: err.message }, 500);
      }
    }

    // 2.2 Survey Directory List Proxy Endpoint
    if (path === '/api/surveys' || path === '/surveys') {
      if (request.method !== 'GET') return jsonResponse({ error: 'Method not allowed' }, 405);

      const ghHeaders = {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'NBTC-PrePM-Survey-Cloudflare-Worker',
      };
      if (token) ghHeaders['Authorization'] = `Bearer ${token}`;

      try {
        const ghUrl = `https://api.github.com/repos/${repo}/contents/data/surveys?ref=${branch}`;
        const ghRes = await fetch(ghUrl, { headers: ghHeaders });
        const data = await ghRes.json();

        return new Response(JSON.stringify(data), {
          status: ghRes.status,
          headers: {
            ...CORS_HEADERS,
            'Content-Type': 'application/json; charset=utf-8',
          },
        });
      } catch (err) {
        return jsonResponse({ error: err.message }, 500);
      }
    }

    // 2.3 Single Survey Item Proxy Endpoint
    const singleSurveyMatch = path.match(/^\/api\/(?:survey|surveys)\/([^/]+)$/);
    if (singleSurveyMatch && request.method === 'GET') {
      const rawId = singleSurveyMatch[1];
      const filename = rawId.endsWith('.json') ? rawId : `${rawId}.json`;
      const ghHeaders = {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'NBTC-PrePM-Survey-Cloudflare-Worker',
      };
      if (token) ghHeaders['Authorization'] = `Bearer ${token}`;

      try {
        const ghUrl = `https://api.github.com/repos/${repo}/contents/data/surveys/${filename}?ref=${branch}`;
        const ghRes = await fetch(ghUrl, { headers: ghHeaders });
        const data = await ghRes.json();

        return new Response(JSON.stringify(data), {
          status: ghRes.status,
          headers: {
            ...CORS_HEADERS,
            'Content-Type': 'application/json; charset=utf-8',
          },
        });
      } catch (err) {
        return jsonResponse({ error: err.message }, 500);
      }
    }

    // 3. Save Survey Record Endpoint

// 3. Database Master Stations Endpoint
    if (path === '/api/database' || path === '/database') {
      if (hasD1) {
        try {
          const { results = [] } = await env.DB.prepare('SELECT * FROM stations ORDER BY id ASC').all();
          return jsonResponse({
            ok: true,
            stations: results,
            count: results.length,
            source: 'd1',
          });
        } catch (e) {
          console.warn('D1 station query error:', e.message);
        }
      }

      // Fallback: fetch static database snapshot from R2/static origin
      try {
        const originUrl = new URL('/api/database', request.url);
        const subRes = await fetch(originUrl.toString());
        if (subRes.ok) {
          const data = await subRes.json();
          return jsonResponse(data);
        }
      } catch (e) {}
      return jsonResponse({ ok: false, error: 'Database stations unavailable' }, 500);
    }

    // 4. Dashboard Polling & Aggregates Endpoint
    if (path === '/api/dashboard' || path === '/dashboard') {
      if (hasD1) {
        try {
          // Check Change Token via meta_sync
          const syncMeta = await env.DB.prepare("SELECT last_change_timestamp, change_counter FROM meta_sync WHERE key = 'surveys'").first();
          const changeToken = syncMeta?.change_counter ? String(syncMeta.change_counter) : '1';
          const ifNoneMatch = request.headers.get('If-None-Match');

          if (ifNoneMatch && ifNoneMatch.replace(/^W\//, '').replace(/"/g, '') === changeToken) {
            return new Response(null, {
              status: 304,
              headers: {
                ...CORS_HEADERS,
                ETag: `W/"${changeToken}"`,
              },
            });
          }

          // Query recent surveys
          const { results: recentRows = [] } = await env.DB.prepare(
            'SELECT record_id, station, province, permit, saved_at, updated_at, fields_json FROM surveys WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT 50'
          ).all();

          const countRow = await env.DB.prepare('SELECT COUNT(*) as total FROM surveys WHERE deleted_at IS NULL').first();
          const totalSurveys = countRow?.total || recentRows.length;

          // Parse recent items
          const recent = recentRows.map((row) => {
            let fields = {};
            try {
              fields = JSON.parse(row.fields_json || '{}');
            } catch (e) {}
            return {
              recordId: row.record_id,
              station: row.station,
              province: row.province,
              permit: row.permit,
              savedAt: row.saved_at,
              updatedAt: row.updated_at,
              fields,
              photos: fields.photos || [],
            };
          });

          return jsonResponse(
            {
              ok: true,
              surveysCount: totalSurveys,
              totalSurveys,
              recent,
              changeToken,
              updatedAt: syncMeta?.last_change_timestamp || new Date().toISOString(),
              source: 'd1',
            },
            200,
            { ETag: `W/"${changeToken}"` }
          );
        } catch (e) {
          console.warn('D1 dashboard query error:', e.message);
        }
      }

      // Fallback: static snapshot
      try {
        const originUrl = new URL('/api/dashboard', request.url);
        const subRes = await fetch(originUrl.toString());
        if (subRes.ok) {
          const data = await subRes.json();
          return jsonResponse(data);
        }
      } catch (e) {}
      return jsonResponse({ ok: false, error: 'Dashboard data unavailable' }, 500);
    }

    // 5. Save Survey Record Endpoint
    if (path === '/api/save' || path === '/save') {
      if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

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

        // Clean photos metadata — zero Base64
        const formattedPhotos = cleanPhotoMetadata(photos, recordId);

        const cleanFields = {
          ...fields,
          recordId,
          station,
          province,
          permit,
          photos: formattedPhotos,
        };
        delete cleanFields.data;
        delete cleanFields.dataUrl;
        delete cleanFields.base64Data;

        let d1Saved = false;

        // Save to Cloudflare D1
        if (hasD1) {
          try {
            const statements = [
              env.DB.prepare(
                'INSERT OR REPLACE INTO surveys (record_id, saved_at, updated_at, version, station, province, permit, fields_json, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)'
              ).bind(recordId, savedAt, savedAt, 1, station, province, permit, JSON.stringify(cleanFields)),
            ];

            for (const p of formattedPhotos) {
              const photoId = `${recordId}_p${p.id}`;
              statements.push(
                env.DB.prepare(
                  'INSERT OR REPLACE INTO survey_photos (id, record_id, file_name, original_name, content_type, file_size, onedrive_relative_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
                ).bind(photoId, recordId, p.fileName, p.name, p.contentType, p.size, `photos/${p.fileName}`, savedAt)
              );
            }

            statements.push(
              env.DB.prepare(
                "INSERT OR REPLACE INTO meta_sync (key, last_change_timestamp, change_counter) VALUES ('surveys', ?, COALESCE((SELECT change_counter + 1 FROM meta_sync WHERE key = 'surveys'), 1))"
              ).bind(savedAt)
            );

            await env.DB.batch(statements);
            d1Saved = true;
          } catch (d1Err) {
            console.error('D1 save error:', d1Err.message);
          }
        }

        // Dual-Sync to GitHub (Clean JSON payload, ~2 KB)
        let githubSynced = false;
        let commitUrl = '';
        let sha = '';

        if (token) {
          try {
            const fullSurveyData = {
              recordId,
              savedAt,
              station,
              province,
              permit,
              fields: cleanFields,
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
              githubSynced = true;
              commitUrl = putData?.commit?.html_url || '';
              sha = putData?.content?.sha || '';
            }
          } catch (ghErr) {
            console.warn('GitHub sync error in Worker:', ghErr.message);
          }
        }

        if (d1Saved || githubSynced) {
          return jsonResponse({
            saved: true,
            recordId,
            savedAt,
            d1Synced: d1Saved,
            githubSynced,
            commitUrl,
            sha,
          });
        }

        return jsonResponse(
          {
            saved: false,
            recordId,
            error: 'Failed to persist to D1 and GitHub',
            githubSynced: false,
          },
          500
        );
      } catch (err) {
        return jsonResponse({ saved: false, error: err.message }, 500);
      }
    }

    // 6. Update Survey Record Endpoint
    if (path === '/api/update' || path === '/update') {
      if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

      try {
        const payload = await request.json();
        const recordId = payload.recordId || payload.fields?.recordId;
        if (!recordId) return jsonResponse({ error: 'Missing recordId' }, 400);

        const fields = payload.fields || {};
        const photos = payload.photos || [];
        const updatedAt = new Date().toISOString();
        const station = fields.station || fields.stationSelect || 'ไม่ระบุสถานี';
        const province = fields.province || '';
        const permit = fields.permit === 'on' ? 'อนุญาต' : (fields.permit || 'ยังไม่ระบุ');

        const formattedPhotos = cleanPhotoMetadata(photos, recordId);
        const cleanFields = {
          ...fields,
          recordId,
          station,
          province,
          permit,
          photos: formattedPhotos,
        };
        delete cleanFields.data;
        delete cleanFields.dataUrl;
        delete cleanFields.base64Data;

        let d1Updated = false;

        // Update Cloudflare D1
        if (hasD1) {
          try {
            const statements = [
              env.DB.prepare(
                'UPDATE surveys SET updated_at = ?, station = ?, province = ?, permit = ?, fields_json = ?, version = version + 1 WHERE record_id = ?'
              ).bind(updatedAt, station, province, permit, JSON.stringify(cleanFields), recordId),
            ];

            if (formattedPhotos.length > 0) {
              statements.push(env.DB.prepare('DELETE FROM survey_photos WHERE record_id = ?').bind(recordId));
              for (const p of formattedPhotos) {
                const photoId = `${recordId}_p${p.id}`;
                statements.push(
                  env.DB.prepare(
                    'INSERT OR REPLACE INTO survey_photos (id, record_id, file_name, original_name, content_type, file_size, onedrive_relative_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
                  ).bind(photoId, recordId, p.fileName, p.name, p.contentType, p.size, `photos/${p.fileName}`, updatedAt)
                );
              }
            }

            statements.push(
              env.DB.prepare(
                "INSERT OR REPLACE INTO meta_sync (key, last_change_timestamp, change_counter) VALUES ('surveys', ?, COALESCE((SELECT change_counter + 1 FROM meta_sync WHERE key = 'surveys'), 1))"
              ).bind(updatedAt)
            );

            await env.DB.batch(statements);
            d1Updated = true;
          } catch (d1Err) {
            console.error('D1 update error:', d1Err.message);
          }
        }

        // Dual-Sync to GitHub
        let githubSynced = false;
        if (token) {
          try {
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
              updatedAt,
              station,
              province,
              permit,
              fields: cleanFields,
              photos: formattedPhotos.length > 0 ? formattedPhotos : (baseSurvey.photos || []),
            };

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
              githubSynced = true;
            }
          } catch (ghErr) {
            console.warn('GitHub update sync error in Worker:', ghErr.message);
          }
        }

        if (d1Updated || githubSynced) {
          return jsonResponse({
            saved: true,
            updated: true,
            recordId,
            d1Synced: d1Updated,
            githubSynced,
          });
        }

        return jsonResponse({ saved: false, error: 'Update failed' }, 500);
      } catch (err) {
        return jsonResponse({ saved: false, error: err.message }, 500);
      }
    }

    // 7. Delete Survey Record Endpoint
    if (path === '/api/delete' || path === '/delete') {
      if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

      try {
        const payload = await request.json();
        let recordIds = payload.recordIds;
        if (!recordIds && payload.recordId) recordIds = [payload.recordId];
        if (!Array.isArray(recordIds) || recordIds.length === 0) {
          return jsonResponse({ error: 'Missing recordIds' }, 400);
        }

        const now = new Date().toISOString();
        let d1Deleted = false;

        // Soft-delete in D1
        if (hasD1) {
          try {
            const statements = recordIds.map((id) =>
              env.DB.prepare('UPDATE surveys SET deleted_at = ? WHERE record_id = ?').bind(now, id)
            );
            statements.push(
              env.DB.prepare(
                "INSERT OR REPLACE INTO meta_sync (key, last_change_timestamp, change_counter) VALUES ('surveys', ?, COALESCE((SELECT change_counter + 1 FROM meta_sync WHERE key = 'surveys'), 1))"
              ).bind(now)
            );
            await env.DB.batch(statements);
            d1Deleted = true;
          } catch (d1Err) {
            console.error('D1 delete error:', d1Err.message);
          }
        }

        // Delete from GitHub if token provided
        const deletedIds = [];
        const failed = [];

        if (token) {
          for (const id of recordIds) {
            try {
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
            } catch (err) {
              failed.push({ id, error: err.message });
            }
          }
        } else {
          // If no GitHub token, IDs are deleted in D1
          deletedIds.push(...recordIds);
        }

        return jsonResponse({
          deleted: true,
          count: deletedIds.length,
          deletedIds,
          failed,
          d1Deleted,
          githubDeleted: failed.length === 0,
        });
      } catch (err) {
        return jsonResponse({ deleted: false, error: err.message }, 500);
      }
    }

    return jsonResponse({ error: 'Endpoint not found' }, 404);
  },
};
