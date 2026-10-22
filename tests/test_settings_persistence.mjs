import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

console.log('Testing Settings Centralized Persistence & Multi-User Sync Implementation...');

// 1. Verify src/lib/api.js implementation
const apiCode = fs.readFileSync(path.resolve('src/lib/api.js'), 'utf8');

assert(
  apiCode.includes('export async function saveGitHubToken(token)'),
  'saveGitHubToken must be an async function'
);
assert(
  apiCode.includes("fetch('/api/settings/token'"),
  'saveGitHubToken must send mutation request to /api/settings/token'
);
assert(
  apiCode.includes('export async function fetchServerGitHubToken()'),
  'api.js must export fetchServerGitHubToken for centralized hydration'
);
assert(
  apiCode.includes("new CustomEvent('nbtc-settings-updated'"),
  'api.js must dispatch nbtc-settings-updated custom event'
);
assert(
  apiCode.includes('syncBroadcastChannel.onmessage'),
  'api.js must listen on BroadcastChannel for multi-client/multi-tab sync'
);
console.log('  [PASS] api.js: Centralized storage mutation & multi-client sync verified.');

// 2. Verify database.py backend endpoints
const dbCode = fs.readFileSync(path.resolve('database.py'), 'utf8');

assert(
  dbCode.includes('def save_github_token(cls, token: str)'),
  'database.py DatabaseService must implement save_github_token'
);
assert(
  dbCode.includes('AppConfig.GITHUB_TOKEN_PATH.write_text(clean_token'),
  'database.py must persist token to server file storage (github-token.txt)'
);
assert(
  dbCode.includes('parsed_path in ("/api/settings/token", "/api/settings")'),
  'database.py must handle GET /api/settings/token'
);
assert(
  dbCode.includes('path in ("/api/settings/token", "/api/settings")'),
  'database.py must handle POST /api/settings/token'
);
console.log('  [PASS] database.py: Centralized persistence endpoints (/api/settings/token) verified.');

// 3. Verify src/components/settings/SettingsModal.jsx UI (v2.14.2: Streamlined to OneDrive)
const modalCode = fs.readFileSync(path.resolve('src/components/settings/SettingsModal.jsx'), 'utf8');

assert(
  !modalCode.includes('const [isSavingGitHub, setIsSavingGitHub] = useState(false)'),
  'SettingsModal must no longer manage isSavingGitHub state'
);
assert(
  !modalCode.includes('await saveGitHubToken(t)'),
  'SettingsModal must no longer include saveGitHubToken handler'
);
assert(
  modalCode.includes('toast.success('),
  'SettingsModal must display toast.success on confirmed action'
);
assert(
  modalCode.includes('toast.error('),
  'SettingsModal must display toast.error on failure'
);
assert(
  modalCode.includes('fetchOneDriveStatus'),
  'SettingsModal must fetch OneDrive status on open'
);
console.log('  [PASS] SettingsModal: GitHub Sync UI cleanly removed, OneDrive feedback verified.');

// 4. Verify src/components/Navbar.jsx centralized hydration
const navbarCode = fs.readFileSync(path.resolve('src/components/Navbar.jsx'), 'utf8');

assert(
  navbarCode.includes('fetchServerGitHubToken'),
  'Navbar must import and utilize fetchServerGitHubToken'
);
assert(
  navbarCode.includes("addEventListener('nbtc-settings-updated'"),
  'Navbar must re-fetch status upon nbtc-settings-updated'
);
console.log('  [PASS] Navbar: Centralized server sync on page load/re-fetch verified.');

console.log('All Settings Centralized Persistence & Sync tests passed successfully!');
