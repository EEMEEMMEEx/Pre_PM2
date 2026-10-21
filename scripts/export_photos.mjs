/**
 * NBTC Microwave — Pre-PM Photo Exporter (Node.js)
 * Exports photos stored in data/surveys/*.json directly to the OneDrive photos folder
 * or local photos/ directory.
 *
 * Usage:
 *   node scripts/export_photos.mjs [--folder]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const SURVEYS_DIR = path.resolve(ROOT_DIR, 'data', 'surveys');

// OneDrive destination path if present
const ONEDRIVE_DATA_DIR = path.resolve('C:\\Users\\utai3\\OneDrive\\NBTC Microwave\\Data');
const OUTPUT_DIR = fs.existsSync(ONEDRIVE_DATA_DIR)
  ? path.resolve(ONEDRIVE_DATA_DIR, 'photos')
  : path.resolve(ROOT_DIR, 'photos');

export function exportPhotosFromJson(byFolder = false) {
  if (!fs.existsSync(SURVEYS_DIR)) {
    console.error(`[ERROR] Survey data directory not found: ${SURVEYS_DIR}`);
    process.exit(1);
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log('='.repeat(70));
  console.log(' NBTC Microwave — Pre-PM Photo Exporter');
  console.log('='.repeat(70));
  console.log(` Source Directory : ${SURVEYS_DIR}`);
  console.log(` Target Directory : ${OUTPUT_DIR}`);
  console.log(` Target Storage   : ${OUTPUT_DIR.includes('OneDrive') ? 'Microsoft OneDrive (utai323@gmail.com)' : 'Local Disk'}`);
  console.log(` Folder Structure : ${byFolder ? 'Subfolders per station/recordId' : 'Flat directory'}`);
  console.log('='.repeat(70));

  const files = fs.readdirSync(SURVEYS_DIR).filter((f) => f.endsWith('.json'));
  let totalExported = 0;
  let surveysProcessed = 0;

  for (const f of files) {
    try {
      const content = fs.readFileSync(path.join(SURVEYS_DIR, f), 'utf8');
      const doc = JSON.parse(content);
      const recordId = doc.recordId || doc.id || path.basename(f, '.json');
      const fields = doc.fields || {};
      const stationName = fields.station || fields.stationSelect || doc.station || 'Unknown';
      const photos = doc.photos || fields.photos || [];

      if (!Array.isArray(photos) || photos.length === 0) continue;
      surveysProcessed++;

      let targetSubdir = OUTPUT_DIR;
      if (byFolder) {
        const safeStation = stationName.replace(/[/\\?%*:|"<>]/g, '_');
        targetSubdir = path.join(OUTPUT_DIR, `${recordId}_${safeStation}`);
        if (!fs.existsSync(targetSubdir)) {
          fs.mkdirSync(targetSubdir, { recursive: true });
        }
      }

      photos.forEach((photo, idx) => {
        const cleanName = (photo.name || `photo_${idx + 1}.jpg`).replace(/[/\\?%*:|"<>]/g, '_');
        let base64Str = photo.base64Data || photo.data || '';
        if (!base64Str) {
          if (photo.url && photo.url.includes('base64,')) {
            base64Str = photo.url.split('base64,')[1];
          } else if (photo.dataUrl && photo.dataUrl.includes('base64,')) {
            base64Str = photo.dataUrl.split('base64,')[1];
          }
        }

        if (!base64Str) return;

        const buffer = Buffer.from(base64Str, 'base64');
        const filename = byFolder ? cleanName : `${recordId}_${cleanName}`;
        const destPath = path.join(targetSubdir, filename);

        fs.writeFileSync(destPath, buffer);
        totalExported++;
        const sizeKb = (buffer.length / 1024).toFixed(1);
        console.log(`  [OK] Exported #${totalExported}: ${filename} (${stationName}) [${sizeKb} KB]`);
      });
    } catch (err) {
      console.warn(`[WARN] Failed to process ${f}:`, err.message);
    }
  }

  console.log('='.repeat(70));
  console.log(` [SUCCESS] Successfully exported ${totalExported} photo(s) from ${surveysProcessed} survey(s) to:`);
  console.log(`           ${OUTPUT_DIR}`);
  console.log('='.repeat(70));
}

// Run CLI
const byFolder = process.argv.includes('--folder');
exportPhotosFromJson(byFolder);
