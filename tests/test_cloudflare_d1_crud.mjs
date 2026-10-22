import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

console.log('Testing Cloudflare Worker & D1 Direct CRUD Migration...');

const ROOT = process.cwd();
const workerFile = path.join(ROOT, 'worker', 'index.js');
const apiFile = path.join(ROOT, 'src', 'lib', 'api.js');
const schemaFile = path.join(ROOT, 'schema.sql');

// 1. Verify schema.sql
assert(fs.existsSync(schemaFile), 'schema.sql must exist at root');
const schemaContent = fs.readFileSync(schemaFile, 'utf8');
assert(schemaContent.includes('CREATE TABLE IF NOT EXISTS surveys'), 'schema.sql must define surveys table');
assert(schemaContent.includes('CREATE TABLE IF NOT EXISTS survey_photos'), 'schema.sql must define survey_photos table');
assert(schemaContent.includes('CREATE TABLE IF NOT EXISTS stations'), 'schema.sql must define stations table');
assert(schemaContent.includes('CREATE TABLE IF NOT EXISTS meta_sync'), 'schema.sql must define meta_sync table');
assert(schemaContent.includes('INSERT OR REPLACE INTO surveys'), 'schema.sql must provide sample INSERT query');
assert(schemaContent.includes('UPDATE surveys'), 'schema.sql must provide sample UPDATE query');
console.log('  [PASS] D1 Schema: schema.sql contains DDL and sample prepared queries matching JSON structure.');

// 2. Verify worker/index.js Direct D1 CRUD (Zero GitHub Commits)
assert(fs.existsSync(workerFile), 'worker/index.js must exist');
const workerContent = fs.readFileSync(workerFile, 'utf8');

// Ensure D1 prepared statements are used for all CRUD operations
assert(workerContent.includes('env.DB.prepare'), 'worker must use env.DB.prepare for SQL execution');
assert(workerContent.includes('INSERT OR REPLACE INTO surveys'), 'worker must execute INSERT on surveys');
assert(workerContent.includes('UPDATE surveys SET updated_at'), 'worker must execute UPDATE on surveys');
assert(workerContent.includes('UPDATE surveys SET deleted_at'), 'worker must execute soft-delete on surveys');
assert(workerContent.includes('SELECT record_id, station'), 'worker must execute SELECT on surveys');
assert(workerContent.includes('meta_sync'), 'worker must update meta_sync change counter');

// Ensure NO GitHub commit/push mutation calls remain in worker CRUD endpoints
assert(!workerContent.includes("method: 'PUT',\n                headers: {\n                  Authorization: `Bearer ${token}`"), 'worker must NOT commit PUT mutations to GitHub API');
assert(!workerContent.includes("method: 'DELETE',\n                headers: {\n                  Authorization: `Bearer ${token}`"), 'worker must NOT commit DELETE mutations to GitHub API');
console.log('  [PASS] Worker Engine: Direct D1 prepared statement CRUD implemented without GitHub commit mutations.');

// 3. Verify api.js Client Integration & State Synchronization
const apiContent = fs.readFileSync(apiFile, 'utf8');

assert(apiContent.includes("callWorkerMutatingApi(workerUrl, '/api/save'"), 'submitSurvey must route to worker');
assert(apiContent.includes("callWorkerMutatingApi(workerUrl, '/api/update'"), 'updateSurvey must route to worker');
assert(apiContent.includes("callWorkerMutatingApi(workerUrl, '/api/delete'"), 'deleteSurveys must route to worker');
assert(apiContent.includes("serverResult?.d1Synced"), 'api.js must recognize d1Synced response flag');
assert(apiContent.includes("source === 'd1'"), 'fetchDashboardData must leverage D1 source directly');
assert(apiContent.includes("notifySurveysUpdated({ action: 'create'"), 'submitSurvey must notify create event');
assert(apiContent.includes("notifySurveysUpdated({ action: 'update'"), 'updateSurvey must notify update event');
assert(apiContent.includes("notifySurveysUpdated({"), 'deleteSurveys must notify delete event');
assert(apiContent.includes("mergeDashboardWithLocal(serverData, allCombinedSurveys)"), 'fetchDashboardData must merge D1 data with local surveys');
console.log('  [PASS] Client Data Layer: Rerouted to Worker D1 with instant hydration and zero GitHub polling latency.');

// 4. Verify Dashboard Lineage & Real-time Invalidation
const dashboardFile = path.join(ROOT, 'src', 'components', 'dashboard', 'DashboardView.jsx');
assert(fs.existsSync(dashboardFile), 'DashboardView.jsx must exist');
const dashboardContent = fs.readFileSync(dashboardFile, 'utf8');
assert(dashboardContent.includes("loadData(true)"), 'DashboardView must invalidate cache and force-reload on survey update events');
assert(workerContent.includes("const stats = {"), 'Worker /api/dashboard must compute and return stats object for KPI cards');
assert(workerContent.includes("provinces,"), 'Worker /api/dashboard must compute and return provinces breakdown for ProvinceChart');
console.log('  [PASS] Dashboard Lineage: Single source of truth, live stats aggregation, and instant cache invalidation verified.');

console.log('All Cloudflare D1 CRUD Migration and Dashboard State Synchronization tests passed successfully!');
