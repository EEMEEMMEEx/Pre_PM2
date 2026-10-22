#!/usr/bin/env node
/**
 * Cross-platform Wrangler Runner for NBTC Microwave Pre-PM Survey Control Room
 * 
 * Handles:
 * 1. Missing node_modules/wrangler (warns user and falls back seamlessly to npx wrangler)
 * 2. Antigravity IDE / Electron terminal argv quirks via fix-electron.cjs
 * 3. Consistent execution across Windows, Linux, and macOS
 */

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT_DIR = path.resolve(__dirname, '..');
const FIX_ELECTRON = path.resolve(__dirname, 'fix-electron.cjs');

// Try to locate wrangler cli.js in local node_modules
let cliPath = null;
try {
  cliPath = require.resolve('wrangler/wrangler-dist/cli.js');
} catch (e) {
  const directPath = path.resolve(ROOT_DIR, 'node_modules', 'wrangler', 'wrangler-dist', 'cli.js');
  if (fs.existsSync(directPath)) {
    cliPath = directPath;
  }
}

const args = process.argv.slice(2);

if (cliPath && fs.existsSync(cliPath)) {
  const nodeArgs = [];
  if (fs.existsSync(FIX_ELECTRON)) {
    nodeArgs.push('-r', FIX_ELECTRON);
  }
  nodeArgs.push(cliPath, ...args);

  const res = spawnSync(process.execPath, nodeArgs, {
    stdio: 'inherit',
    cwd: ROOT_DIR,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  });
  process.exit(res.status ?? 0);
} else {
  console.warn('\n[!] ไม่พบแพ็กเกจ wrangler ใน node_modules (กรุณารัน "npm install" หากต้องการใช้งานแบบ offline/cached)');
  console.log('[*] กำลังเรียกใช้งานผ่าน npx wrangler แทนโดยอัตโนมัติ...\n');

  const isWin = process.platform === 'win32';
  const npxCmd = isWin ? 'npx.cmd' : 'npx';
  const res = spawnSync(npxCmd, ['wrangler', ...args], {
    stdio: 'inherit',
    cwd: ROOT_DIR,
    shell: isWin,
  });
  process.exit(res.status ?? 0);
}
