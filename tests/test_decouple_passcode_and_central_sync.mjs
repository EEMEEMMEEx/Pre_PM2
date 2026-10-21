import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

console.log('Testing Passcode Decoupling & Centralized Sync Implementation...');

// 1. Verify Passcode Isolation in Navbar.jsx
const navbarCode = fs.readFileSync(path.resolve('src/components/Navbar.jsx'), 'utf8');

// Ensure handleTokenRequired NEVER opens SettingsModal
const handleTokenRequiredMatch = navbarCode.match(/handleTokenRequired\s*=\s*\(([\s\S]*?)\n\s*\}\;/);
assert(handleTokenRequiredMatch, 'handleTokenRequired function must exist in Navbar.jsx');
assert(
  !handleTokenRequiredMatch[0].includes('setIsSettingsModalOpen(true)'),
  'handleTokenRequired MUST NOT call setIsSettingsModalOpen(true)'
);

// Ensure the only callers of setIsSettingsModalOpen(true) are the user gear click handlers
const setOpenMatches = [...navbarCode.matchAll(/setIsSettingsModalOpen\(true\)/g)];
assert.equal(
  setOpenMatches.length,
  2,
  'setIsSettingsModalOpen(true) should only exist in desktop and mobile gear button click handlers'
);

console.log('  [PASS] Passcode Isolation: SettingsModal & Passcode modal strictly isolated from sync events and general operations.');

// 2. Verify Global Backend Token Integration in src/lib/api.js
const apiCode = fs.readFileSync(path.resolve('src/lib/api.js'), 'utf8');

assert(
  apiCode.includes('export async function getOrFetchGitHubToken()'),
  'api.js must export getOrFetchGitHubToken'
);
assert(
  apiCode.includes('fetchServerGitHubToken().catch('),
  'api.js must eagerly trigger fetchServerGitHubToken on client startup'
);
assert(
  apiCode.includes('const ghToken = await getOrFetchGitHubToken();'),
  'api.js must await getOrFetchGitHubToken in write operations'
);
assert(
  apiCode.includes('const token = await getOrFetchGitHubToken();'),
  'api.js must await getOrFetchGitHubToken in syncPendingLocalSurveys'
);

// Verify isStaticHost handles backend ports 8765 and 5173 properly
assert(
  apiCode.includes("port === '8765' || port === '5173'"),
  'isStaticHost must not misclassify backend ports 8765 or 5173 as static hosts'
);

console.log('  [PASS] Global Backend Token Integration: Write operations automatically resolve shared centralized token.');

// 3. Verify Elimination of False-Positive Alerts
assert(
  navbarCode.includes("if (reason === 'no_token') {\n        return;\n      }"),
  'Navbar.jsx must suppress false-positive no_token alert'
);
assert(
  apiCode.includes('if (!serverResult?.saved) {\n        promptGitHubToken(\'no_token\');\n      }'),
  'submitSurvey must suppress promptGitHubToken when server saved successfully'
);
assert(
  apiCode.includes('if (!serverResult?.saved && !serverResult?.updated) {\n        promptGitHubToken(\'no_token\');\n      }'),
  'updateSurvey must suppress promptGitHubToken when server saved/updated successfully'
);
assert(
  apiCode.includes('if (!serverResult?.deleted) {\n        failed.push({ id, reason: \'no_token\' });\n        promptGitHubToken(\'no_token\');\n      }'),
  'deleteSurveys must suppress promptGitHubToken and failed reason when server deleted successfully'
);

console.log('  [PASS] False-Positive Alerts Eliminated: General users can create, update, delete without spurious warnings.');

console.log('All Passcode Decoupling & Centralized Sync tests passed successfully!');
