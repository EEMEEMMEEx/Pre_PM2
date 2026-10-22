import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

console.log('Testing Settings UI & Passcode Security Implementation...');

// 1. Check Navbar code ensures standalone GitHub & OneDrive buttons are removed,
// replaced with single Settings button.
const navbarPath = path.resolve('src/components/Navbar.jsx');
const navbarCode = fs.readFileSync(navbarPath, 'utf8');

assert(
  navbarCode.includes('<Settings className='),
  'Navbar should render a Settings gear icon button'
);
assert(
  !navbarCode.includes('OneDrive ซิงค์ (utai323)'),
  'Navbar should NO LONGER have standalone "OneDrive ซิงค์" button'
);
assert(
  !navbarCode.includes('<OneDriveSyncModal'),
  'Navbar should NO LONGER render standalone OneDriveSyncModal directly'
);
assert(
  !navbarCode.includes('<GitHubTokenModal'),
  'Navbar should NO LONGER render standalone GitHubTokenModal directly'
);
assert(
  navbarCode.includes('<SettingsModal'),
  'Navbar should render consolidated SettingsModal'
);
console.log('  [PASS] Navbar consolidation: Standalone buttons removed, Gear icon button added.');

// 2. Check SettingsModal code ensures strict security requirements
const settingsModalPath = path.resolve('src/components/settings/SettingsModal.jsx');
const settingsCode = fs.readFileSync(settingsModalPath, 'utf8');

// Strict password match
assert(
  settingsCode.includes("const REQUIRED_PASSCODE = 'Welcomw@01';") ||
  settingsCode.includes("'Welcomw@01'"),
  'SettingsModal must strictly enforce passcode Welcomw@01'
);

// Input type password
assert(
  settingsCode.includes("type={showPasscode ? 'text' : 'password'}"),
  'SettingsModal must mask input as type="password"'
);

// No localStorage or sessionStorage persistence
assert(
  !settingsCode.includes("localStorage.setItem('settings_unlocked'") &&
  !settingsCode.includes("sessionStorage.setItem('settings_unlocked'") &&
  !settingsCode.includes("localStorage.setItem('isUnlocked'") &&
  !settingsCode.includes("sessionStorage.setItem('isUnlocked'"),
  'SettingsModal must NOT persist unlock status in localStorage or sessionStorage'
);

// Reset on close / dismiss
assert(
  settingsCode.includes('setIsUnlocked(false)') &&
  settingsCode.includes("setPasscodeInput('')"),
  'SettingsModal must reset unlock state and passcodeInput on close/dismiss'
);

// Check Microsoft OneDrive settings panel and removal of GitHub Sync tab
assert(
  settingsCode.includes('Microsoft OneDrive') &&
  !settingsCode.includes("activeTab === 'github'"),
  'SettingsModal must display Microsoft OneDrive settings and remove GitHub Sync tab'
);

console.log('  [PASS] Security verification & session lifecycle rules strictly verified.');
console.log('All Settings Passcode tests passed successfully!');
