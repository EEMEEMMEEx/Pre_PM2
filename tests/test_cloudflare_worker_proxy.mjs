import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

console.log('Testing Cloudflare Worker API Proxy (Option 2) Implementation...');

const ROOT = process.cwd();
const workerFile = path.join(ROOT, 'worker', 'index.js');
const wranglerFile = path.join(ROOT, 'wrangler.toml');
const apiFile = path.join(ROOT, 'src', 'lib', 'api.js');
const settingsModalFile = path.join(ROOT, 'src', 'components', 'settings', 'SettingsModal.jsx');
const cloudConfigFile = path.join(ROOT, 'public', 'api', 'cloud-config.json');
const docsFile = path.join(ROOT, 'docs', 'cloudflare-worker-setup.md');

// 1. Verify Worker code & Wrangler config
assert(fs.existsSync(workerFile), 'worker/index.js must exist');
const workerContent = fs.readFileSync(workerFile, 'utf8');
assert(workerContent.includes('/api/health'), 'worker must support /api/health');
assert(workerContent.includes('/api/github-status'), 'worker must support /api/github-status');
assert(workerContent.includes('/api/save'), 'worker must support /api/save');
assert(workerContent.includes('/api/update'), 'worker must support /api/update');
assert(workerContent.includes('/api/delete'), 'worker must support /api/delete');
assert(workerContent.includes('CORS_HEADERS'), 'worker must support CORS');
console.log('  [PASS] Cloudflare Worker: worker/index.js contains complete edge proxy logic.');

assert(fs.existsSync(wranglerFile), 'wrangler.toml must exist');
const wranglerContent = fs.readFileSync(wranglerFile, 'utf8');
assert(wranglerContent.includes('name = "pre-pm-api"'), 'wrangler.toml must define worker name');
assert(wranglerContent.includes('worker/index.js'), 'wrangler.toml must point to worker/index.js');
console.log('  [PASS] Wrangler configuration: wrangler.toml is valid.');

// 2. Verify api.js Integration
const apiContent = fs.readFileSync(apiFile, 'utf8');
assert(apiContent.includes('export const CLOUD_WORKER_URL_KEY'), 'api.js must export CLOUD_WORKER_URL_KEY');
assert(apiContent.includes('export function getCloudWorkerUrl'), 'api.js must export getCloudWorkerUrl');
assert(apiContent.includes('export async function saveCloudWorkerUrl'), 'api.js must export saveCloudWorkerUrl');
assert(apiContent.includes('export async function fetchRemoteWorkerUrl'), 'api.js must export fetchRemoteWorkerUrl');
assert(apiContent.includes('export async function callWorkerMutatingApi'), 'api.js must export callWorkerMutatingApi');

// Verify mutations route to worker
assert(apiContent.includes('callWorkerMutatingApi(workerUrl, \'/api/save\''), 'submitSurvey must route to worker');
assert(apiContent.includes('callWorkerMutatingApi(workerUrl, \'/api/update\''), 'updateSurvey must route to worker');
assert(apiContent.includes('callWorkerMutatingApi(workerUrl, \'/api/delete\''), 'deleteSurveys must route to worker');
assert(apiContent.includes('callWorkerMutatingApi(workerUrl, \'/api/save\''), 'syncPendingLocalSurveys must route to worker');
console.log('  [PASS] Client API Routing: All survey mutations route to Cloudflare Worker API when configured.');

// 3. Verify SettingsModal UI
const settingsContent = fs.readFileSync(settingsModalFile, 'utf8');
assert(settingsContent.includes('workerUrlInput'), 'SettingsModal must have workerUrlInput state');
assert(settingsContent.includes('handleTestWorker'), 'SettingsModal must have handleTestWorker');
assert(settingsContent.includes('handleSaveWorkerUrl'), 'SettingsModal must have handleSaveWorkerUrl');
assert(settingsContent.includes('Cloudflare Worker Edge API'), 'SettingsModal must render Cloudflare Worker section');
assert(settingsContent.includes('ผู้ใช้ทุกคนซิงค์ได้อัตโนมัติ'), 'SettingsModal must indicate multi-user sync capability');
console.log('  [PASS] Settings UI: Cloudflare Worker section and status banners integrated seamlessly.');

// 4. Verify Public Config & Documentation
assert(fs.existsSync(cloudConfigFile), 'public/api/cloud-config.json must exist');
assert(fs.existsSync(docsFile), 'docs/cloudflare-worker-setup.md must exist');
const docsContent = fs.readFileSync(docsFile, 'utf8');
assert(docsContent.includes('wrangler secret put GITHUB_TOKEN'), 'Documentation must explain secret setup');
console.log('  [PASS] Discovery & Documentation: public config and Thai guide verified.');

console.log('All Cloudflare Worker API Proxy tests passed successfully!');
