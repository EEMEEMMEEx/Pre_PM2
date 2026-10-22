/**
 * NBTC Microwave — Pre-PM Survey Cloudflare Worker API & D1 Engine
 * Direct Cloudflare D1 CRUD Operations with Prepared SQL Statements
 *
 * Cloudflare D1 Binding:
 *  - env.DB: Cloudflare D1 database (pre-pm2-prod)
 *
 * Environment Variables (wrangler.toml):
 *  - GITHUB_REPO: "Thaidimaru/Pre_PM2" (default)
 *  - GITHUB_BRANCH: "main" (default)
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, If-None-Match',
  'Access-Control-Max-Age': '86400',
};

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
};

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      ...NO_CACHE_HEADERS,
      ...extraHeaders,
    },
  });
}

function cleanPhotoMetadata(photos, recordId) {
  return (photos || []).map((p, idx) => {
    const cleanName = (p.name || `photo_${idx + 1}.jpg`).replace(/[/\\?%*:|"<>]/g, '_');
    const fileName = p.fileName || `${recordId}_${cleanName}`;
    const contentType = p.type || p.contentType || 'image/jpeg';
    const size = p.size || 0;
    const photoUrl = p.url && !p.url.startsWith('data:') && !p.url.startsWith('blob:')
      ? p.url
      : `/photos/${fileName}`;
    return {
      id: p.id || idx + 1,
      name: cleanName,
      fileName,
      contentType,
      size,
      url: photoUrl,
    };
  });
}

function formatSurveyRow(row, photos = []) {
  let fields = {};
  try {
    fields = typeof row.fields_json === 'string' ? JSON.parse(row.fields_json) : (row.fields_json || {});
  } catch (e) {
    fields = {};
  }
  const surveyPhotos = photos && photos.length > 0 ? photos : fields.photos || [];
  return {
    recordId: row.record_id,
    station: row.station,
    province: row.province,
    permit: row.permit,
    savedAt: row.saved_at,
    updatedAt: row.updated_at,
    version: row.version || 1,
    fields: {
      ...fields,
      recordId: row.record_id,
      station: row.station,
      province: row.province,
      permit: row.permit,
      photos: surveyPhotos,
    },
    photos: surveyPhotos,
  };
}

export default {
  async fetch(request, env, ctx) {
    // 0. CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...CORS_HEADERS, ...NO_CACHE_HEADERS } });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '');
    const method = request.method.toUpperCase();
    const repo = env.GITHUB_REPO || 'Thaidimaru/Pre_PM2';
    const branch = env.GITHUB_BRANCH || 'main';
    const hasD1 = Boolean(env.DB);

    // 1. Health check & Service Info
    if (path === '' || path === '/' || path === '/api' || path === '/api/health') {
      let d1Status = 'disconnected';
      let recordCount = 0;
      if (hasD1) {
        try {
          const res = await env.DB.prepare('SELECT COUNT(*) as total FROM surveys WHERE deleted_at IS NULL').first();
          d1Status = 'connected';
          recordCount = res?.total || 0;
        } catch (e) {
          d1Status = `error: ${e.message}`;
        }
      }

      return jsonResponse({
        ok: true,
        service: 'NBTC Microwave Survey Cloudflare Worker & D1 API',
        mode: 'cloudflare_d1_direct',
        d1Configured: hasD1,
        d1Status,
        activeSurveys: recordCount,
        repo,
        branch,
        version: '2.14.3',
        timestamp: new Date().toISOString(),
      });
    }

    // 2. System Status Verification
    if (path === '/api/github-status' || path === '/github-status') {
      return jsonResponse({
        configured: true,
        valid: true,
        canWrite: true,
        d1Configured: hasD1,
        mode: 'cloudflare_d1_direct',
        user: 'Cloudflare D1 Engine',
        repo,
        branch,
        message: 'ระบบจัดเก็บข้อมูลหลักทำงานผ่าน Cloudflare D1 Database เรียบร้อยสมบูรณ์ (Zero GitHub commits)',
      });
    }

    // 3. Lightweight Commits / Change Check (ETag compatible with legacy clients)
    if (path === '/api/commits' || path === '/commits') {
      if (method !== 'GET') return jsonResponse({ error: 'Method not allowed' }, 405);
      if (hasD1) {
        try {
          const meta = await env.DB.prepare("SELECT last_change_timestamp, change_counter FROM meta_sync WHERE key = 'surveys'").first();
          const changeToken = meta?.change_counter ? String(meta.change_counter) : '1';
          const ifNoneMatch = request.headers.get('if-none-match') || request.headers.get('If-None-Match');

          if (ifNoneMatch && ifNoneMatch.replace(/^W\//, '').replace(/"/g, '') === changeToken) {
            return new Response(null, {
              status: 304,
              headers: {
                ...CORS_HEADERS,
                ...NO_CACHE_HEADERS,
                ETag: `W/"${changeToken}"`,
              },
            });
          }

          return jsonResponse(
            [
              {
                sha: `d1-${changeToken}`,
                commit: {
                  message: `D1 change generation ${changeToken}`,
                  committer: { date: meta?.last_change_timestamp || new Date().toISOString() },
                },
              },
            ],
            200,
            { ETag: `W/"${changeToken}"` }
          );
        } catch (e) {}
      }

      return jsonResponse([{ sha: 'd1-ready' }]);
    }

    // 4. Database Master Stations Endpoint
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

      // Fallback: fetch static database snapshot from origin
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

    // 5. Dashboard Polling & Aggregates Endpoint
    if (path === '/api/dashboard' || path === '/dashboard') {
      if (hasD1) {
        try {
          const syncMeta = await env.DB.prepare(
            "SELECT last_change_timestamp, change_counter FROM meta_sync WHERE key = 'surveys'"
          ).first();
          const changeToken = syncMeta?.change_counter ? String(syncMeta.change_counter) : '1';
          const ifNoneMatch = request.headers.get('If-None-Match') || request.headers.get('if-none-match');

          if (ifNoneMatch && ifNoneMatch.replace(/^W\//, '').replace(/"/g, '') === changeToken) {
            return new Response(null, {
              status: 304,
              headers: {
                ...CORS_HEADERS,
                ...NO_CACHE_HEADERS,
                ETag: `W/"${changeToken}"`,
              },
            });
          }

          // Query active surveys for dashboard view
          const { results: recentRows = [] } = await env.DB.prepare(
            'SELECT record_id, station, province, permit, saved_at, updated_at, fields_json, version FROM surveys WHERE deleted_at IS NULL ORDER BY updated_at DESC'
          ).all();

          const countRow = await env.DB.prepare(
            'SELECT COUNT(*) as total FROM surveys WHERE deleted_at IS NULL'
          ).first();
          const totalSurveys = countRow?.total || recentRows.length;

          let totalStations = 197;
          try {
            const stationsRow = await env.DB.prepare('SELECT COUNT(*) as total FROM stations').first();
            if (stationsRow?.total) totalStations = stationsRow.total;
          } catch (e) {}

          let allowed = 0;
          let denied = 0;
          const provinceCounts = new Map();

          const recent = recentRows.map((row) => {
            const permit = row.permit;
            if (permit === 'อนุญาต' || permit === 'on') allowed++;
            else if (permit === 'ไม่อนุญาต') denied++;

            const prov = row.province || 'ไม่ระบุจังหวัด';
            provinceCounts.set(prov, (provinceCounts.get(prov) || 0) + 1);

            return formatSurveyRow(row);
          });

          const provinces = Array.from(provinceCounts.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

          const stats = {
            surveys: totalSurveys,
            stations: totalStations,
            allowed,
            denied,
          };

          return jsonResponse(
            {
              ok: true,
              source: 'd1',
              stats,
              provinces,
              recent,
              surveysCount: totalSurveys,
              totalSurveys,
              changeToken,
              updatedAt: syncMeta?.last_change_timestamp || new Date().toISOString(),
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

    // =========================================================================
    // 6. SURVEY CRUD OPERATIONS (DIRECT CLOUDFLARE D1)
    // =========================================================================

    // Match single survey pattern: /api/surveys/:id or /api/survey/:id
    const singleSurveyMatch = path.match(/^\/api\/(?:survey|surveys)\/([^/]+)$/);
    const idFromPath = singleSurveyMatch ? singleSurveyMatch[1].replace(/\.json$/, '') : null;

    // --- 6.1 GET SINGLE SURVEY ---
    if (idFromPath && method === 'GET') {
      if (!hasD1) return jsonResponse({ ok: false, error: 'D1 binding unavailable' }, 503);

      try {
        const row = await env.DB.prepare(
          'SELECT record_id, station, province, permit, saved_at, updated_at, fields_json, version FROM surveys WHERE record_id = ? AND deleted_at IS NULL'
        ).bind(idFromPath).first();

        if (!row) {
          return jsonResponse({ ok: false, error: 'Survey not found' }, 404);
        }

        const { results: photoRows = [] } = await env.DB.prepare(
          'SELECT id, file_name, original_name, content_type, file_size, onedrive_relative_path, created_at FROM survey_photos WHERE record_id = ?'
        ).bind(idFromPath).all();

        const photos = photoRows.map((p) => ({
          id: p.id,
          name: p.original_name || p.file_name,
          fileName: p.file_name,
          contentType: p.content_type,
          size: p.file_size,
          url: `/photos/${p.file_name}`,
        }));

        return jsonResponse({
          ok: true,
          survey: formatSurveyRow(row, photos),
          source: 'd1',
        });
      } catch (err) {
        return jsonResponse({ ok: false, error: err.message }, 500);
      }
    }

    // --- 6.2 GET SURVEYS LIST (SELECT) ---
    if ((path === '/api/surveys' || path === '/surveys') && method === 'GET') {
      if (!hasD1) return jsonResponse({ ok: false, error: 'D1 binding unavailable' }, 503);

      try {
        const limitParam = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500);
        const offsetParam = Math.max(parseInt(url.searchParams.get('offset') || '0', 10), 0);
        const provinceParam = url.searchParams.get('province') || '';

        let query = 'SELECT record_id, station, province, permit, saved_at, updated_at, fields_json, version FROM surveys WHERE deleted_at IS NULL';
        const params = [];

        if (provinceParam) {
          query += ' AND province = ?';
          params.push(provinceParam);
        }
        query += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
        params.push(limitParam, offsetParam);

        const { results: rows = [] } = await env.DB.prepare(query).bind(...params).all();

        const countQuery = provinceParam
          ? env.DB.prepare('SELECT COUNT(*) as total FROM surveys WHERE deleted_at IS NULL AND province = ?').bind(provinceParam)
          : env.DB.prepare('SELECT COUNT(*) as total FROM surveys WHERE deleted_at IS NULL');
        const countRow = await countQuery.first();
        const total = countRow?.total || rows.length;

        const surveys = rows.map((r) => formatSurveyRow(r));

        return jsonResponse({
          ok: true,
          surveys,
          count: total,
          limit: limitParam,
          offset: offsetParam,
          source: 'd1',
        });
      } catch (err) {
        return jsonResponse({ ok: false, error: err.message }, 500);
      }
    }

    // --- 6.3 CREATE SURVEY (INSERT - POST /api/surveys or POST /api/save) ---
    const isCreateRoute =
      (path === '/api/surveys' || path === '/surveys' || path === '/api/save' || path === '/save') &&
      method === 'POST';

    if (isCreateRoute) {
      if (!hasD1) return jsonResponse({ ok: false, error: 'Cloudflare D1 binding (env.DB) unavailable' }, 503);

      try {
        const payload = await request.json().catch(() => ({}));
        const fields = payload.fields || payload;
        const photos = payload.photos || fields.photos || [];
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

        // Clean photos metadata — zero Base64 stored in database
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

        // Prepared statements batch execution
        const statements = [
          env.DB.prepare(
            'INSERT OR REPLACE INTO surveys (record_id, saved_at, updated_at, version, station, province, permit, fields_json, deleted_at) VALUES (?, ?, ?, 1, ?, ?, ?, ?, NULL)'
          ).bind(recordId, savedAt, savedAt, station, province, permit, JSON.stringify(cleanFields)),
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

        const fullRecord = {
          recordId,
          savedAt,
          updatedAt: savedAt,
          station,
          province,
          permit,
          version: 1,
          fields: cleanFields,
          photos: formattedPhotos,
        };

        return jsonResponse(
          {
            ok: true,
            saved: true,
            recordId,
            savedAt,
            record: fullRecord,
            d1Synced: true,
            message: 'Survey persisted to Cloudflare D1 successfully',
          },
          201
        );
      } catch (err) {
        console.error('D1 Insert error:', err);
        return jsonResponse({ ok: false, saved: false, error: err.message }, 500);
      }
    }

    // --- 6.4 UPDATE SURVEY (UPDATE - PUT /api/surveys/:id or PUT /api/surveys or POST /api/update) ---
    const isUpdateRoute =
      (idFromPath && method === 'PUT') ||
      ((path === '/api/surveys' || path === '/surveys') && method === 'PUT') ||
      ((path === '/api/update' || path === '/update') && (method === 'POST' || method === 'PUT'));

    if (isUpdateRoute) {
      if (!hasD1) return jsonResponse({ ok: false, error: 'Cloudflare D1 binding (env.DB) unavailable' }, 503);

      try {
        const payload = await request.json().catch(() => ({}));
        const recordId = idFromPath || payload.recordId || payload.fields?.recordId;

        if (!recordId) {
          return jsonResponse({ ok: false, error: 'Missing recordId for update' }, 400);
        }

        const fields = payload.fields || payload;
        const photos = payload.photos || fields.photos || [];
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

        // Prepared statements batch execution for atomic update
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

        const updatedRecord = {
          recordId,
          updatedAt,
          station,
          province,
          permit,
          fields: cleanFields,
          photos: formattedPhotos,
        };

        return jsonResponse({
          ok: true,
          saved: true,
          updated: true,
          recordId,
          updatedAt,
          record: updatedRecord,
          d1Synced: true,
          message: 'Survey updated in Cloudflare D1 successfully',
        });
      } catch (err) {
        console.error('D1 Update error:', err);
        return jsonResponse({ ok: false, saved: false, error: err.message }, 500);
      }
    }

    // --- 6.5 DELETE SURVEY (DELETE - DELETE /api/surveys/:id or DELETE /api/surveys or POST /api/delete) ---
    const isDeleteRoute =
      (idFromPath && method === 'DELETE') ||
      ((path === '/api/surveys' || path === '/surveys') && method === 'DELETE') ||
      ((path === '/api/delete' || path === '/delete') && (method === 'POST' || method === 'DELETE'));

    if (isDeleteRoute) {
      if (!hasD1) return jsonResponse({ ok: false, error: 'Cloudflare D1 binding (env.DB) unavailable' }, 503);

      try {
        let recordIds = [];
        if (idFromPath) {
          recordIds = [idFromPath];
        } else {
          const payload = await request.json().catch(() => ({}));
          if (Array.isArray(payload.recordIds)) {
            recordIds = payload.recordIds;
          } else if (payload.recordId) {
            recordIds = [payload.recordId];
          }
        }

        recordIds = (recordIds || []).filter(Boolean).map(String);
        if (recordIds.length === 0) {
          return jsonResponse({ ok: false, error: 'Missing recordIds for deletion' }, 400);
        }

        const now = new Date().toISOString();
        const statements = recordIds.map((id) =>
          env.DB.prepare('UPDATE surveys SET deleted_at = ? WHERE record_id = ?').bind(now, id)
        );

        statements.push(
          env.DB.prepare(
            "INSERT OR REPLACE INTO meta_sync (key, last_change_timestamp, change_counter) VALUES ('surveys', ?, COALESCE((SELECT change_counter + 1 FROM meta_sync WHERE key = 'surveys'), 1))"
          ).bind(now)
        );

        await env.DB.batch(statements);

        return jsonResponse({
          ok: true,
          deleted: true,
          count: recordIds.length,
          deletedIds: recordIds,
          d1Deleted: true,
          message: `Soft-deleted ${recordIds.length} survey(s) in Cloudflare D1 successfully`,
        });
      } catch (err) {
        console.error('D1 Delete error:', err);
        return jsonResponse({ ok: false, deleted: false, error: err.message }, 500);
      }
    }

    return jsonResponse({ error: 'Endpoint not found' }, 404);
  },
};
