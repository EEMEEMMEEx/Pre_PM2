import assert from 'node:assert';
import worker from '../worker/index.js';

console.log('Testing Cloudflare Worker Resilience & 500 Prevention...');

// Mock Request helper
function makeRequest(path, options = {}) {
  const url = `https://pre-pm2.utai323.workers.dev${path}`;
  return new Request(url, {
    method: options.method || 'GET',
    headers: options.headers || {},
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

// 1. OPTIONS Preflight CORS check
{
  const req = makeRequest('/api/dashboard', { method: 'OPTIONS' });
  const res = await worker.fetch(req, {}, {});
  assert.strictEqual(res.status, 204, 'OPTIONS must return 204');
  assert.strictEqual(res.headers.get('access-control-allow-origin'), '*', 'OPTIONS must have CORS origin *');
  assert(res.headers.get('access-control-allow-methods').includes('GET'), 'OPTIONS must have CORS methods');
  console.log('  [PASS] OPTIONS Preflight returns 204 with full CORS headers');
}

// 2. Missing D1 Binding (env.DB is undefined)
{
  const emptyEnv = { GITHUB_REPO: 'Thaidimaru/Pre_PM2', GITHUB_BRANCH: 'main' };

  // Health check
  const healthRes = await worker.fetch(makeRequest('/api/health'), emptyEnv, {});
  assert.strictEqual(healthRes.status, 200, 'Health check must return 200 even without DB binding');
  const healthJson = await healthRes.json();
  assert.strictEqual(healthJson.d1Configured, false, 'Health check indicates d1Configured: false');
  console.log('  [PASS] /api/health responds with 200 and d1Configured: false when env.DB is missing');

  // /api/dashboard without DB
  const dashRes = await worker.fetch(makeRequest('/api/dashboard'), emptyEnv, {});
  assert.strictEqual(dashRes.status, 200, '/api/dashboard must return 200 on missing DB binding');
  const dashJson = await dashRes.json();
  assert.strictEqual(dashJson.ok, true, 'dashboard response has ok: true');
  assert(dashJson.stats !== undefined, 'dashboard response includes stats');
  assert(Array.isArray(dashJson.recent), 'dashboard response includes recent array');
  assert(Array.isArray(dashJson.provinces), 'dashboard response includes provinces array');
  console.log('  [PASS] /api/dashboard gracefully falls back to default structure (200 OK) when env.DB is missing');

  // /api/surveys without DB
  const surveysRes = await worker.fetch(makeRequest('/api/surveys'), emptyEnv, {});
  assert.strictEqual(surveysRes.status, 200, '/api/surveys must return 200 on missing DB binding');
  const surveysJson = await surveysRes.json();
  assert.strictEqual(surveysJson.ok, true, 'surveys response has ok: true');
  assert(Array.isArray(surveysJson.surveys), 'surveys response includes surveys array');
  assert.strictEqual(surveysJson.count >= 0, true, 'surveys response includes count >= 0');
  console.log('  [PASS] /api/surveys gracefully falls back to default collection (200 OK) when env.DB is missing');

  // /api/database without DB
  const dbRes = await worker.fetch(makeRequest('/api/database'), emptyEnv, {});
  assert.strictEqual(dbRes.status, 200, '/api/database must return 200 on missing DB binding');
  const dbJson = await dbRes.json();
  assert.strictEqual(dbJson.ok, true, 'database response has ok: true');
  assert(Array.isArray(dbJson.stations), 'database response includes stations array');
  console.log('  [PASS] /api/database gracefully returns fallback stations (200 OK) when env.DB is missing');
}

// 3. Simulated D1 Quota Exceeded (D1_ERROR: daily row read limit)
{
  const quotaErrorEnv = {
    GITHUB_REPO: 'Thaidimaru/Pre_PM2',
    GITHUB_BRANCH: 'main',
    DB: {
      prepare(sql) {
        return {
          bind() { return this; },
          first() {
            throw new Error("D1_ERROR: Your account has exceeded D1's free tier daily row read limit.");
          },
          all() {
            throw new Error("D1_ERROR: Your account has exceeded D1's free tier daily row read limit.");
          },
        };
      },
      batch() {
        throw new Error("D1_ERROR: Your account has exceeded D1's free tier daily row read limit.");
      },
    },
  };

  // /api/dashboard during quota limit
  const dashRes = await worker.fetch(makeRequest('/api/dashboard'), quotaErrorEnv, {});
  assert.strictEqual(dashRes.status, 200, '/api/dashboard must NOT return 500 when D1 quota is exceeded');
  const dashJson = await dashRes.json();
  assert.strictEqual(dashJson.ok, true, 'dashboard response has ok: true');
  assert(dashJson.stats !== undefined, 'dashboard response has stats');
  assert(Array.isArray(dashJson.recent), 'dashboard response has recent array');
  console.log('  [PASS] /api/dashboard prevents 500 Internal Server Error when D1 quota limit is exceeded');

  // /api/surveys during quota limit
  const surveysRes = await worker.fetch(makeRequest('/api/surveys'), quotaErrorEnv, {});
  assert.strictEqual(surveysRes.status, 200, '/api/surveys must NOT return 500 when D1 quota is exceeded');
  const surveysJson = await surveysRes.json();
  assert.strictEqual(surveysJson.ok, true, 'surveys response has ok: true');
  assert(Array.isArray(surveysJson.surveys), 'surveys response has surveys array');
  console.log('  [PASS] /api/surveys prevents 500 Internal Server Error when D1 quota limit is exceeded');
}

// 4. Simulated Uninitialized Database (no such table: surveys)
{
  const uninitializedEnv = {
    GITHUB_REPO: 'Thaidimaru/Pre_PM2',
    GITHUB_BRANCH: 'main',
    DB: {
      prepare(sql) {
        return {
          bind() { return this; },
          first() {
            throw new Error('D1_ERROR: no such table: surveys');
          },
          all() {
            throw new Error('D1_ERROR: no such table: surveys');
          },
        };
      },
      batch() {
        return Promise.resolve([]);
      },
    },
  };

  const dashRes = await worker.fetch(makeRequest('/api/dashboard'), uninitializedEnv, {});
  assert.strictEqual(dashRes.status, 200, '/api/dashboard must return 200 when tables are uninitialized');
  const dashJson = await dashRes.json();
  assert.strictEqual(dashJson.ok, true);
  console.log('  [PASS] /api/dashboard prevents 500 when database tables are uninitialized');

  const surveysRes = await worker.fetch(makeRequest('/api/surveys'), uninitializedEnv, {});
  assert.strictEqual(surveysRes.status, 200, '/api/surveys must return 200 when tables are uninitialized');
  const surveysJson = await surveysRes.json();
  assert.strictEqual(surveysJson.ok, true);
  console.log('  [PASS] /api/surveys prevents 500 when database tables are uninitialized');
}

// 5. Normal D1 Execution (Happy Path)
{
  const mockRows = [
    {
      record_id: 'PM-20261028-a1b2',
      station: 'หมู่ 1 ทดสอบ',
      province: 'นครราชสีมา',
      permit: 'อนุญาต',
      saved_at: '2026-10-28T10:00:00.000Z',
      updated_at: '2026-10-28T10:00:00.000Z',
      fields_json: JSON.stringify({ station: 'หมู่ 1 ทดสอบ', contactName: 'สมชาย' }),
      version: 1,
    },
  ];

  const normalEnv = {
    GITHUB_REPO: 'Thaidimaru/Pre_PM2',
    GITHUB_BRANCH: 'main',
    DB: {
      prepare(sql) {
        return {
          bind() { return this; },
          first() {
            if (sql.includes('meta_sync')) return Promise.resolve({ change_counter: 5, last_change_timestamp: '2026-10-28T10:00:00Z' });
            if (sql.includes('COUNT(*) as total FROM surveys')) return Promise.resolve({ total: 1 });
            if (sql.includes('COUNT(*) as total FROM stations')) return Promise.resolve({ total: 197 });
            return Promise.resolve(mockRows[0]);
          },
          all() {
            if (sql.includes('stations')) return Promise.resolve({ results: [{ id: 1, village: 'หมู่ 1 ทดสอบ' }] });
            if (sql.includes('survey_photos')) return Promise.resolve({ results: [] });
            return Promise.resolve({ results: mockRows });
          },
        };
      },
      batch() {
        return Promise.resolve([]);
      },
    },
  };

  const dashRes = await worker.fetch(makeRequest('/api/dashboard'), normalEnv, {});
  assert.strictEqual(dashRes.status, 200);
  const dashJson = await dashRes.json();
  assert.strictEqual(dashJson.source, 'd1');
  assert.strictEqual(dashJson.stats.surveys, 1);
  assert.strictEqual(dashJson.stats.allowed, 1);
  console.log('  [PASS] /api/dashboard returns structured D1 records when database is healthy');

  const surveysRes = await worker.fetch(makeRequest('/api/surveys'), normalEnv, {});
  assert.strictEqual(surveysRes.status, 200);
  const surveysJson = await surveysRes.json();
  assert.strictEqual(surveysJson.source, 'd1');
  assert.strictEqual(surveysJson.surveys.length, 1);
  assert.strictEqual(surveysJson.surveys[0].recordId, 'PM-20261028-a1b2');
  console.log('  [PASS] /api/surveys returns formatted survey array when database is healthy');
}

// 6. Unhandled Fatal Exception Structure Verification
{
  // Simulating an impossible syntax/runtime crash inside a mutation route to test global error handling
  const brokenEnv = {
    get GITHUB_REPO() {
      throw new Error('Fatal simulated crash inside Worker context');
    },
  };

  const req = makeRequest('/api/surveys');
  const res = await worker.fetch(req, brokenEnv, {});
  assert.strictEqual(res.status, 500, 'Fatal exception must return 500');
  assert.strictEqual(res.headers.get('access-control-allow-origin'), '*', 'Fatal 500 must include CORS');
  const errJson = await res.json();
  assert.strictEqual(errJson.ok, false, 'Fatal 500 has ok: false');
  assert(errJson.error.includes('Fatal simulated crash'), 'Fatal 500 includes exact error message');
  assert(typeof errJson.stack === 'string' && errJson.stack.length > 0, 'Fatal 500 includes inspectable stack trace');
  console.log('  [PASS] Unhandled exception returns 500 with exact error message, stack trace, and CORS headers');
}

console.log('\nAll Cloudflare Worker resilience and 500 prevention tests passed successfully!');
